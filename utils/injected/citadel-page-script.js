(function() {
    const originalCredentialsCreate = navigator.credentials.create
    const originalCredentialsGet = navigator.credentials.get

    navigator.credentials.create = async function(options) {
        if (options?.publicKey) {
            window.postMessage({ type: "request-credential", subtype: "public-key" }, "*")
        }
        return originalCredentialsCreate.apply(this, arguments)
    }

    navigator.credentials.get = async function(options) {
        if (options?.publicKey) {
            window.postMessage({ type: "request-credential", subtype: "public-key" }, "*")
        }
        return originalCredentialsGet.apply(this, arguments)
    }


    const originalSubmit = HTMLFormElement.prototype.submit

    HTMLFormElement.prototype.submit = function() {
        const submitButton =
            this.querySelector('button[type="submit"], input[type="submit"]') ||
            this.querySelector('button[type="button"], input[type="button"]') ||
            this.querySelector('button') ||
            this.querySelector('[type="submit"], [type="button"]')

        try {
            analyzeForm(this.elements, submitButton)
        } catch (error) {
            console.error("error while analyzing password", error)
        }

        originalSubmit.apply(this, arguments)
    }
})()
