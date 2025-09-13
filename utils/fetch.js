class Fetch {

    static #requests = { }

    // N.B. the chrome.runtime.sendMessage() port remains open for max 30 seconds, so the native agent times out after 20 seconds
    // this one minute timeout is just so that we can periodically clean up timed-out requests
    static #TIMEOUT = ONE_MINUTE

    static page(url) {
        const request = Fetch.#requests[url]

        if (request) return request.promise

        let resolveFn, rejectFn
        const promise = new Promise((resolve, reject) => {
            resolveFn = resolve
            rejectFn = reject
        })

        Fetch.#requests[url] = {
            expires: Date.now() + this.#TIMEOUT,
            promise,
            resolveFn,
            rejectFn
        }

        Port.postMessage("fetch", { url })

        return promise
    }

    static {
        setInterval(() => {
            Object.entries(Fetch.#requests).forEach((url, request) => {
                if (request.expires <= Date.now()) {
                    delete Fetch.#requests[url]
                }
            })
        }, ONE_DAY)

        Port.onMessage("fetch", (message) => {
            debug("received fetch result", { url: message.url, status: message.status, ok: message.ok })

            const url = message.url
            const page = Fetch.#requests[url]
            if (page) {
                if (message.ok) {
                    page.resolveFn && page.resolveFn(message)
                } else {
                    page.rejectFn && page.rejectFn(new Error("fetch error"))
                }
                delete Fetch.#requests[url]
            }
        })
    }

}