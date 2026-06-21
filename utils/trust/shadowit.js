// Tracks the shadow-IT applications the user has already handled — either by acknowledging a warning or by being
// granted a block exception. The value is a map of matched application pattern -> expiry timestamp
// (epoch ms). Grants are keyed on the configured pattern (e.g. "dropbox.com") rather than
// the exact hostname, so that handling one host of an application also covers its other
// hosts (e.g. acknowledging "www.dropbox.com" also covers "api.dropbox.com").
class ShadowIT {

    static #storage = new PersistentObject("shadow-it")
    static #grants = ShadowIT.#storage.value()

    static async init() {
        await ShadowIT.#storage.ready()
        ShadowIT.#evictExpired()
        return ShadowIT
    }

    // decide whether if shadow-IT handling requires taking an action:
    //   BLOCK -> block the application
    //   WARN  -> warn the user with a dismissable modal
    //   null  -> do nothing
    static action(url) {
        const hostname = url.hostname

        // never apply shadow-IT logic to the company's own applications and domains
        if (Config.isProtected(hostname)) return null

        const isBlock = matchDomain(hostname, config.shadowit.block)
        const isWarn = matchDomain(hostname, config.shadowit.warn)

        // the user has already acknowledged the warning / been granted an exception recently
        if (ShadowIT.#isHandled(hostname)) return null

        if (! isBlock && ! isWarn) return null

        return (isBlock || config.shadowit.alwaysBlock) ? Action.BLOCK : Action.WARN
    }

    static showWarning(tabId, url, allowException) {
        const hostname = url.hostname
        const contact = config.company.contact.embedTag('nowrap')
        const onAcknowledge = { type: "acknowledge-shadow-it", url: url.origin }
        const onException = allowException ? { type: "allow-shadow-it", url: url.origin } : undefined

        Modal.createForTab(tabId, t("shadow-it.warn.title"), t("shadow-it.warn.message", { hostname, contact }), onAcknowledge, onException)
    }

    static grant(hostname, durationDays) {
        assert(hostname, "hostname is required")
        assert(durationDays != null, "duration is required")

        const key = ShadowIT.#patternFor(hostname)
        ShadowIT.#grants[key] = Date.now() + durationDays * ONE_DAY
    }

    // the configured shadow-IT pattern (in the block or warn lists) that the hostname matches, walking the domain
    // suffixes the same way as matchDomain(). Returns the hostname itself when the hostname matches no configured application.
    static #patternFor(hostname) {
        const parts = (hostname ?? "").split('.')

        for (let i = 0; i < parts.length; i++) {
            const candidate = parts.slice(i).join('.')
            if (config.shadowit.block[candidate] || config.shadowit.warn[candidate]) return candidate
        }

        return hostname
    }

    // true when an unexpired grant exists for the hostname's application, i.e. the user has
    // already been warned or granted an exception and we should not bother them again yet
    static #isHandled(hostname) {
        assert(hostname, "hostname is required")

        const key = ShadowIT.#patternFor(hostname)
        const expiresAt = ShadowIT.#grants[key]
        if (! expiresAt) return false

        if (expiresAt <= Date.now()) {
            delete ShadowIT.#grants[key]
            return false
        }

        return true
    }

    static #evictExpired() {
        const now = Date.now()

        for (const hostname of Object.keys(ShadowIT.#grants)) {
            if (hostname === 'isDirty') continue
            if (ShadowIT.#grants[hostname] <= now) delete ShadowIT.#grants[hostname]
        }
    }
}
