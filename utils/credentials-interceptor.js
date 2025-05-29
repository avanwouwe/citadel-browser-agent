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
})()
