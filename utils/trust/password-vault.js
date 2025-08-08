class PasswordVault {

    static OTHER_SYSTEM = "[other-system]"

    static #passwords
    static salt
    static prehashSalt

    static async detectReuse(username, password, system) {
        assert (PasswordVault.salt && PasswordVault.prehashSalt, "hash was not defined")
        assert (password.salt === PasswordVault.prehashSalt, "password was prehashed with incorrect salt")
        system = PasswordVault.#normalizeSystem(system)

        const isProtectedSystem = AccountTrust.checkFor(username, system)
        const passwordHash = await Bcrypt.hash(password.hash, PasswordVault.salt)
        const accountKey = PasswordVault.#accountKey(username, system)

        const matchingPasswords = PasswordVault.#passwords[passwordHash] ?? {}

        if (isProtectedSystem) {
            PasswordVault.#passwords[passwordHash] = matchingPasswords

            if (!(accountKey in matchingPasswords)) {
                debug(`storing password of ${username} for ${system}`)
            }

            matchingPasswords[accountKey] = {
                username,
                system,
                lastUsed: nowDatestamp()
            }
        }

        let passwordReuse = Object.values(matchingPasswords)
            .filter(account => account.system !== system)
            .map(account => ({ username: account.username, system: account.system }))

        if (passwordReuse.length > 0 && !isProtectedSystem) {
            passwordReuse.push({ username, system: PasswordVault.OTHER_SYSTEM })
        }

        passwordReuse = PasswordVault.#removeExceptions(system, passwordReuse)

        return passwordReuse.length > 0 ? passwordReuse : undefined
    }

    static deleteAccount(username, system) {
        system = PasswordVault.#normalizeSystem(system)

        const accountKey = PasswordVault.#accountKey(username, system)
        Object.values(PasswordVault.#passwords).forEach(password => delete password[accountKey])
        PasswordVault.#passwords.isDirty = true
    }

    static getReusedAccount(accounts, username, system) {
        system = PasswordVault.#normalizeSystem(system)

        const otherAccounts = accounts.filter(account => account.system !== system)

        if (otherAccounts.length === 0) return undefined

        const account = accounts.filter(account => account.system !== system)[0]
        const otherSystem = account.system === PasswordVault.OTHER_SYSTEM ? t('accounttrust.password.reuse.other-system') : account.system
        return {
            username: account.username,
            system: otherSystem,
            label: `${account?.username ?? '??'} / ${account?.system ?? '??'}`
        }
    }

    static async purge() {
        debug("purging password vault")

        const cutoff = config.account.retentionDays * ONE_DAY
        const now = Date.now()

        for (const [passwordHash, accounts] of Object.entries(PasswordVault.#passwords)) {
            if (passwordHash === "isDirty") continue

            for (const [accountKey, account] of Object.entries(accounts)) {
                if (!isDate(account.lastUsed) || account.lastUsed < now - cutoff) {
                    delete accounts[accountKey]
                    PasswordVault.#passwords.isDirty = true
                }
            }

            if (Object.keys(accounts).length === 0 || Bcrypt.getSalt(passwordHash) !==  PasswordVault.salt) {
                delete PasswordVault.#passwords[passwordHash]
                PasswordVault.#passwords.isDirty = true
            }
        }
    }

    static #accountKey(username, system) { return JSON.stringify({ u: username, s: system }) }

    static #normalizeSystem(system) { return system.isURL() ? system.toURL().hostname : system }

    static #removeExceptions(system, passwordReuse) {
        const systemExceptions = passwordReuse.filter(account => account.system === system)
        const exceptionGroups = Config.forHostname(system).account.passwordReuse.exceptions.groups

        const allowedGroupSystems = new Set(
            exceptionGroups
                .filter(group => group.includes(system))
                .flat()
        )

        let filtered = passwordReuse.filter(pr => !allowedGroupSystems.has(pr.system))

        if (filtered.length > 0) {
            filtered = [...filtered, ...systemExceptions]
        }

        return filtered
    }

    static {
        // load the state, re-initializing everything if something looks corrupt
        let salts
        const loadSalts = new PersistentObject("password-salts").ready().then(obj => salts = obj.value())
        const loadPasswords = new PersistentObject("passwords").ready().then(obj => PasswordVault.#passwords = obj.value())

        Promise.all([loadSalts, loadPasswords]).then(async () => {
            if (!salts.bcrypt || !salts.pbkdf2) {
                debug("initializing password vault")

                await Bcrypt.genSalt().then(salt => salts.bcrypt = salt)
                salts.pbkdf2 = PBKDF2.toBase64(PBKDF2.genSalt())

                PasswordVault.#passwords.clear()
            }

            PasswordVault.salt = salts.bcrypt
            PasswordVault.prehashSalt = salts.pbkdf2
        })
    }
}