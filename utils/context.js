class Context {

    static #hasWindow            = () => typeof window !== 'undefined'
    static #isExtensionProtocol  = () => typeof location !== 'undefined' && (location.protocol === 'chrome-extension:' || location.protocol === 'moz-extension:')
    static #hasRuntimeId         = () => !!(typeof chrome !== 'undefined' && chrome?.runtime?.id || typeof browser !== 'undefined' && browser?.runtime?.id)
    static #hasBrowserTabs       = () => !!(typeof chrome !== 'undefined' && chrome.tabs || typeof browser !== 'undefined' && browser.tabs)
    static #isServiceWorkerScope = () => typeof ServiceWorkerGlobalScope !== 'undefined' && self instanceof ServiceWorkerGlobalScope

    static isServiceWorker = () =>
        Context.#isServiceWorkerScope()

    static isExtensionPage = () =>
        Context.#hasWindow() &&
        Context.#isExtensionProtocol() &&
        Context.#hasRuntimeId() &&
        Context.#hasBrowserTabs()

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