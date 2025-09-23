class AccountTrust {

    static TYPE = "accounttrust"

    static checkFor(username, sitename) {
        if (sitename.isURL()) sitename = getSitename(sitename)

        const config = Config.forHostname(sitename)

        if (config.account.checkOnlyApplications && ! isApplication(sitename)) return false
        if (config.account.checkOnlyInternal && isExternalUser(username)) return false

        return true
    }

    static failingAccounts(appName = null) {
        const accounts = [ ]

        const app = appName ? AppStats.forAppName(appName) : null
        if (appName && !app) return accounts

        const apps = app ? [[appName, app]] : AppStats.allApps()
        for (const [system, app] of apps) {
            for (const [username, report] of AppStats.allAccounts(app)) {
                if (!AccountTrust.checkFor(username, system)) continue

                report.state = DeviceTrust.State.PASSING

                const issueCount = report.issues?.count ?? 0
                report.state = issueCount >= DeviceTrust.State.values.length ? DeviceTrust.State.BLOCKING : DeviceTrust.State.values[issueCount]
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

    static async deleteAccount(username, system) {
        assert(username && system, "missing either username or system")

        AppStats.deleteAccount(system, username)
        await logOffDomain(system)
        await injectFuncIntoDomain(system, () => location.reload())
        logger.log(nowTimestamp(), "account management", "account deleted", `https://${system}`, Log.WARN, undefined, `user deleted account of '${username}' for ${system}`)
    }

    static #notify() {
        let state = DeviceTrust.State.PASSING
        for (const acct of AccountTrust.failingAccounts()) {
            if (DeviceTrust.State.indexOf(acct.report.state) > DeviceTrust.State.indexOf(state)) {
                state = acct.report.state
            }
        }

        const title = t("accounttrust.notification.title")

        if (state === DeviceTrust.State.PASSING) {
            Notification.setAlert(AccountTrust.TYPE, state)
        } else if (state === DeviceTrust.State.FAILING) {
            Notification.setAlert(AccountTrust.TYPE, state, title, t("accounttrust.notification.failing"))
        } else if (state === DeviceTrust.State.WARNING) {
            Notification.setAlert(AccountTrust.TYPE, state, title, t("accounttrust.notification.warning"))
        } else if (state === DeviceTrust.State.BLOCKING) {
            Notification.setAlert(AccountTrust.TYPE, state, title, t("accounttrust.notification.blocking"))
        }

        Dashboard.sendMessage({type: "RefreshAccountStatus"})
    }

    static {
        setTimeout(() => AccountTrust.#notify(), 1 * ONE_MINUTE)
        setInterval(() => AccountTrust.#notify(), 7 * ONE_DAY)
    }}