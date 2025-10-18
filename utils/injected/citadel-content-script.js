injectPageScripts(['/utils/injected/bundle/citadel-bundle.js'])

document.addEventListener("click", clickListener, true)
document.shadowRoot?.addEventListener("click", clickListener, true)

document.addEventListener('keydown', function(event) {
    if (event.key === 'Enter') {
        sendMessage("user-interaction")

        if  (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA' || event.target.tagName === 'BUTTON') {
            checkLogin(event, event.target)
        }
    }
}, true)

window.addEventListener('beforeprint', function() {
    sendMessage("print-dialog")
}, true)

document.addEventListener('change', function(event) {
    if (event.target?.type === 'file') {
        for (const file of event.target.files) {
            sendMessage('file-select', { subtype : 'picked file', file: cloneFile(file)
         })
        }
    }
}, true)

document.addEventListener('drop', function(event) {
    Array.from(event.dataTransfer.files).forEach(file => {
        sendMessage('file-select', { subtype: 'dropped file', file: cloneFile(file) })
    })

    Array.from(event.dataTransfer.items).forEach(item => {
        if (item.kind === 'file') {
            const file = item.getAsFile();
            sendMessage('file-select', { subtype: 'dropped file', file: cloneFile(file) })
        }
    })
}, true)

window.addEventListener("message", function(event) {
    if (event.source !== window || event.origin !== window.location.origin) return

    if (event.data.type === "request-credential" && event.data.subtype === "public-key") {
        debug("detected use of navigator.credentials API to get public key")
        sendMessage(event.data.type, { subtype: event.data.subtype })
    }

    if (event.data.type === "request-credential" && event.data.subtype === "password") {
        debug("detected use of navigator.credentials API to get password")
        sendMessage("account-usage", { report: event.data.report })
    }

})

const system = window.location.origin
let sessionState
new SessionState(system).load().then(obj => sessionState = obj)

function clickListener(event) {
    sendMessage("user-interaction")

    const button = event.target.closest('button, input[type="button"], input[type="submit"]')
    if (button && !button.disabled && button.offsetParent != null && ! button.isHidden()) {
        checkLogin(event, button)
    }
}

function cloneFile(file) {
    const clone = shallowClone(file)
    delete clone.lastModifiedDate

    try {
        clone.lastModified = new Date(clone.lastModified).toISOString()
    } catch {
        delete clone.lastModified
    }

    return clone
}

function findFormElements(element) {
    if (element.form) {
        return Array.from(element.form.elements)
    }

    // Use the nearest ancestor that contains at least one relevant input field (password, e-mail, etc)
    let fields = []
    let container = element.parentElement ?? document.body
    do {
        fields = Array.from(container.querySelectorAll('input[type="text"], input[type="email"], input[type="password"]'))
        if (fields.length > 0 && !fields.includes(element)) break
        container = container.parentElement
    } while (container && container !== document.body)

    return fields
}

function findUsernameInAncestors(startNode) {
    let node = startNode?.parentElement

    while (node && node !== document.body) {
        const walker = document.createTreeWalker(node, NodeFilter.SHOW_ELEMENT, null)
        let el = walker.currentNode

        while (el) {
            if (el.offsetParent === null) { // skip hidden elements
                el = walker.nextNode()
                continue
            }
            if (el.children.length === 0) { // only leaf nodes
                let text = el.textContent.trim()
                if (text && text.length <= 100) {
                    const email = findEmailPattern(text)
                    if (email) return email
                }
            }
            el = walker.nextNode()
        }
        node = node.parentElement
    }

    return null
}

function repeatEvent(event, target) {
    if (event.type === "keydown" || event.type === "keyup" || event.type === "keypress") {
        const synthEvent = new KeyboardEvent(event.type, {
            bubbles: true,
            cancelable: true,
            key: event.key,
            code: event.code,
            location: event.location,
            ctrlKey: event.ctrlKey,
            shiftKey: event.shiftKey,
            altKey: event.altKey,
            metaKey: event.metaKey,
            repeat: event.repeat,
            isComposing: event.isComposing
        })

        Object.defineProperties(synthEvent, {
            keyCode: { value: event.keyCode },
            which: { value: event.which },
            charCode: { value: event.charCode },
        })

        synthEvent.syntheticCitadelEvent = true
        target.dispatchEvent(synthEvent)
        return
    }

    if (event.type === "click") {
        let synthEvent

        if (window.PointerEvent && event instanceof PointerEvent) {
            synthEvent = new PointerEvent("click", {
                bubbles: true,
                cancelable: true,
                composed: true,
                clientX: event.clientX,
                clientY: event.clientY,
                screenX: event.screenX,
                screenY: event.screenY,
                pageX: event.pageX,
                pageY: event.pageY,
                button: event.button,
                buttons: event.buttons,
                ctrlKey: event.ctrlKey,
                shiftKey: event.shiftKey,
                altKey: event.altKey,
                metaKey: event.metaKey,
                pointerId: event.pointerId,
                width: event.width,
                height: event.height,
                pressure: event.pressure,
                tiltX: event.tiltX,
                tiltY: event.tiltY,
                pointerType: event.pointerType,
                isPrimary: event.isPrimary,
            })
        } else {
            synthEvent = new MouseEvent("click", {
                bubbles: true,
                cancelable: true,
                clientX: event.clientX,
                clientY: event.clientY,
                screenX: event.screenX,
                screenY: event.screenY,
                pageX: event.pageX,
                pageY: event.pageY,
                button: event.button,
                buttons: event.buttons,
                ctrlKey: event.ctrlKey,
                shiftKey: event.shiftKey,
                altKey: event.altKey,
                metaKey: event.metaKey,
            })
        }

        synthEvent.syntheticCitadelEvent = true
        target.dispatchEvent(synthEvent)
    }
}

async function checkLogin(event, button) {
    const fields = findFormElements(button)
    const loginForm = analyzeForm(fields, button)
    if (loginForm?.password == null || event.syntheticCitadelEvent) {
        return
    }

    if (PasswordCheck.isFirstConnection(loginForm.username)) {
        try {
            event.preventDefault()
            event.stopImmediatePropagation()

            loginForm.password.reuse = await loginForm.password.reuse
            if (loginForm.password.reuse) {
                sendMessage("warn-reuse", { report: loginForm })
                callServiceWorker("DeletePassword", { username: loginForm.username, system })
            }
        } catch (error) {
            console.error('exception when analyzing login', error.stack)
            repeatEvent(event, button)
        }
        return
    }

    loginForm.password.reuse = await loginForm.password.reuse
    sendMessage("account-usage", { report: loginForm })
    if (loginForm.totp) sendMessage("receive-totp")
}

function analyzeForm(formElements, eventElement) {
    let username, password, TOTP
    const formHasPassword = formElements.some(elem => elem.type === 'password')

    for (let elem of formElements) {
        if (elem.value === "" || elem.value === undefined || elem.isHidden()) continue

        if (elem.type === 'password' || MFACheck.isMFA(elem.name) || MFACheck.isMFA(elem.id) || MFACheck.isMFA(window.location.pathname)) {
            if (MFACheck.isTOTP(elem.value)) {
                debug("found TOTP", elem.value)

                TOTP = elem.value
                continue
            }
        }

        if (elem.type === 'password' || isPasswordField(elem.name) || isPasswordField(elem.id)) {
            if (! MFACheck.isTOTP(elem.value)) {
                    debug("found password")

                password = elem.value
                continue
            }
        }

        if ((elem.type === 'text' || elem.type === 'email') && (
            formHasPassword && username === undefined ||
            MFACheck.findAuthPattern(window.location.pathname) &&  (
                isUsernameField(elem.name) ||
                isUsernameField(elem.id) ||
                findEmailPattern(elem.value)
            )
        )
        ) {
            debug("found username (in form)", elem.value)
            username = elem.value
        }
    }

    if (username === undefined && formHasPassword) {
        username = findUsernameInAncestors(eventElement)
    }

    debug("form username is ", username)
    debug("form password is ", password ? "<masked>" : undefined)
    debug("form TOTP is ", TOTP)

    if (username !== undefined) sessionState.setUsername(username)
    if (password !== undefined) sessionState.setPassword()
    if (TOTP !== undefined) sessionState.setTOTP()

    if (sessionState.auth.password === undefined) return
    if (password === undefined && TOTP === undefined) return

    const login = {
        username: sessionState.auth.username,
        password: undefined,
        totp: sessionState.auth.totp
    }

    if (password) {
        login.password = PasswordCheck.analyzePassword(sessionState.auth.username, password)

        const salt = PasswordCheck.getSalt()
        if (salt) {
            login.password.reuse = PBKDF2.hash(password, salt).then(hashed => {
                return callServiceWorker("CheckPasswordReuse", {
                    username: login.username,
                    password: hashed,
                    system
                })
            })
        }
    }

    if (sessionState.auth.totp) {
        sessionState.init()
    }

    sessionState.save()

    return login
}