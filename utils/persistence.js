class PersistentObject {

    #persistentObject
    #storageKey
    #interval
    #timer
    #readyPromise
    #readyResolve

    #MAX_LIFETIME_SERVICE_WORKER = 20 * ONE_SECOND

    constructor(storageKey, object = {}, interval = this.#MAX_LIFETIME_SERVICE_WORKER) {
        this.#persistentObject = new ChangeTrackingObject(object)
        this.#storageKey = 'persistent-object-' + storageKey
        this.#interval = interval

        this.#readyPromise = new Promise(resolve => this.#readyResolve = resolve)

        this.start()
    }

    value() { return this.#persistentObject }

    async start() {
        if (!this.#timer) {
            this.#readFromStorage()
            this.#timer = setInterval(() => this.flush(), this.#interval)
        }

        return this.#readyPromise
    }

    stop() {
        if (this.#timer) {
            clearInterval(this.#timer)
            this.#timer = null
        }

        this.#readyPromise = null
    }

    async ready() {
        return this.#readyPromise
    }

    markDirty(bool = true) { this.#persistentObject.isDirty = bool }

    async clear() {
        await chrome.storage.local.remove(this.#storageKey, () => {
            if (chrome.runtime.lastError) {
                console.error(chrome.runtime.lastError)
            }
            this.#persistentObject.clear()
        })
    }

    async flush() {
        if (this.#persistentObject.isDirty) {
            this.#persistentObject.isDirty = false
            const object = { ...this.#persistentObject }
            delete object.isDirty

            await chrome.storage.local.set({ [this.#storageKey]: object }, () => {
                if (chrome.runtime.lastError) {
                    console.error('Error setting item:', chrome.runtime.lastError)
                }
            })
        }
    }

    #readFromStorage() {
        chrome.storage.local.get([this.#storageKey], (result) => {
            if (chrome.runtime.lastError) {
                console.error('Error getting item:', chrome.runtime.lastError)
            } else {
                const storedData = result[this.#storageKey]
                if (storedData) {
                    storedData.copyTo(this.#persistentObject)
                    this.#persistentObject.isDirty = false
                }
            }
            if (this.#readyResolve) {
                this.#readyResolve(this)
                this.#readyResolve = null
            }
        })
    }

    static clearAll() {
        chrome.storage.local.clear()
        chrome.runtime.reload()
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