class ColorScheme {

    static LIGHT = 'light'
    static DARK = 'dark'

    static #hasDom = typeof self !== 'undefined' && typeof self.matchMedia === 'function'
    static #cache = null

    static #initOffscreen() {
        if (!ColorScheme.#hasDom) return
        chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
            if (msg?.type === 'GET_SCHEME') {
                sendResponse(self.matchMedia('(prefers-color-scheme: dark)').matches ? ColorScheme.DARK : ColorScheme.LIGHT)
                return true
            }
        })
    }

    static async #ensureOffscreen() {
        const has = await chrome.offscreen.hasDocument?.()
        if (has) return

        await chrome.offscreen.createDocument({
            url: '/gui/color-scheme/color-scheme.html',
            reasons: ['MATCH_MEDIA'],
            justification: 'detect OS dark mode'
        })
    }

    static getScheme() {
        if (ColorScheme.#hasDom) {
            return self.matchMedia('(prefers-color-scheme: dark)').matches ? ColorScheme.DARK : ColorScheme.LIGHT
        }

        return ColorScheme.#cache ?? ColorScheme.LIGHT
    }

    static async refresh() {
        await ColorScheme.#ensureOffscreen()
        const scheme = await chrome.runtime.sendMessage({ type: 'GET_SCHEME' })
        ColorScheme.#cache = scheme

        chrome.offscreen.closeDocument()

        return scheme
    }

    static {
        if (ColorScheme.#hasDom) ColorScheme.#initOffscreen()
        else setTimeout(() => ColorScheme.refresh().catch(() => {}), 10 * ONE_SECOND)
    }
}