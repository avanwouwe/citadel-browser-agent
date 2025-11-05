const USERNAME_NAME_REGEX = /(^|[/_.-])(user(name)?|login|e?-?mail|acct|account)([/_.-]|$)/i
const isUsernameField = (str) => USERNAME_NAME_REGEX.test(str)

const PASSWORD_NAME_REGEX = /(^|[/_.-])password([/_.-]|$)/i
const isPasswordField = (str) => PASSWORD_NAME_REGEX.test(str)

const EMAIL_ADDRESS_FORMAT_REGEX = /[^\s@]+@[^\s@]+\.[^\s@]+/u
const findEmailPattern = (str) => str.match(EMAIL_ADDRESS_FORMAT_REGEX)?.[0]

Element.prototype.isHidden = function() {
    // Check if the element is connected to the current document
    if (!this.isConnected) return true

    // Check if the element has a "hidden" type or attribute
    if (this.type === "hidden" || this.hasAttribute('hidden')) return true

    const style = window.getComputedStyle(this);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return true

    // Check if the element has dimensions
    const rect = this.getBoundingClientRect()
    if (rect.width === 0 && rect.height === 0) return true

    // Additionally, check offsetParent (except for position:fixed elements)
    if (!this.offsetParent && style.position !== "fixed") return true

    return false
}

function assert(condition, message) {
    if (!condition) {
        console.trace(message)
        throw new Error(message || "Assertion failed")
    }
}

function debug(message, ...params) {
    console.log("CITADEL : " + message, ...params)
}

function injectPageScripts(scriptPaths, index = 0) {
    if (index >= scriptPaths.length) return

    try {
        const s = document.createElement('script')
        s.src = chrome.runtime.getURL(scriptPaths[index])
        s.type = 'module'
        s.onload = () => {
            s.remove()
            injectPageScripts(scriptPaths, index + 1)
        };
        (document.head || document.documentElement).appendChild(s)
    } catch (e) {
        console.error(e)
    }
}

function shallowClone(obj) {
    const clone = {}

    for (const key in obj) {
        const value = obj[key]
        if (typeof value !== 'function') {
            clone[key] = value
        }
    }

    return clone
}

function domReady() {
    return new Promise(resolve => {
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", resolve, { once: true })
        } else {
            resolve()
        }
    })
}

async function sendMessage(type, message, handler) {
    if (type && typeof type !== 'string') {
        handler = message
        message = type
        type = undefined
    }

    if (message && typeof message !== 'object') {
        handler = message
        message = undefined
    }

    message = message ?? { }
    if (typeof message !== 'object') assert("message must be an object")
    if (message?.type != null) type = message.type
    if (type != null && message != null) message.type = type

    chrome.runtime.sendMessage(message, handler)
}

function sendMessagePromise(type, message) {
    return new Promise((resolve, reject) => {
        sendMessage(type, message, result =>
            result && result.error ? reject(result.error) : resolve(result)
        )
    })
}

async function callServiceWorker(type, message) {
    return new Promise((resolve, reject) => {
        sendMessage(type, message, (response) => {
            if (response.error) {
                reject(response.error)
            } else {
                resolve(response.data)
            }
        })
    })
}