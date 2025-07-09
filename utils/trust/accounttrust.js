class AccountTrust {

    static checkFor(username, sitename) {
        const config = Config.forHostname(sitename)

        if (config.account.checkOnlyInternal && isExternalUser(username)) {
            return false
        }

        if (config.account.checkOnlyApplications && ! isApplication(sitename)) {
            return false
        }

        return true
    }

    static failingAccounts() {
        const accounts = [ ]
        for (const [system, app] of AppStats.allApps()) {
            for (const [username, report] of AppStats.allAccounts(app)) {
                if (report.issues?.count > 0) {
                    report.state = DeviceTrust.State.FAILING
                    const description = {
                        numberOfDigits:   t("accounttrust.password.quality.number-digits",    { min: config.account.passwordPolicy.minNumberOfDigits }),
                        numberOfLetters:  t("accounttrust.password.quality.number-letters",   { min: config.account.passwordPolicy.minNumberOfLetters }),
                        numberOfUpperCase:t("accounttrust.password.quality.number-uppercase", { min: config.account.passwordPolicy.minNumberOfUpperCase }),
                        numberOfLowerCase:t("accounttrust.password.quality.number-lowercase", { min: config.account.passwordPolicy.minNumberOfLowerCase }),
                        numberOfSymbols:  t("accounttrust.password.quality.number-symbols",   { min: config.account.passwordPolicy.minNumberOfSymbols }),
                        entropy:          t("accounttrust.password.quality.entropy"),
                        sequence:         t("accounttrust.password.quality.sequence"),
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
}