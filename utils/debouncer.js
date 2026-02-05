class Debouncer {
    #delay
    #pending = new Map()  // key → {timeout, data}
    #mergeFn

    constructor(delay, mergeFn = null) {
        this.#delay = delay
        this.#mergeFn = mergeFn
    }

    debounce(key, data, callback) {
        const existing = this.#pending.get(key)

        if (existing) {
            clearTimeout(existing.timeout)
            // Merge new data with existing if merge function provided
            data = this.#mergeFn ? this.#mergeFn(existing.data, data) : data
        }

        const timeout = setTimeout(async () => {
            this.#pending.delete(key)
            try {
                await callback(data)
            } catch (error) {
                console.error(`Debounced callback error:`, error)
            }
        }, this.#delay)

        this.#pending.set(key, { timeout, data })
    }

    clear(key) {
        const existing = this.#pending.get(key)
        if (existing) {
            clearTimeout(existing.timeout)
            this.#pending.delete(key)
        }
    }

    clearAll() {
        for (const [key, {timeout}] of this.#pending) {
            clearTimeout(timeout)
        }
        this.#pending.clear()
    }
}