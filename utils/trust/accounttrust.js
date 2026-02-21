class AccountTrust {

    static TYPE = "account"

    static #audit = new Audit(AccountTrust.TYPE)

    static async init() {
        await AccountTrust.#audit.ready()
    }

    static checkFor(username, sitename) {
        if (sitename.isURL()) sitename = getSitename(sitename)

        const config = Config.forHostname(sitename)

        if (config.account.checkOnlyProtected && ! Config.isProtected(sitename)) return false
        if (config.account.checkOnlyInternal && isExternalUser(username)) return false

        return true
    }

    static accountKey(username, system) { return JSON.stringify({ u: username, s: system }) }

    static getStatus(appName = null) {
        const failingAccounts = AccountTrust.#failingAccounts(appName)

        for (const [accountKey, acct] of Object.entries(failingAccounts)) {
            const finding = AccountTrust.#audit.getFinding(accountKey)
            acct.report.state = finding?.getState() ?? State.FAILING
            acct.report.nextState = finding?.getNextState() ?? { state : State.FAILING }
        }

        return failingAccounts
    }

    static async deleteAccount(appName, username, logoff = true) {
        assert(username && appName, "missing either username or system")

        AppStats.deleteAccount(appName, username)
        PasswordVault.deleteAccount(appName, username)

        if (logoff) {
            await logOffDomain(appName)
            await injectFuncIntoDomain(appName, () => location.reload())
        }

        AccountTrust.refresh()
    }

    static refresh() {
        const failingAccounts = AccountTrust.#failingAccounts()

        for (const [accountKey, acct] of Object.entries(failingAccounts)) {
            const warnTrigger = config.account.trigger.warn
            const blockTrigger = config.account.trigger.block

            const report = {
                name: accountKey,
                passing: acct.report.action === Action.NOTHING || acct.report.action === Action.SKIP,
                timestamp: AccountTrust.#audit?.getFinding(accountKey)?.report?.timestamp ?? new Date()
            }

            const control = new Control(accountKey, acct.report.action, warnTrigger, blockTrigger)
            control.addReport(report)
            AccountTrust.#audit.setFinding(control)
        }

        // remove controls for accounts that are no longer failing
        for (const accountKey in AccountTrust.#audit.getFindings()) {
            if (! failingAccounts.hasOwnProperty(accountKey)) {
                AccountTrust.#audit.removeFinding(accountKey)
            }
        }

        AccountTrust.#audit.save()
        Dashboard.refreshAccount()
    }

    static #failingAccounts(appName = null) {
        const accounts = {}

        const app = appName ? AppStats.forAppName(appName) : null
        if (appName && !app) return accounts

        const apps = app ? [[appName, app]] : AppStats.allApps()
        for (const [system, app] of apps) {
            for (const [username, details] of AppStats.allAccounts(app)) {
                if (!AccountTrust.checkFor(username, system)) continue

                const report = { ...details }
                report.action = report?.issues?.reuse ? config.account.passwordReuse.action : Action.NOTHING

                const issueCount = report.issues?.count ?? 0
                for (const currAction of Action.values) {
                    if (issueCount >= config.account.actions[currAction] && Action.indexOf(currAction) > Action.indexOf(report.action)) {
                        report.action = currAction
                    }
                }

                if (Action.indexOf(report.action) >= Action.indexOf(Action.NOTIFY)) {
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

                    const accountKey = AccountTrust.accountKey(username, system)
                    accounts[accountKey] = { username, system, report }
                }
            }
        }

        return accounts
    }

    static {
        setTimeout(() => AccountTrust.refresh(), 1 * ONE_MINUTE)
        setInterval(() => AccountTrust.refresh(), 1 * ONE_DAY)
    }
}