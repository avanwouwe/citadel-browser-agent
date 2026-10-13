class MFACheck {

    static isRequired(url, config) {
        const hostname = getSitename(url)
        return matchDomain(hostname, config.account.mfa.required)
    }

    /**
     * Expects MFA to occur within N minutes for a specific URL.
     * Fires a warning after `warnMinutes` and blocks access after `blockMinutes`.
     * @param {string} url - The URL that triggered the expectation of MFA
     * @param {boolean} isReconnect - Has the user connected with MFA before, or is this the first time
     * @param {Object} config - the configuration to use
     * */
    static startTimer(url, isReconnect, config) {
        const hostname = getSitename(url)
        const domain = getDomain(hostname)
        const session = MFACheck.#sessions.get(domain)

        const warnMinutes = config.account.mfa.warnMinutes
        const blockMinutes = config.account.mfa.blockMinutes
        const contact = config.organization.contact

        if (session?.state === 'cancelled' && (Date.now() - session.cancelledAt) < MFACheck.#CANCEL_GRACE) {
            debug(`MFA startTimer suppressed for ${domain} — cancelled ${Date.now() - session.cancelledAt}ms ago`)
            MFACheck.cancelTimer(url, session.cancelReason)
            return
        }

        if (session?.state === 'waiting') {
            clearTimeout(session.warnTimerId)
            clearTimeout(session.blockTimerId)
        }

        debug(`MFA session starting for ${domain}, warn in ${warnMinutes}m, block in ${blockMinutes}m`)

        const title = t("mfa.title")
        const disconnectReason = isReconnect ? 'session-expiration' : 'first-connect'

        let warnTimerId
        if (warnMinutes > 0 && warnMinutes < blockMinutes) {
            warnTimerId = setTimeout(async () => {
                debug(`MFA warning for ${domain}`)
                const actionReconnect = { type: 'logoff-domain', label: t('mfa.reconnect'), domain }
                const actionOK = { label: t('global.ok') }
                const actionLater = { label: t('global.later') }

                const message = t(`mfa.${disconnectReason}.warning`, { domain, hostname, minutes: Math.round(blockMinutes - warnMinutes), contact })
                const onAcknowledge = isReconnect ? actionReconnect : actionReconnect
                const onCancel = isReconnect ? actionLater : actionOK
                await Modal.createForDomain(domain, title, message, onAcknowledge, undefined, onCancel)

            }, warnMinutes * ONE_MINUTE)
        }

        const blockTimerId = setTimeout(async () => {
            debug(`MFA timeout for ${domain}`)

            logger.log(nowTimestamp(), "block", "MFA blocked", url, Log.WARN, undefined, `blocked access to ${domain} due to missing MFA`)

            await logOffDomain(domain)
            await injectFuncIntoDomain(domain, () => location.reload())

            const message = t(`mfa.${disconnectReason}.disconnected`, { domain, hostname, contact })
            const onAcknowledge = { type: 'acknowledge-mfa', label: t('mfa.reconnect'), domain }
            const onException = { type: 'allow-mfa', domain }

            await sleep(ONE_SECOND)
            await Modal.createForDomain(domain, title, message, onAcknowledge, onException)

            MFACheck.#sessions.delete(domain)
        }, blockMinutes * ONE_MINUTE)

        MFACheck.#sessions.set(domain, { state: 'waiting', warnTimerId, blockTimerId, startedAt: Date.now() })
    }

    /**
     * Called when MFA timer is canceled (MFA received or password failed)
     * @param {string} url - The URL of the MFA timer
     * @param {string} reason - The reason the timer was interrupted (TOTP, WebAuth, etc)
     * @param {boolean} isMFAProven - was the timer canceled because MFA was proven
     */
    static cancelTimer(url, reason, isMFAProven = true) {
        const appName = getSitename(url)
        const domain = getDomain(appName)
        const session = MFACheck.#sessions.get(domain)

        // Record cancel intent before early-return so a racing startTimer is also suppressed
        if (!session) {
            debug(`MFA timer for ${appName} cancelled without session based on "${reason}" at ${url}`)
            MFACheck.#sessions.set(domain, { state: 'cancelled', cancelReason: reason, cancelledAt: Date.now() })
            return
        }

        if (session.state === 'cancelled') {
            debug(`MFA timer for ${appName} was already cancelled without session based on "${session.cancelReason}"`)
        } else {
            const elapsedTime = (Date.now() - session.startedAt) / 1000
            debug(`MFA timer for ${appName} cancelled after ${elapsedTime.toFixed(1)} seconds based on ${reason} at ${url}`)
        }

        clearTimeout(session.warnTimerId)
        clearTimeout(session.blockTimerId)

        if (isMFAProven) {
            const app = AppStats.getOrCreateApp(appName)
            const account = AppStats.getOrCreateAccount(app, app.lastAccount)
            account.lastMFA = nowDatestamp()
            AppStats.markDirty()
        }
    }

    /**
     * Returns true if an MFA session is currently awaiting completion for the URL's domain.
     * @param {string} url - The URL to check
     * @returns {boolean}
     */
    static isRunning(url) {
        const domain = getDomain(getSitename(url))
        return MFACheck.#sessions.get(domain)?.state === 'waiting'
    }

    static #sessions = new Map()   // domain -> { state: 'waiting'|'cancelled', ... }
    static #CANCEL_GRACE = 5000

    static #TOTP_FORMAT_REGEX = /^[0-9]{6,8}$/
    static isTOTP = (str) => MFACheck.#TOTP_FORMAT_REGEX.test(str)

    static #MFA_NAME_REGEX = /(^|[/_.-])(mfa|t?otp|factor|2sv|2fa|a2f|(two|second)[_.-]?step|(challenge|verify|verification|security|secure)[_.-]?code|pin[/_.-]|token|one[_.-]?time[_.-]?(password|pwd))|(mfa|t?otp|factor|2sv|2fa|a2f|(two|second)[_.-]?step|(challenge|verify|verification|security|secure)[_.-]?code|[/_.-]pin|token|one[_.-]?time[_.-]?(password|pwd))([/_.-]|$)/i
    static isMFA = (str) => MFACheck.#MFA_NAME_REGEX.test(str)

    static #AUTH_URL_REGEX = /(^|[/_.-])(login|sign[_.-]?in|auth|saml|oauth|sso|mfa|oidc|ident|connect)|(login|sign[_.-]?in|auth|saml|oauth|sso|mfa|oidc|ident|connect)([/_.-]|$)/i
    static findAuthPattern = (str) => str?.match(MFACheck.#AUTH_URL_REGEX)?.[0]
}