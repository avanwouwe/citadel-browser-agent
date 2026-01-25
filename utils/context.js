class Context {
    static isServiceWorker() {
        return typeof chrome !== 'undefined' &&
            chrome.runtime &&
            chrome.tabs &&
            (typeof window === 'undefined'  || typeof browser !== 'undefined' && window === browser.extension?.getBackgroundPage())
    }

    static isContentScript() {
        if (this.isServiceWorker()) return false

        const isExtensionPage =
            typeof location !== 'undefined' &&
            (location.protocol === 'chrome-extension:' || location.protocol === 'moz-extension:')
        const hasExtensionId =
            (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) ||
            (typeof browser !== 'undefined' && browser.runtime && browser.runtime.id);

        return hasExtensionId && !isExtensionPage
    }

    static isPageScript() {
        return ! this.isServiceWorker() && ! this.isContentScript()
    }
}