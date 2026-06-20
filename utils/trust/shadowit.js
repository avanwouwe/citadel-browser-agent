// Tracks the shadow-IT hosts the user has already handled — either by acknowledging a
// warning or by being granted a block exception. Persisted via PersistentObject (chrome
// storage), not page storage, so the grants survive service-worker restarts and clearing
// the browser cache. The value is a map of hostname -> expiry timestamp (epoch ms).
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

    static showWarning(tabId, url) {
        const hostname = url.hostname
        const contact = config.company.contact.embedTag('nowrap')
        const onAcknowledge = { type: "acknowledge-shadow-it", url: url.origin }
        const onException = { type: "allow-shadow-it", url: url.origin }

        Modal.createForTab(tabId, t("shadow-it.warn.title"), t("shadow-it.warn.message", { hostname, contact }), onAcknowledge, onException)
    }

    static grant(hostname, durationDays) {
        assert(hostname, "hostname is required")
        assert(durationDays != null, "duration is required")

        ShadowIT.#grants[hostname] = Date.now() + durationDays * ONE_DAY
    }

    // true when an unexpired grant exists for the hostname, i.e. the user has already been
    // warned or granted an exception and we should not bother them again yet
    static #isHandled(hostname) {
        assert(hostname, "hostname is required")

        const expiresAt = ShadowIT.#grants[hostname]
        if (! expiresAt) return false

        if (expiresAt <= Date.now()) {
            delete ShadowIT.#grants[hostname]
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
