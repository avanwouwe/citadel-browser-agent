class PersistentObject {

    #persistentObject;
    #storageKey;
    #interval;
    #timer;

    #MAX_LIFETIME_SERVICE_WORKER = 20 * ONE_SECOND;   // it looks like native messaging prevents worker termination, but theoretically  https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle

    constructor(storageKey, object = { }, interval = this.#MAX_LIFETIME_SERVICE_WORKER) {
        this.#persistentObject = new ChangeTrackingObject(object);
        this.#storageKey = 'persistent-object-' + storageKey;
        this.#interval = interval;
        this.start();
    }

    value() { return this.#persistentObject; }

    start() {
        if (this.#timer) return;
        this.#readFromStorage()
        this.#timer = setInterval(() => this.#saveToStorage(), this.#interval);
    }

    stop() {
        if (this.#timer) {
            clearInterval(this.#timer);
            this.#timer = null;
        }
    }

    markDirty(bool = true) { this.#persistentObject.isDirty = bool }

    clear() {
        this.#persistentObject.isDirty = false

        chrome.storage.local.remove(this.#storageKey, () => {
            if (chrome.runtime.lastError) {
                console.error(chrome.runtime.lastError);
            }
        });
    }

    #saveToStorage() {
        if (this.#persistentObject.isDirty) {
            this.#persistentObject.isDirty = false;

            const object = { ...this.#persistentObject };
            delete object.isDirty;

            chrome.storage.local.set({ [this.#storageKey]: object }, () => {
                if (chrome.runtime.lastError) {
                    console.error('Error setting item:', chrome.runtime.lastError);
                }
            });
        }
    }

    #readFromStorage() {
        chrome.storage.local.get([this.#storageKey], (result) => {
            if (chrome.runtime.lastError) {
                console.error('Error getting item:', chrome.runtime.lastError);
            } else {
                const storedData = result[this.#storageKey];
                if (storedData) {
                    storedData.copyTo(this.#persistentObject)
                    this.#persistentObject.isDirty = false;
                }
            }
        });
    }

    static clearAll() {
        chrome.storage.local.clear()
        chrome.runtime.reload()
    }
}

class ChangeTrackingObject {

    constructor(initialValues = {}) {
        const handler = {
            set: (target, property, value) => {
                if (property === 'isDirty') {
                    target[property] = value;
                    return true
                }

                if (target[property] !== value) {
                    target.isDirty = true;
                    target[property] = value;
                    return true;
                }

                return true;
            },
            get: (target, property) => {
                return target[property];
            },
            deleteProperty: (target, property) => {
                target.isDirty = true;
                return delete target[property];
            }

        };

        // Create the target object with initial values
        const target = { ...initialValues };

        // Create a proxy to intercept property changes
        const proxy = new Proxy(target, handler);
        proxy.isDirty = false;
        return proxy;
    }

}

Object.prototype.copyTo = function(target) {
    Object.keys(this).forEach(key => {
        target[key] = this[key];
    });

    for (const key in target) {
        if (! Object.hasOwnProperty.call(this, key)) {
            delete target[key];
        }
    }

}