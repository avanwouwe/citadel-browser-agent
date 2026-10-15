// Chrome allows a single offscreen document per extension, whatever its url or reason.
// All users go through Offscreen.run so they never overlap and the document is always closed afterwards.
class Offscreen {

    static #queue = Promise.resolve()

    static run(options, task) {
        const result = Offscreen.#queue.then(() => Offscreen.#runExclusive(options, task))
        Offscreen.#queue = result.catch(() => {})
        return result
    }

    static async #runExclusive(options, task) {
        try {
            // a leftover document (e.g. from before a crash) would make createDocument fail
            await Offscreen.#close()
            await chrome.offscreen.createDocument(options)
            return await task()
        } finally {
            await Offscreen.#close()
        }
    }

    static async #close() {
        try {
            if (await chrome.offscreen.hasDocument()) await chrome.offscreen.closeDocument()
        } catch {}
    }
}
