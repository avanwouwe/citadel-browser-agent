class PasswordVault {

    static OTHER_SYSTEM = "[other-system]"

    static async detectReuse(username, password, system) {
        const passwordReuse = []

        const salt = PasswordVault.#salts.bcrypt
        if (!salt) return passwordReuse

        const isProtectedSystem = AccountTrust.checkFor(username, system)
        const passwordHash = await Bcrypt.hash(password, salt)
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

        for (const acct of Object.values(matchingPasswords)) {
            if (acct.username !== username || acct.system !== system) {
                passwordReuse.push({ username, system })
            }
        }

        if (passwordReuse.length > 0 && !isProtectedSystem) {
            passwordReuse.push({ username, system: PasswordVault.OTHER_SYSTEM })
        }

        return passwordReuse
    }

    static async purge() {
        debug("purging password vault")

        const cutoff = config.account.retentionDays * ONE_DAY
        const now = Date.now()
        const globalSalt = PasswordVault.#salts.bcrypt

        for (const [passwordHash, accounts] of Object.entries(PasswordVault.#passwords)) {
            if (passwordHash === "isDirty") continue

            for (const [accountKey, account] of Object.entries(accounts)) {
                if (!isDate(account.lastUsed) || account.lastUsed < now - cutoff) {
                    delete accounts[accountKey]
                    PasswordVault.#passwords.isDirty = true
                }
            }

            if (Object.keys(accounts).length === 0 || Bcrypt.getSalt(passwordHash) !==  globalSalt) {
                delete PasswordVault.#passwords[passwordHash]
            }
        }
    }

    static #passwords = new PersistentObject("passwords").value()
    static #salts = new PersistentObject("password-salts").value()
    static prehashSalt

    static {
        // load the state, re-initializing everything if something looks corrupt
        const loadSalts = new PersistentObject("password-salts").ready().then(store => PasswordVault.#salts = store.value())
        const loadPasswords = new PersistentObject("passwords").ready().then(store => PasswordVault.#passwords = store.value())

        Promise.all([loadSalts, loadPasswords]).then(() => {
            const salts = PasswordVault.#salts
            if (!salts.bcrypt || !salts.pbkdf2) {
                debug("initializing password vault", salts.bcrypt,salts.pbkdf2)
                Bcrypt.genSalt().then(salt => salts.bcrypt = salt)
                salts.pbkdf2 = PBKDF2.toBase64(PBKDF2.genSalt())

                const passwordStorage = new PersistentObject("passwords")
                passwordStorage.clear()
                PasswordVault.#passwords = passwordStorage.value()
            }

            PasswordVault.prehashSalt = salts.pbkdf2
        })

        const handler = (message, sender, sendResponse) => {
            if (sender.id !== chrome.runtime.id) return

            if (message.type === "CheckPasswordReuse") {
                const passwordReuse = PasswordVault.detectReuse(message.report.username, message.report.password, sender.origin)
                sendResponse(passwordReuse)
            }
        }

        chrome.runtime.onMessage.addListener(handler)
    }
}