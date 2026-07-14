class Debouncer {
    #delay
    #pending = new Map()
    #mergeFn
    #leading

    constructor(delay, mergeFn = null, leading = false) {
        this.#delay = delay
        this.#mergeFn = mergeFn
        this.#leading = leading
    }

    debounce(key, data, callback) {
        const existing = this.#pending.get(key)

        if (this.#leading) {
            if (existing) return                            // within window → swallow
            const timeout = setTimeout(() => this.#pending.delete(key), this.#delay)
            this.#pending.set(key, { timeout, data })
            try {
                callback(data)
            } catch (error) {
                console.error(`Debounced callback error:`, error)
            }
            return
        }

        if (existing) {
            clearTimeout(existing.timeout)
            data = this.#mergeFn ? this.#mergeFn(existing.data, data) : data
        }
        const timeout = setTimeout(async () => {
            this.#pending.delete(key)
            try { await callback(data) }
            catch (error) { console.error(`Debounced callback error:`, error) }
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
        for (const [_, {timeout}] of this.#pending) {
            clearTimeout(timeout)
        }
        this.#pending.clear()
    }
}


function serialized(fn) {
    let current = null
    let dirty   = false

    function schedule(...args) {
        current = fn(...args).finally(() => {
            if (dirty) {
                dirty = false
                schedule(...args)
            } else {
                current = null
            }
        })
        return current
    }

    return function(...args) {
        if (current) {
            dirty = true
            return current
        }
        return schedule(...args)
    }
}