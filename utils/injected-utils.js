const USERNAME_NAME_REGEX = /(^|[/_.-])(user(name)?|login|e?-?mail|acct|account)([/_.-]|$)/i
const isUsernameField = (str) => USERNAME_NAME_REGEX.test(str)

const PASSWORD_NAME_REGEX = /(^|[/_.-])password([/_.-]|$)/i
const isPasswordField = (str) => PASSWORD_NAME_REGEX.test(str)

const EMAIL_ADDRESS_FORMAT_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u
const isEmailFormat = (str) => EMAIL_ADDRESS_FORMAT_REGEX.test(str)

Element.prototype.isHidden = function() {
    // Check if the element or any parent is hidden
    if (this.type && this.type === "hidden") return true
    if (this.hasAttribute('hidden')) return true

    const style = window.getComputedStyle(this)
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return true

    // Additionally, check if attached to DOM and offsetParent is available
    if (!this.offsetParent && style.position !== "fixed") return true

    return false
}