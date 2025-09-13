class TabState {
    #state = { }
    #handler

    constructor(isForServiceworker = false) {
        if (isForServiceworker) {
            this.#handler = (message, sender, sendResponse) => {
                const state = this.#state[sender.tab.id]?.[message.key]
                sendResponse(state)
            }

            onMessage("GetTabState", this.#handler)
        }
    }

    clear() {
        assert ( this.#handler, "only service worker can set state")

        this.#state = { }
    }

    setState(tabId, key, value) {
        assert ( this.#handler, "only service worker can set state")

        if (tabId === undefined) { return console.error("tabId parameter is required") }

        this.#state[tabId] = this.#state[tabId] || {}
        this.#state[tabId][key] = value
    }

    async getState(key, tabId) {
        if (this.#handler) {
            if (tabId === undefined) { return console.error("tabId parameter is required") }

            return Promise.resolve(this.#state[tabId]?.[key])
        }

        return callServiceWorker("GetTabState", { key })
    }
}

