class PasswordVault {

    static HASH_ROUNDS = 15

    static #accounts
    static #byPassword = {}

    static salt

    static async detectReuse(username, system, password) {
        system = PasswordVault.#normalizeSystem(system)

        await PasswordVault.setAccount(username, system, password)

        const passwordHash = PasswordVault.#getPassword(system, username)
        return passwordHash ? PasswordVault.#detectReuseHash(passwordHash, system) : undefined
    }

    static #detectReuseHash(passwordHash, system) {
        const sharingAccounts = PasswordVault.#getAccounts(passwordHash)

        const sharesProtectedPasswords = sharingAccounts.some(account => AccountTrust.checkFor(account.username, account.system))
        if (! sharesProtectedPasswords) return

        let forbiddenReuse = Object.values(sharingAccounts)
            .filter(account => ! inSameDomain(account.system, system))
            .map(account => ({ username: account.username, system: account.system }))

        // ignore systems that are permitted exceptions
        const exceptions = Config.forHostname(system).account.passwordReuse.exceptions.groups
            .map(exceptionGroup => Object.fromEntries(exceptionGroup.map(domain => [domain, true])))
            .filter(exceptionGroup => matchDomain(system, exceptionGroup))

        const allowedSystems = forbiddenReuse.filter(reuse => exceptions.some(exception => matchDomain(reuse.system, exception)))
            .map(reuse => reuse.system)

        forbiddenReuse = forbiddenReuse.filter(reuse => !allowedSystems.includes(reuse.system))
        if (forbiddenReuse.length === 0) return

        const account = forbiddenReuse[0]
        return {
            username: account.username,
            system: account.system,
            label: `${account?.username ?? '??'} / ${account?.system ?? '??'}`
        }
    }

    static #reusingAccounts(system, username) {
        const reusingAccounts = {}

        // find reusing passwords by checking the passwords
        const passwordHash = PasswordVault.#getPassword(system, username)
        if (passwordHash) {
            for (const { username, system } of PasswordVault.#getAccounts(passwordHash)) {
                const accountKey = AccountTrust.accountKey(username, system)
                const account = PasswordVault.#accounts[accountKey]

                const reuse = PasswordVault.#detectReuseHash(account.passwordHash, account.system)
                if (reuse) {
                    reusingAccounts[accountKey] = {
                        username: account.username,
                        system: account.system,
                        reuse
                    }
                }
            }
        }

        // also find reusing passwords by checking the historical issues (since the password may have be deleted since)
        for (const [accountKey, account] of Object.entries(AccountTrust.getStatus())) {
            const historicalReuse = account?.report?.issues?.reuse
            if (historicalReuse && historicalReuse.system === system && historicalReuse.username === username) {
                const actualReuse = PasswordVault.#detectReuseHash(account.passwordHash, account.system)
                reusingAccounts[accountKey] = {
                    username: account.username,
                    system: account.system,
                    reuse: actualReuse
                }
            }
        }

        return reusingAccounts
    }

    static #indexAccount(accountKey, passwordHash) {
        PasswordVault.#byPassword[passwordHash] ??= new Set()
        PasswordVault.#byPassword[passwordHash].add(accountKey)
    }

    static #unindexAccount(accountKey, passwordHash) {
        const set = PasswordVault.#byPassword[passwordHash]
        if (!set) return
        set.delete(accountKey)
        if (set.size === 0) delete PasswordVault.#byPassword[passwordHash]
    }

    static #buildIndex() {
        PasswordVault.#byPassword = {}
        for (const [accountKey, account] of Object.entries(PasswordVault.#accounts)) {
            if (account?.passwordHash) {
                PasswordVault.#indexAccount(accountKey, account.passwordHash)
            }
        }
    }

    static #getPassword(system, username) {
        const accountKey = AccountTrust.accountKey(username, system)
        return PasswordVault.#accounts[accountKey]?.passwordHash
    }

    static #getAccounts(passwordHash) {
        return [...(PasswordVault.#byPassword[passwordHash] ?? [])]
            .map(key => PasswordVault.#accounts[key])
            .filter(Boolean)
    }

    static async setAccount(username, system, password) {
        assert(PasswordVault.salt, "salt is not defined")
        system = PasswordVault.#normalizeSystem(system)

        const passwordHash = await Bcrypt.hash(password, PasswordVault.salt)
        const reuse = PasswordVault.#detectReuseHash(passwordHash, system)

        if (!reuse && ! AccountTrust.checkFor(username, system)) return

        const accountKey = AccountTrust.accountKey(username, system)
        const existing = PasswordVault.#accounts[accountKey]

        if (existing) {
            PasswordVault.#unindexAccount(accountKey, existing.passwordHash)
        }
        debug(`${existing ? 'updating' : 'storing'} password for account '${username}' / ${system}`)

        PasswordVault.#accounts[accountKey] = { username, system, lastUsed: nowDatestamp(), passwordHash }
        PasswordVault.#indexAccount(accountKey, passwordHash)
        PasswordVault.#accounts.isDirty = true
    }

    static deleteAccount(system, username) {
        system = PasswordVault.#normalizeSystem(system)

        const accountKey = AccountTrust.accountKey(username, system)
        const existing   = PasswordVault.#accounts[accountKey]
        if (!existing) return false

        PasswordVault.#unindexAccount(accountKey, existing.passwordHash)
        delete PasswordVault.#accounts[accountKey]

        PasswordVault.updateReuse(system, username)

        PasswordVault.#accounts.isDirty = true
        return true
    }

    static async purge() {
        debug("purging password vault")

        const cutoff = config.account.retentionDays * ONE_DAY
        const now    = Date.now()

        for (const [accountKey, account] of Object.entries(PasswordVault.#accounts)) {
            if (! account?.username) continue

            const wrongSalt   = Bcrypt.getSalt(account.passwordHash) !== PasswordVault.salt
            const isExpired   = ! isDate(account.lastUsed) || account.lastUsed < now - cutoff
            const isProtected = AccountTrust.checkFor(account.username, account.system)
            const isReusing   = !! PasswordVault.#detectReuseHash(account.passwordHash, account.system)

            if (! isReusing && (isExpired || wrongSalt || ! isProtected)) {
                PasswordVault.#unindexAccount(accountKey, account.passwordHash)
                delete PasswordVault.#accounts[accountKey]
                PasswordVault.#accounts.isDirty = true
            }
        }
    }

    static updateReuse(system, username) {
        const reusingAccounts = PasswordVault.#reusingAccounts(system, username)

        for (const reuse of Object.values(reusingAccounts)) {
            const issues = AppStats.getIssues(reuse.system, reuse.username)
            issues.reuse = reuse.reuse

            AppStats.setIssues(reuse.system, reuse.username, issues)
        }
    }

    static #normalizeSystem(system) { return system.isURL() ? system.toURL().hostname : system }

    static {
        (async () => {
            let [{ PasswordVaultSalt: salt }, accounts] = await Promise.all([
                chrome.storage.local.get("PasswordVaultSalt"),
                new PersistentObject("accounts").ready()
            ])

            PasswordVault.#accounts = accounts.value()

            if (!salt) {
                debug("initializing password vault")
                salt = await Bcrypt.genSalt(PasswordVault.HASH_ROUNDS)
                await chrome.storage.local.set({ PasswordVaultSalt: salt })
                PasswordVault.#accounts.clear()
            }

            PasswordVault.salt = salt

            PasswordVault.#buildIndex()
        })()
    }
}