class Context {
    static isServiceWorker() {
        return typeof window === "undefined" && typeof chrome !== "undefined" && typeof chrome.runtime !== "undefined"
    }

    static isContentScript() {
        return typeof window !== "undefined" && typeof chrome !== "undefined" && typeof chrome.runtime !== "undefined"
    }

    static isPageScript() {
        return typeof window !== "undefined" && (typeof chrome === "undefined" || typeof chrome.runtime === "undefined")
    }

    static {
        if (Context.isPageScript()) window.Context = Context
    }
}