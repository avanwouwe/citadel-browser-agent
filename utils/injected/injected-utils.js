const USERNAME_NAME_REGEX = /(^|[/_.-])(user(name)?|login|e?-?mail|acct|account)([/_.-]|$)/i
const isUsernameField = (str) => USERNAME_NAME_REGEX.test(str)

const PASSWORD_NAME_REGEX = /(^|[/_.-])password([/_.-]|$)/i
const isPasswordField = (str) => PASSWORD_NAME_REGEX.test(str)

const EMAIL_ADDRESS_FORMAT_REGEX = /[^\s@]+@[^\s@]+\.[^\s@]+/u
const findEmailPattern = (str) => str.match(EMAIL_ADDRESS_FORMAT_REGEX)?.[0]

Element.prototype.isHidden = function() {
    // Check if the element or any parent is hidden
    if (this.type === "hidden" || this.hasAttribute('hidden')) return true

    const style = window.getComputedStyle(this)
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return true

    // Additionally, check if attached to DOM and offsetParent is available
    if (!this.offsetParent && style.position !== "fixed") return true

    return false
}

function debug(message, ...params) {
    console.log("CITADEL : " + message, ...params)
}

function injectPageScript(scriptPath) {
    const s = document.createElement('script')
    s.src = chrome.runtime.getURL(scriptPath)
    s.type = 'module'
    s.onload = () => s.remove();
    (document.head || document.documentElement).appendChild(s)
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
