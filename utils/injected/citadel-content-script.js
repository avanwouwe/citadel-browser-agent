injectPageScript('/utils/passwords.js')
injectPageScript('/utils/injected/citadel-page-script.js')

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

function analyzeForm(formElements, submitButton) {
    new SessionState(window.location.origin).load().then(sessionState =>  {
        debug("analyzing form")

        let formUsername, formPassword, formTOTP
        const formHasPassword = formElements.some(elem => elem.type === 'password')

        for (let elem of formElements) {
            if (elem.value === "" || elem.value === undefined || elem.isHidden()) continue

            debug("found element", serializeElement(elem))

            if (elem.type === 'password' || isMFA(elem.name) || isMFA(elem.id) || isMFA(window.location.pathname)) {
                if (isTOTP(elem.value)) {
                    debug("found TOTP", elem.value)

                    formTOTP = elem.value
                    continue
                }
            }

            if (elem.type === 'password' || isPasswordField(elem.name) || isPasswordField(elem.id)) {
                if (! isTOTP(elem.value)) {
                    debug("found password", elem.value)

                    formPassword = elem.value
                    continue
                }
            }

            if (
                (elem.type === 'text' || elem.type === 'email') && (
                    formHasPassword &&  formUsername === undefined ||
                    findAuthPattern(window.location.pathname) &&  (
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
            formUsername = findUsernameInAncestors(submitButton)

            if (formUsername) debug("found username (in page)", formUsername)
        }

        debug("formUsername is ", formUsername)
        debug("formPassword is ", formPassword)
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
                sessionState.setPassword(formPassword)
            }
        }

        if (formTOTP !== undefined) {
            if (sessionState.auth.password === undefined) {
                sessionState.init()
            } else {
                sessionState.setTOTP()
            }
        }

        if (sessionState.auth.username !== undefined && sessionState.auth.password !== undefined) {
            const report = {
                username: sessionState.auth.username,
                password: sessionState.auth.password,
                mfa: sessionState.auth.totp
            }
            chrome.runtime.sendMessage({type: 'account-usage', report})

            if (sessionState.auth.totp) {
                sessionState.init()
            }
        }

        sessionState.save()
    })

}

document.addEventListener('DOMContentLoaded', () => {
    function shallowClone(obj) {
        const clone = {}

        for (const key in obj) {
            const value = obj[key]
            if (typeof value !== 'function') {
                clone[key] = value
            }
        }

        return clone
    }

    document.addEventListener('keydown', function(event) {
        if (event.key === 'Enter') {
            chrome.runtime.sendMessage({type: "user-interaction"})
        }
    }, true)

    window.addEventListener('beforeprint', function() {
        chrome.runtime.sendMessage({type: 'print-dialog'});
    }, true)

    document.addEventListener('change', function(event) {
        if (event.target?.type === 'file') {
            for (const file of event.target.files) {
                chrome.runtime.sendMessage({ type: 'file-select', subtype : 'picked file', file: shallowClone(file)
             })
            }
        }
    }, true)

    document.addEventListener('drop', function(event) {
        Array.from(event.dataTransfer.files).forEach(file => {
            chrome.runtime.sendMessage({ type: 'file-select', subtype : 'dropped file', file: shallowClone(file) })
        })

        Array.from(event.dataTransfer.items).forEach(item => {
            if (item.kind === 'file') {
                const file = item.getAsFile();
                chrome.runtime.sendMessage({ type: 'file-select', subtype : 'dropped file', file: shallowClone(file) })
            }
        })

    }, true)

    window.addEventListener("message", function(event) {
        if (event.source !== window || event.origin !== window.location.origin) return

        if (event.data.type === "request-credential" && event.data.subtype === "public-key") {
            debug("detected use of navigator.credentials API to get public key")
            chrome.runtime.sendMessage({ type: event.data.type, subtype: event.data.subtype })
        }

        if (event.data.type === "request-credential" && event.data.subtype === "password") {
            debug("detected use of navigator.credentials API to get password")
            chrome.runtime.sendMessage({ type: "account-usage", report: event.data.report })
        }

    })


    function clickListener(event) {
        chrome.runtime.sendMessage({type: "user-interaction"})

        let fields = []

        const button = event.target.closest('button, input[type="button"], input[type="submit"]')
        if (
            !button ||
            button.disabled ||
            button.offsetParent === null ||
            button.isHidden()
        ) {
            return
        }

        if (button.form) {
            fields = Array.from(button.form.elements)
        } else {
            // Use the nearest ancestor that contains at least 1 relevant field (but not just the button itself)
            let container = button.parentElement
            while (container && container !== document.body) {
                fields = Array.from(container.querySelectorAll('input[type="text"], input[type="email"], input[type="password"]'))
                if (fields.length > 0 && !fields.includes(button)) break
                container = container.parentElement
            }
        }

        analyzeForm(fields, button)
    }

    document.addEventListener("click", clickListener, true)
    document.shadowRoot?.addEventListener("click", clickListener, true)
}, true)


function serializeElement(elem) {
    const result = {}
    for (const attr of elem.attributes) {
        result[attr.name] = attr.value
    }
    return result
}