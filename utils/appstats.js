class AppStats {

    static #APPLICATION_STATISTICS_KEY = 'application-statistics'
    static #APPSTATS_STORAGE = new PersistentObject(AppStats.#APPLICATION_STATISTICS_KEY)
    static #APPSTATS = AppStats.#APPSTATS_STORAGE.value()


    static getOrCreateApp(appName) {
        const existingApp = this.#APPSTATS[appName]
        if (existingApp) {
            return existingApp
        }

        debug(`identified new application '${appName}'`)

        const today = nowDatestamp()
        return this.#APPSTATS.getOrSet(appName, {
            lastUsed: today,
            usage: {
                [today]: 1
            }
        })
    }

    static forURL(url) {
        assert(url, "must specify url")

        const appName = getSitename(url)

        return appName ? AppStats.forAppName(appName) : undefined
    }

    static forAppName(appName) {
        assert(appName, "must specify app name")

        return AppStats.#APPSTATS[appName]
    }

    static getAccount(app, username) {
        assert(app && username, "must specify app and username")

        const accounts = app.getOrSet("accounts", {})
        return accounts.getOrSet(username, { domain: PasswordCheck.getDomainFromUsername(username) })
    }

    static allApps() {
        return Object.entries(this.#APPSTATS)
    }

    static allAccounts(app) {
        const accounts = app.getOrSet("accounts", {})
        return Object.entries(accounts)
    }

    static deleteApp(appName) {
        assert(appName, "must specify app name")

        this.#APPSTATS.delete(appName)

        AppStats.markDirty()
    }

    static deleteAccount(appName, username) {
        assert(appName && username, "must specify app and username")
        const app = AppStats.forAppName(appName)
        if (!app) return

        const accounts = app.getOrSet("accounts", { })
        delete accounts[username]

        AppStats.markDirty()
    }

    static getUsage(app) {
        assert(app, "must specify app")

        return app.getOrSet('usage', { })
    }

    static getIssues(appName, username) {
        const app = AppStats.forAppName(appName)
        const account = AppStats.getAccount(app, username)
        return account?.issues ?? {}
    }

    static setIssues(appName, username, issues = {}) {
        const app = AppStats.forAppName(appName)
        const account = AppStats.getAccount(app, username)

        issues = {...issues}

        Object.entries(issues).forEach(([key, value]) => {
            if (key === 'count' || !value) {
                delete issues[key]
            }
        })

        issues.count = Object.values(issues).length
        account.issues = issues.count > 0 ? issues : null

        AppStats.markDirty()
        AccountTrust.refresh()
    }

    static markUsed(app) {
        app.lastUsed = nowDatestamp()

        AppStats.markDirty()
    }

    static markDirty() {
        this.#APPSTATS.isDirty = true
    }

    static async flush() {
        AppStats.markDirty()
        await this.#APPSTATS_STORAGE.flush()
    }

    static incrementInteraction(url) {
        const appName = getSitename(url)
        if (!appName) {
            return
        }

        const app = AppStats.forAppName(appName)

        if (app) {
            const today = nowDatestamp()
            const usage = AppStats.getUsage(app)
            const currInteractionCount = usage.getOrSet(today, 0)
            app.lastUsed = today
            usage[today] = currInteractionCount + 1
            AppStats.markDirty()

            debug(`interaction with ${appName}`)
        }
    }

    // cleaning up of application statistics to prevent infinite build-up of irrelevant data
    static async purge() {
        debug("purging AppStat database")

        for (const [appName, app] of AppStats.allApps()) {
            const config = Config.forHostname(appName)

            // purge applications if they haven't been used for a while
            if (isDate(app.lastUsed) && daysSince(app.lastUsed) > config.application.retentionDays) {
                AppStats.deleteApp(appName)
                continue
            }

            // purge accounts if they haven't been used for a while
            for (const [username, details] of AppStats.allAccounts(app)) {
                if (isDate(details.lastConnected) && daysSince(details.lastConnected) > config.account.retentionDays) {
                    await AccountTrust.deleteAccount(appName, username)
                }
            }
        }
    }
}
