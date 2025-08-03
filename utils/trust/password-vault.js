class PasswordVault {

    static OTHER_SYSTEM = "[other-system]"

    static #passwords
    static salt
    static prehashSalt

    static async detectReuse(username, password, system) {
        if (! PasswordVault.salt || ! PasswordVault.prehashSalt) return console.warn("hash was no defined")
        if (password.salt !== PasswordVault.prehashSalt) return console.warn("password was prehashed with incorrect salt")

        const isProtectedSystem = AccountTrust.checkFor(username, system)
        const passwordHash = await Bcrypt.hash(password.hash, PasswordVault.salt)
        const accountKey = JSON.stringify({ u: username, s: system })

        const matchingPasswords = PasswordVault.#passwords[passwordHash] ?? {}

        if (isProtectedSystem) {
            PasswordVault.#passwords[passwordHash] = matchingPasswords
            matchingPasswords[accountKey] = {
                username,
                system,
                lastUsed: nowDatestamp()
            }
        }

        const passwordReuse = []
        for (const acct of Object.values(matchingPasswords)) {
            if (acct.username !== username || acct.system !== system) {
                passwordReuse.push({ username, system })
            }
        }

        if (passwordReuse.length > 0 && !isProtectedSystem) {
            passwordReuse.push({ username, system: PasswordVault.OTHER_SYSTEM })
        }

        return passwordReuse.length > 0 ? passwordReuse : undefined
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
            }
        }
    }

    static {
        // load the state, re-initializing everything if something looks corrupt
        let salts
        const loadSalts = new PersistentObject("password-salts").ready().then(obj => salts = obj.value())
        const loadPasswords = new PersistentObject("passwords").ready().then(obj => PasswordVault.#passwords = obj.value())

        Promise.all([loadSalts, loadPasswords]).then(async () => {
            if (!salts.bcrypt || !salts.pbkdf2) {
                debug("initializing password vault")

                Bcrypt.genSalt().then(salt => salts.bcrypt = salt)
                salts.pbkdf2 = PBKDF2.toBase64(PBKDF2.genSalt())

                PasswordVault.#passwords.clear()
            }

            PasswordVault.salt = salts.bcrypt
            PasswordVault.prehashSalt = salts.pbkdf2
        })
    }
}