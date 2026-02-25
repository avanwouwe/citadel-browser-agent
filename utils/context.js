class Context {

    static #hasWindow            = () => typeof window !== 'undefined'
    static #isExtensionProtocol  = () => typeof location !== 'undefined' && (location.protocol === 'chrome-extension:' || location.protocol === 'moz-extension:')
    static #hasRuntimeId         = () => !!(typeof chrome !== 'undefined' && chrome?.runtime?.id || typeof browser !== 'undefined' && browser?.runtime?.id)
    static #hasBrowserTabs       = () => !!(typeof chrome !== 'undefined' && chrome.tabs || typeof browser !== 'undefined' && browser.tabs)
    static #isBackgroundPage     = () => !Context.#hasWindow() || typeof browser !== 'undefined' && window === browser.extension?.getBackgroundPage()

    static isServiceWorker = () =>
        Context.#hasRuntimeId() &&
        Context.#hasBrowserTabs() &&
        Context.#isBackgroundPage()

    static isExtensionPage = () =>
        Context.#hasWindow() &&
        Context.#isExtensionProtocol() &&
        Context.#hasRuntimeId() &&
        Context.#hasBrowserTabs() &&
        !Context.#isBackgroundPage()

    static isOffscreenPage = () =>
        Context.#hasWindow() &&
        Context.#isExtensionProtocol() &&
        Context.#hasRuntimeId() &&
        !Context.#hasBrowserTabs()

    static isContentScript = () =>
        Context.#hasWindow() &&
        !Context.#isExtensionProtocol() &&
        Context.#hasRuntimeId()

    static isPageScript = () =>
        Context.#hasWindow() &&
        !Context.#isExtensionProtocol() &&
        !Context.#hasRuntimeId()
}