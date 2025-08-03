injectPageScripts(['/utils/injected/bundle/citadel-bundle.js'])

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

function serializeElement(elem) {
    const result = {}
    for (const attr of elem.attributes) {
        result[attr.name] = attr.value
    }
    return result
}

async function analyzeForm(formElements, eventElement) {
    const origin = window.location.origin

    return new SessionState(origin).load().then(async sessionState =>  {
        debug("analyzing form")

        let formUsername, formPassword, formTOTP
        const formHasPassword = formElements.some(elem => elem.type === 'password')

        for (let elem of formElements) {
            if (elem.value === "" || elem.value === undefined || elem.isHidden()) continue

            debug("found element", serializeElement(elem))

            if (elem.type === 'password' || MFACheck.isMFA(elem.name) || MFACheck.isMFA(elem.id) || MFACheck.isMFA(window.location.pathname)) {
                if (MFACheck.isTOTP(elem.value)) {
                    debug("found TOTP", elem.value)

                    formTOTP = elem.value
                    continue
                }
            }

            if (elem.type === 'password' || isPasswordField(elem.name) || isPasswordField(elem.id)) {
                if (! MFACheck.isTOTP(elem.value)) {
                    debug("found password")

                    formPassword = elem.value
                    continue
                }
            }

            if ((elem.type === 'text' || elem.type === 'email') && (
                    formHasPassword && formUsername === undefined ||
                    MFACheck.findAuthPattern(window.location.pathname) &&  (
                        isUsernameField(elem.name) ||
                        isUsernameField(elem.id) ||
                        findEmailPattern(elem.value)
                    )
                )
            ) {
                debug("found username (in form)", elem.value)
                formUsername = elem.value
            }
        }

        if (formUsername === undefined && formHasPassword) {
            formUsername = findUsernameInAncestors(eventElement)

            if (formUsername) debug("found username (in page)", formUsername)
        }

        debug("formUsername is ", formUsername)
        debug("formPassword is ", formPassword ? "<masked>" : undefined)
        debug("formTOTP is ", formTOTP)

        if (formUsername === undefined && formPassword === undefined && formTOTP === undefined) return

        if (formUsername !== undefined) {
            sessionState.setUsername(formUsername)
        }

        if (formPassword !== undefined) {
            if (sessionState.auth.username === undefined) {
                sessionState.init()
                return
            } else {
                await sessionState.setPassword(formUsername, formPassword)
            }
        }

        if (formTOTP !== undefined) {
            if (sessionState.auth.password === undefined) {
                sessionState.init()
            } else {
                sessionState.setTOTP()
            }
        }

        if (sessionState.auth.password === undefined) {
            await sessionState.save()
            return
        }

        const report = {
            username: sessionState.auth.username,
            password: sessionState.auth.password,
            mfa: sessionState.auth.totp
        }

        sendMessage("account-usage", { report })

        const passwordReuse = await callServiceWorker("CheckPasswordReuse", {
            username: report.username,
            password: report.password.hash,
            system: origin
        })

        if (sessionState.auth.totp) {
            sessionState.init()
        }

        return passwordReuse
    })
}

document.addEventListener('DOMContentLoaded', () => {
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

    document.addEventListener('keydown', function(event) {
        if (event.key === 'Enter') {
            sendMessage("user-interaction")
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

    async function clickListener(event) {
        sendMessage("user-interaction")

        const button = event.target.closest('button, input[type="button"], input[type="submit"]')
        if (
            !button ||
            button.disabled ||
            button.offsetParent === null ||
            button.isHidden()
        ) {
            return
        }

        const fields = findFormElements(button)
        if (fields.length > 0) {
            const passwordReuse = await analyzeForm(fields, button)
        }
    }

    document.addEventListener("click", clickListener, true)
    document.shadowRoot?.addEventListener("click", clickListener, true)

    document.addEventListener('keydown', async function(event) {
        if (event.key === 'Enter' &&
            (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA' || event.target.tagName === 'BUTTON')
        ) {
            const fields= findFormElements(event.target)
            const passwordReuse = await analyzeForm(fields, event.target)
        }
    })

}, true)
