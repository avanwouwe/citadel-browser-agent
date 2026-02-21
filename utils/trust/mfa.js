class MFACheck {

    static isRequired(url, config) {
        const hostname = getSitename(url)

        const isRequired = matchDomain(hostname, config.account.mfa.required)
        const isExempted = matchDomain(hostname, config.account.mfa.exceptions)

        return isRequired && !isExempted
    }

    /**
     * Expects MFA to occur within N minutes for a specific URL
     * @param {string} url - The URL that triggered the expectation of MFA
     * @param {int} minutes - The number of minutes to wait
     * @param {boolean} showModal - Should a modal window be shown
     * */
    static startTimer(url, minutes, showModal) {
        const hostname = getSitename(url)
        const domain = getDomain(hostname)

        if (MFACheck.#mfaTimers[domain]) {
            clearTimeout(MFACheck.#mfaTimers[domain].timerId)
            delete MFACheck.#mfaTimers[domain]
        }

        debug(`MFA session starting for ${domain}, timer started`)

        const timerId = setTimeout(async () => {
            debug(`MFA timeout for ${domain}`)

            logger.log(nowTimestamp(), "block", "MFA blocked", url, Log.WARN, undefined, `blocked access to ${domain} due to missing MFA`)

            await logOffDomain(domain)

            await injectFuncIntoDomain(domain, () => location.reload())

            if (showModal) {
                const title = t("mfa.title")
                const message = t("mfa.disconnected", { contact: config.company.contact })

                const onAcknowledge = { type: 'acknowledge-mfa', domain }
                const onException = { type: 'allow-mfa', domain }

                await sleep(ONE_SECOND)
                await Modal.createForDomain(domain, title, message, onAcknowledge, onException)
            }

            delete MFACheck.#mfaTimers[domain]
        }, minutes * ONE_MINUTE)

        MFACheck.#mfaTimers[domain] = {
            timerId,
            timestamp: Date.now(),
            domain
        }
    }

    /**
     * Called when MFA timer is cancelled (MFA received or password failed)
     * @param {string} url - The URL of the MFA timer
     * @param {string} reason - The reason the timer was interrupted (TOTP, WebAuth, etc)
     */
    static cancelTimer(url, reason) {
        const hostname = getSitename(url)
        const domain = getDomain(hostname)
        const waitingSince = MFACheck.#mfaTimers[domain]?.timestamp

        if (!waitingSince) {
            return
        }

        const app = AppStats.forURL(url)
        const account = AppStats.getAccount(app, app.lastAccount)
        account.lastMFA = nowDatestamp()
        AppStats.markDirty()

        const elapsedTime = (Date.now() - waitingSince) / 1000

        debug(`MFA timer for ${domain} cancelled after ${elapsedTime.toFixed(1)} seconds based on ${reason}`)

        clearTimeout(MFACheck.#mfaTimers[domain].timerId)
        delete MFACheck.#mfaTimers[domain]
    }

    static #mfaTimers = {}

    static #TOTP_FORMAT_REGEX = /^[0-9]{6,8}$/
    static isTOTP = (str) => MFACheck.#TOTP_FORMAT_REGEX.test(str)

    static #MFA_NAME_REGEX = /(^|[/_.-])(mfa|t?otp|(multi|two)[_.-]?factor|2sv|2fa|a2f|challenge|securitycode|pin[/_.-]|token|one[_.-]time[_.-](password|pwd))|(mfa|t?otp|(multi|two)[_.-]?factor|2sv|2fa|a2f|challenge|token|one[_.-]time[_.-](password|pwd))([/_.-]|$)/i
    static isMFA = (str) => MFACheck.#MFA_NAME_REGEX.test(str)

    static #AUTH_URL_REGEX = /(^|[/_.-])(login|sign[_.-]?in|auth|saml|oauth|sso|mfa|oidc|ident|connect)|(login|sign[_.-]?in|auth|saml|oauth|sso|mfa|oidc|ident|connect)([/_.-]|$)/i
    static findAuthPattern = (str) => str?.match(MFACheck.#AUTH_URL_REGEX)?.[0]
}