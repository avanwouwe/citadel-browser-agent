class AccountTrust {

    static TYPE = "account"

    static #audit = new Audit()

    static checkFor(username, sitename) {
        if (sitename.isURL()) sitename = getSitename(sitename)

        const config = Config.forHostname(sitename)

        if (config.account.checkOnlyProtected && ! isProtected(sitename)) return false
        if (config.account.checkOnlyInternal && isExternalUser(username)) return false

        return true
    }

    static accountKey(username, system) { return JSON.stringify({ u: username, s: system }) }

    static getStatus(appName = null) {
        const failingAccounts = AccountTrust.#failingAccounts(appName)

        for (const acct of failingAccounts) {
            const accountKey = AccountTrust.accountKey(acct.username, acct.system)
            const finding = this.#audit.getFinding(accountKey)
            acct.report.state = finding?.getState() ?? State.FAILING
            acct.report.nextState = finding?.getNextState() ?? { state : State.FAILING }
        }

        return failingAccounts
    }

    static async deleteAccount(username, appName) {
        assert(username && appName, "missing either username or system")

        AppStats.deleteAccount(appName, username)
        await logOffDomain(appName)
        await injectFuncIntoDomain(appName, () => location.reload())

        AccountTrust.#refresh()

        logger.log(nowTimestamp(), "account management", "account deleted", `https://${appName}`, Log.WARN, undefined, `user deleted account of '${username}' for ${appName}`)
    }

    static #refresh() {
        const prevAudit = this.#audit
        this.#audit = new Audit()

        for (const acct of AccountTrust.#failingAccounts()) {
            const accountKey = AccountTrust.accountKey(acct.username, acct.system)
            const warnTrigger = config.account.trigger.warn
            const blockTrigger = config.account.trigger.block

            let action = Action.NOTHING
            for (const i of Action.values) {
                if (acct.report.issues.count >= config.account.actions[i]) {
                    action = i
                }
            }

            const control = new Control(accountKey, action, warnTrigger, blockTrigger)
            const report = {
                name: accountKey,
                passed: action === Action.NOTHING || action === Action.SKIP,
                timestamp: prevAudit?.getFinding(accountKey)?.report?.timestamp ?? nowTimestamp()
            }
            control.addReport(report)
            this.#audit.setFinding(control)
        }

        this.#audit.notify(AccountTrust.TYPE)

        Dashboard.sendMessage({type: "RefreshAccountStatus"})
    }

    static #failingAccounts(appName = null) {
        const accounts = [ ]

        const app = appName ? AppStats.forAppName(appName) : null
        if (appName && !app) return accounts

        const apps = app ? [[appName, app]] : AppStats.allApps()
        for (const [system, app] of apps) {
            for (const [username, report] of AppStats.allAccounts(app)) {
                if (!AccountTrust.checkFor(username, system)) continue

                const issueCount = report.issues?.count ?? 0
                if (issueCount >= config.account.actions.NOTIFY) {
                    const description = {
                        numberOfDigits:     t("accounttrust.password.quality.number-digits",     { min: config.account.passwordPolicy.minNumberOfDigits }),
                        numberOfLetters:    t("accounttrust.password.quality.number-letters",    { min: config.account.passwordPolicy.minNumberOfLetters }),
                        numberOfUpperCase:  t("accounttrust.password.quality.number-uppercase",  { min: config.account.passwordPolicy.minNumberOfUpperCase }),
                        numberOfLowerCase:  t("accounttrust.password.quality.number-lowercase",  { min: config.account.passwordPolicy.minNumberOfLowerCase }),
                        numberOfSymbols:    t("accounttrust.password.quality.number-symbols",    { min: config.account.passwordPolicy.minNumberOfSymbols }),
                        length:             t("accounttrust.password.quality.length",            { min: config.account.passwordPolicy.minLength }),
                        entropy:            t("accounttrust.password.quality.entropy"),
                        sequence:           t("accounttrust.password.quality.sequence"),
                        usernameInPassword: t("accounttrust.password.quality.username-password"),
                        reuse:              t("accounttrust.password.quality.reuse",            { account: report.issues.reuse }),
                    }

                    const lines = Object.keys(report.issues)
                        .filter(key => description[key])
                        .map(key => `• ${description[key]}`)
                    report.issues.description = lines.length ? `${t("accounttrust.password.quality.title")}:\n${lines.join('\n')}` : ''

                    accounts.push({ username, system, report })
                }
            }
        }

        return accounts
    }

    static {
        setTimeout(() => AccountTrust.#refresh(), 1 * ONE_MINUTE)
        setInterval(() => AccountTrust.#refresh(), 7 * ONE_DAY)
    }
}