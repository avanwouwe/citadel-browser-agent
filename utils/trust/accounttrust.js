class AccountTrust {

    static TYPE = "account"

    static checkFor(username, sitename) {
        if (sitename.isURL()) sitename = getSitename(sitename)

        const config = Config.forHostname(sitename)

        if (config.account.checkOnlyProtected && ! isProtected(sitename)) return false
        if (config.account.checkOnlyInternal && isExternalUser(username)) return false

        return true
    }

    static accountKey(username, system) { return JSON.stringify({ u: username, s: system }) }

    static failingAccounts(appName = null) {
        const accounts = [ ]

        const app = appName ? AppStats.forAppName(appName) : null
        if (appName && !app) return accounts

        const apps = app ? [[appName, app]] : AppStats.allApps()
        for (const [system, app] of apps) {
            for (const [username, report] of AppStats.allAccounts(app)) {
                if (!AccountTrust.checkFor(username, system)) continue

                report.state = State.PASSING

                const issueCount = report.issues?.count ?? 0
                report.state = issueCount >= State.values.length ? State.BLOCKING : State.values[issueCount]
                if (issueCount > 0) {
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

    static async deleteAccount(username, appName) {
        assert(username && appName, "missing either username or system")

        AppStats.deleteAccount(appName, username)
        await logOffDomain(appName)
        await injectFuncIntoDomain(appName, () => location.reload())

        AccountTrust.#notify()

        logger.log(nowTimestamp(), "account management", "account deleted", `https://${appName}`, Log.WARN, undefined, `user deleted account of '${username}' for ${appName}`)
    }

    static #notify() {
        let state = State.PASSING
        for (const acct of AccountTrust.failingAccounts()) {
            if (State.indexOf(acct.report.state) > State.indexOf(state)) {
                state = acct.report.state
            }
        }

        const title = t("accounttrust.notification.title")

        if (state === State.PASSING) {
            Notification.setAlert(AccountTrust.TYPE, state)
        } else if (state === State.FAILING) {
            Notification.setAlert(AccountTrust.TYPE, state, title, t("accounttrust.notification.failing"))
        } else if (state === State.WARNING) {
            Notification.setAlert(AccountTrust.TYPE, state, title, t("accounttrust.notification.warning"))
        } else if (state === State.BLOCKING) {
            Notification.setAlert(AccountTrust.TYPE, state, title, t("accounttrust.notification.blocking"))
        }

        Dashboard.sendMessage({type: "RefreshAccountStatus"})
    }

    static {
        setTimeout(() => AccountTrust.#notify(), 1 * ONE_MINUTE)
        setInterval(() => AccountTrust.#notify(), 7 * ONE_DAY)
    }}