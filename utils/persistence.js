class HydratedObject {

    #storageKey
    #target
    #hydrate
    #dehydrate
    #readyPromise
    #readyResolve

    constructor(storageKey, target, hydrate, dehydrate) {
        this.#storageKey = storageKey
        this.#target = target
        this.#hydrate = hydrate
        this.#dehydrate = dehydrate

        this.#readyPromise = new Promise(resolve => this.#readyResolve = resolve)
        this.load()
    }

    async ready() {
        return this.#readyPromise
    }

    async save() {
        try {
            const data = this.#dehydrate(this.#target)
            await chrome.storage.local.set({ [this.#storageKey]: data })
        } catch (error) {
            console.error('Error saving to storage:', error)
        }
    }

    async load() {
        try {
            const result = await chrome.storage.local.get(this.#storageKey)
            const stored = result[this.#storageKey]

            if (stored != null) {
                this.#hydrate(stored, this.#target)
            }
        } catch (error) {
            console.error('Error loading from storage:', error)
        } finally {
            this.#readyResolve?.(this)
            this.#readyResolve = null
        }
    }

    async clear() {
        try {
            await chrome.storage.local.remove(this.#storageKey)
        } catch (error) {
            console.error('Error clearing storage:', error)
        }
    }
}


class PersistentObject {

    #value
    #storage
    #interval
    #timer

    #MAX_LIFETIME_SERVICE_WORKER = 20 * 1000

    constructor(storageKey, initialValue = {}, interval = this.#MAX_LIFETIME_SERVICE_WORKER) {
        this.#interval = interval
        this.#value = new ChangeTrackingObject(initialValue)

        this.#storage = new HydratedObject(
            `persistent-object-${storageKey}`,
            this.#value,
            (data, target) => {
                data.copyTo(target)
                target.isDirty = false
            },
            (target) => {
                const data = { ...target }
                delete data.isDirty
                return data
            }
        )

        this.start()
    }

    value() {
        return this.#value
    }

    async start() {
        if (!this.#timer) {
            await this.#storage.ready()
            this.#timer = setInterval(() => this.flush(), this.#interval)
        }
    }

    stop() {
        if (this.#timer) {
            clearInterval(this.#timer)
            this.#timer = null
        }
    }

    async ready() {
        return this.#storage.ready().then(() => this)
    }

    markDirty(bool = true) {
        this.#value.isDirty = bool
    }

    async clear() {
        await this.#storage.clear()
        this.#value.clear()
    }

    async flush() {
        if (!this.#value.isDirty) return

        this.#value.isDirty = false
        await this.#storage.save()
    }
}

class ChangeTrackingObject {

    #proxy

    static #handler = {
        set: (target, property, value) => {
            if (property === 'isDirty') {
                target[property] = value
                return true
            }

            if (target[property] !== value) {
                target.isDirty = true
                target[property] = value
                return true;
            }

            return true;
        },
        get: (target, property) => {
            return target[property]
        },
        deleteProperty: (target, property) => {
            target.isDirty = true
            return delete target[property]
        }
    }

    constructor(initialValues = {}) {
        // Create the target object with initial values
        const target = { ...initialValues }

        // Create a proxy to intercept property changes
        this.#proxy = new Proxy(target, ChangeTrackingObject.#handler)
        this.#proxy.isDirty = false
        Object.defineProperty(this.#proxy, 'clear', {
            value: this.clear.bind(this),
            enumerable: false,
            writable: false,
            configurable: false
        })
        return this.#proxy
    }

    clear(){
        Object.keys(this.#proxy).forEach(key => {
            delete this[key]
        })
        this.#proxy.isDirty = true
    }

}

Object.prototype.copyTo = function(target) {
    Object.keys(this).forEach(key => {
        target[key] = this[key]
    })

    for (const key in target) {
        if (! Object.hasOwnProperty.call(this, key)) {
            delete target[key]
        }
    }

}