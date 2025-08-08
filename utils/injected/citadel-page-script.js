(function() {
    const originalCredentialsCreate = navigator.credentials.create
    const originalCredentialsGet = navigator.credentials.get

    navigator.credentials.create = async function(options) {
        try {
            if (options?.publicKey) {
                window.postMessage({ type: "request-credential", subtype: "public-key" }, "*")
            }
        } catch (error) {
            console.error("error while analyzing credentials", error)
        }

        return originalCredentialsCreate.apply(this, arguments)
    }

    navigator.credentials.get = async function(options) {
        const credentials = await originalCredentialsGet.apply(this, arguments)

        try {
            if (options?.password) {
                if (credentials && credentials.type === "password" && credentials.id && credentials.password) {
                    const report = {
                        username: credentials.id,
                        password: PasswordCheck.analyzePassword(credentials.id, credentials.password),
                        mfa: false
                    }

                    window.postMessage({ type: "request-credential", subtype: "password", report }, "*")
                }
            } else if (options?.publicKey) {
                window.postMessage({ type: "request-credential", subtype: "public-key" }, "*")
            }
        } catch (error) {
            console.error("error while analyzing credentials", error)
        }

        return credentials
    }
})()
