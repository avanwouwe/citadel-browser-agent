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

        console.log("TAUPE init auth", this.auth)

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

        console.log("TAUPE loaded", this.auth)
        return this
    }

    async save() {
        console.log("TAUPE saving", this.auth)

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
        this.auth.domain = getDomainFromUsername(username)

        console.log("TAUPE setting username", username, this.auth)
    }

    setPassword(password) {
        this.auth.password = analyzePassword(password)
        this.auth.totp = false

        console.log("TAUPE setting password", password, this.auth)
    }

    setTOTP(isTrue = true) {
        this.auth.totp = isTrue

        console.log("TAUPE setting totp", isTrue, this.auth)
    }

    static async purge() {
        const cutoff = Date.now() - ONE_DAY

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
