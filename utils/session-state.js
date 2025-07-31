class SessionState {
    static #STORAGE_KEY = 'session-state-'

    origin

    #getKey = () => SessionState.#STORAGE_KEY + this.origin

    #lastSaved = Date.now()

    auth

    constructor(origin) {
        if (origin === undefined) throw new Error("must define origin")

        this.origin = origin
        this.init()
    }

    init() {
        this.auth = {
            username: undefined,
            domain: undefined,
            password: undefined,
            totp: false,
        }

        return this
    }

    async load() {
        this.init()

        try {
            const key = this.#getKey()
            const state = (await chrome.storage.local.get(key))?.[key]

            if (state?.auth) {
                this.auth = state.auth
            }
        } catch (e) {
            console.error("cannot get session state", e)
        }

        debug("session state loaded", this.auth)
        return this
    }

    async save() {
        debug("session state saving", this.auth)

        this.#lastSaved = Date.now()

        try {
            await chrome.storage.local.set({[this.#getKey()]: {
                lastSaved: this.#lastSaved,
                auth: this.auth
            }})
        } catch (e) {
            console.error("cannot save state", e)
        }
    }

    setUsername(username) {
        this.init()
        this.auth.username = username
        this.auth.domain = PasswordCheck.getDomainFromUsername(username)

        debug("session state setting username", username, this.auth)
    }

    setPassword(username, password) {
        this.auth.password = PasswordCheck.analyzePassword(username, password)
        this.auth.totp = false

        debug("session state setting password", this.auth)
    }

    setTOTP(isTrue = true) {
        this.auth.totp = isTrue

        debug("session state setting TOTP", isTrue, this.auth)
    }

    static async purge() {
        debug("purging session state")

        const cutoff = Date.now() - 4 * ONE_HOUR

        try {
            const allItems = await chrome.storage.local.get(null)
            const keysToRemove = []

            for (const [key, value] of Object.entries(allItems)) {
                if (key.startsWith(SessionState.#STORAGE_KEY)) {
                    if (value && typeof value.lastSaved === 'number' && value.lastSaved < cutoff) {
                        keysToRemove.push(key)
                    }
                }
            }

            if (keysToRemove.length) {
                await chrome.storage.local.remove(keysToRemove)
            }
        } catch (e) {
            console.error("Failed to purge old state entries", e)
        }
    }
}
