injectPageScript('/utils/injected/bundle/citadel-bundle-idle.js')

listeners.clickListener = function(event) {
    sendMessage("user-interaction")

    const button = event.target.closest('button, input[type="button"], input[type="submit"]')
    if (button && !button.disabled && button.offsetParent != null && ! button.isHidden()) {
        checkLogin(event, button)
    }
}

listeners.keyListener = function(event) {
    if (event.key === 'Enter') {
        sendMessage("user-interaction")

        if  (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA' || event.target.tagName === 'BUTTON') {
            checkLogin(event, event.target)
        }
    }
}

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

const system = window.location.origin
let sessionState
new SessionState(system).load().then(obj => sessionState = obj)

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
            composed: event.composed,
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
            keyCode:  { value: event.keyCode,  writable: false, enumerable: true },
            which:    { value: event.which,    writable: false, enumerable: true },
            charCode: { value: event.charCode, writable: false, enumerable: true },
        })

        synthEvent.syntheticCitadelEvent = true
        target.dispatchEvent(synthEvent)

        // isTrusted=false blocks browser default action for keyboard events
        // synthetic keydown above handles SPAs that listen for keydown Enter explicitly
        // click below handles native forms and SPAs that don't
        // guard: only click if target is an input field, not a button, to avoid double submit
        const form = target.closest("form")

        const submitButton =
            // 1. explicit submit in a real form
            form?.querySelector('[type="submit"], button:not([type="button"])')
            // 2. SPA: walk up to find nearest ancestor that contains a submit-like button
            ?? target.closest("div, section, main, article, [role='dialog'], [role='main']")
                ?.querySelector('[type="submit"], button:not([type="button"])')

        if (submitButton) {
            const clickEvent = new MouseEvent("click", {
                bubbles: true,
                cancelable: true,
            })
            clickEvent.syntheticCitadelEvent = true
            submitButton.dispatchEvent(clickEvent)
        }

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

checkLogin = async function(event, button) {
    if (event.syntheticCitadelEvent) return

    const fields = findFormElements(button)
    const loginForm = analyzeForm(fields, button)

    if (loginForm?.password) {
        // if this is the first time we're connecting to the site, first check if the password is reused (could be phishing)
        if (PasswordCheck.isFirstConnection(loginForm.username)) {
            try {
                event.preventDefault()
                event.stopImmediatePropagation()

                const encryptionKey = await SecureMessage.getPublicKey()
                const report = await SecureMessage.sendMessage("AuditPassword", loginForm, encryptionKey)
                if (report.password.reuse) {
                    await sendMessage("warn-reuse", { report })
                    await callServiceWorker("DeletePassword", { username: loginForm.username })
                    return
                }
            } catch (error) {
                console.error('exception when analyzing login', error.stack)
            }

            repeatEvent(event, button)
        }

        try {
            const encryptionKey = await SecureMessage.getPublicKey()
            await SecureMessage.sendMessage("AccountUsage",{ subtype: "password", username: loginForm.username, password: loginForm.password }, encryptionKey)
        } catch (error) {
            console.error('exception when analyzing login', error.stack)
        }
    }

    if (loginForm?.totp) sendMessage("receive-totp")
}

function analyzeForm(formElements, eventElement) {
    formElements = formElements.filter(elem => elem.value?.length < 100 && ! PasswordCheck.isCreditCard(elem.value))

    let username, password, totp
    const formHasPassword = formElements.some(elem => elem.type === 'password')

    for (let elem of formElements) {
        if (elem.value === "" || elem.value === undefined || elem.isHidden()) continue

        if (elem.type === 'password' || MFACheck.isMFA(elem.name) || MFACheck.isMFA(elem.id) || MFACheck.isMFA(window.location.pathname)) {
            if (MFACheck.isTOTP(elem.value)) {
                debug("found TOTP", elem.value)

                totp = elem.value
                continue
            }
        }

        if (elem.type === 'password' || isPasswordField(elem.name) || isPasswordField(elem.id)) {
            if (! MFACheck.isTOTP(elem.value) && !PasswordCheck.isMasked(elem.value)) {
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

    username = PasswordCheck.maskIfSecret(username)

    debug("form username is ", username)
    debug("form password is ", password ? "<masked>" : undefined)
    debug("form TOTP is ", totp)

    if (username !== undefined) sessionState.setUsername(username)
    if (password !== undefined) sessionState.setPassword()
    if (totp !== undefined) sessionState.setTOTP()

    if (sessionState.auth.password === undefined) return
    if (password === undefined && totp === undefined) return

    const login = {
        username: sessionState.auth.username,
        password,
        totp: sessionState.auth.totp
    }

    if (sessionState.auth.totp) {
        sessionState.init()
    }

    sessionState.save()

    return login
}