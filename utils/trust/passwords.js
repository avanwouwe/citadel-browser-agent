class PasswordCheck {

    static isFirstConnection(username) {
        assert(Context.isContentScript(), "can only be called from content script")

        return ! PasswordCheck.#knownAccounts.includes(username)
    }

    static analyzeAccount(username, password) {
        const passwordAnalysis = PasswordCheck.analyzePassword(password)

        const nonLetterChar = /[^\p{L}]+/gu
        const u = username.toLowerCase().replace(nonLetterChar, '')
        const p = password.toLowerCase().replace(nonLetterChar, '')
        passwordAnalysis.usernameInPassword = (u.includes(p) || p.includes(u)) ? 1 : 0

        return passwordAnalysis
    }

    static analyzePassword(password) {
        const passwordAnalysis = {
            length: password !== undefined ? password.length : 0,
            numberOfDigits: 0,
            numberOfLetters: 0,
            numberOfUpperCase: 0,
            numberOfLowerCase: 0,
            numberOfSymbols: 0,
            entropy: PasswordCheck.#shannonEntropy(password),
            sequence: Math.min(
                PasswordCheck.#analyzeSequence(password, PasswordCheck.#getKeyboardSequence(navigator.language)),
                PasswordCheck.#analyzeSequence(password, PasswordCheck.#sequences['alphabet']
                )),
        }

        for (const char of password) {
            if (/\p{N}/u.test(char)) {
                passwordAnalysis.numberOfDigits += 1
            } else if (/\p{L}/u.test(char)) {
                passwordAnalysis.numberOfLetters += 1
                if (/\p{Lu}/u.test(char)) {
                    passwordAnalysis.numberOfUpperCase += 1
                } else if (/\p{Ll}/u.test(char)) {
                    passwordAnalysis.numberOfLowerCase += 1
                }
            } else {
                passwordAnalysis.numberOfSymbols += 1
            }
        }

        return passwordAnalysis
    }

    static #HEX_FORMAT_REGEX = /^[0-9a-fA-F\s-]+$/

    static isSecret(str) {
        if (str == null || str.length < 10) return false

        const analysis = PasswordCheck.analyzePassword(str)
        const isHex = PasswordCheck.#HEX_FORMAT_REGEX.test(str)

        return analysis.entropy > 3.8 ||
            isHex && analysis.entropy > 3.4 ||
            analysis.numberOfSymbols + analysis.numberOfUpperCase + analysis.numberOfDigits >= 4 &&  analysis.numberOfLowerCase > 0 && analysis.entropy > 3.2 ||
            analysis.numberOfSymbols >= 2 && analysis.numberOfUpperCase >= 2 && analysis.numberOfDigits >= 2 && analysis.numberOfLowerCase >= 0 && analysis.entropy > 3.2
    }

    static maskIfSecret(str, visibleStart = 3, visibleEnd = 3, maskChar = '•') {
        if (! PasswordCheck.isSecret(str)) return str

        const len = str?.length || 0
        if (len <= visibleStart + visibleEnd) {
            // too short, just mask everything
            return maskChar.repeat(len)
        }
        const start = str.slice(0, visibleStart)
        const end   = str.slice(-visibleEnd)
        const maskedSection = maskChar.repeat(5)
        return `${start}${maskedSection}${end}`
    }

    static #NON_DIGIT_REGEX = /[^0-9]+/
    static #CREDITCARD_FORMAT_REGEX = /^\s*[0-9\s-]+\s*$/

    static isCreditCard(str) {
        if (str == null || str.length < 13 || ! PasswordCheck.#CREDITCARD_FORMAT_REGEX.test(str)) return false

        const digits = str.replace(PasswordCheck.#NON_DIGIT_REGEX, '')

        if (digits.length < 13 || digits.length > 19) return false

        // Apply the Luhn algorithm
        let sum = 0
        let shouldDouble = false;
        for (let i = digits.length - 1; i >= 0; i--) {
            let d = parseInt(digits.charAt(i), 10)
            if (shouldDouble) {
                d *= 2
                if (d > 9) d -= 9
            }
            sum += d
            shouldDouble = !shouldDouble
        }

        return (sum % 10 === 0)
    }

    static getDomainFromUsername(username) {
        const matches = username?.match(/@([a-zA-Z0-9.-]+)$/);
        return matches ? matches[1] : null
    }

    // divide the length of the string by the number of sequential characters
    // ignore transitions between unknown chars and alpha to numeric (and vice versa)
    static #analyzeSequence(password, reference) {
        password = password.toLowerCase()

        let ignoredNext = 1
        let sequentialNext = 0;

        for (let i = 0; i < password.length - 1; i++) {
            const currentChar = password[i];
            const nextChar = password[i + 1];

            const currentIndex = reference.indexOf(currentChar);
            const nextIndex = reference.indexOf(nextChar);

            if (currentIndex === -1 || nextIndex === -1) {
                ignoredNext++
                continue;
            }

            // skip if transitioning between numbers and letters
            const isCurrentCharNumber = !isNaN(currentChar);
            const isNextCharNumber = !isNaN(nextChar);
            if (isCurrentCharNumber !== isNextCharNumber) {
                ignoredNext++
                continue;
            }

            const diff = Math.abs(nextIndex - currentIndex);
            if (diff === 1) {
                sequentialNext++
            }
        }

        return Math.pow((password.length  - ignoredNext) / sequentialNext, 2)
    }

    static #keyboards = {
        'en-US': 'en',
        'en-UK': 'en',
        'fr-FR': 'fr',
        'fr-CA': 'en',
        'fr-BE': 'fr',
        'fr-CH': 'ch',
        'nl-BE': 'en',
        'es-ES': 'es',
        'de-DE': 'de',
        'de-CH': 'ch',
        'it-IT': 'en',
        'it-CH': 'ch',
        'pt-BR': 'en',
        'pt-PT': 'pt',
        'nl-NL': 'en',
        'ru-RU': 'ru',
        'ja-JP': 'ja',
        'zh-CN': 'zh',
        'zh-TW': 'en',
        'ko-KR': 'ko',
        'ar-SA': 'ar',
        'sv-SE': 'sv',
        'da-DK': 'no',
        'fi-FI': 'sv',
        'no-NO': 'no',
        'pl-PL': 'en',
        'tr-TR': 'tr',
        'cs-CZ': 'cs',
        'hu-HU': 'hu',
        'el-GR': 'el',
        'he-IL': 'he',
        'th-TH': 'th',
        'vi-VN': 'en',
        'id-ID': 'en',
        'ms-MY': 'en',
        'ro-RO': 'en',
        'uk-UA': 'uk',
        'sk-SK': 'sk',
        'hr-HR': 'hr',
        'bg-BG': 'bg',
        'lt-LT': 'lt',
        'lv-LV': 'lv',
        'et-EE': 'et',
        'sl-SI': 'hr',
        'sr-RS': 'sr',
        'hi-IN': 'en',
        'bn-BD': 'en',
        'fa-IR': 'fa',
        'ur-PK': 'fa',
        'ta-IN': 'en',
        'te-IN': 'en',
        'ml-IN': 'en',
        'kn-IN': 'en',
        'mr-IN': 'en',
        'gu-IN': 'en',
    };

    static #sequences = {
        'alphabet': "abcdefghijklmnopqrstuvwxyz123456789",
        'en': "qwertyuiopasdfghjklzxcvbnm123456789",
        'fr': "azertyuiopqsdfghjklmwxcvbn123456789",
        'de': "qwertzuiopasdfghjklyxcvbnm123456789",
        'ch': "qwertzuiopasdfghjklöäyxcvbnm123456789",
        'es': "qwertyuiopasdfghjklñzxcvbnm123456789",
        'pt': "qwertyuiopasdfghjklçzxcvbnm123456789",
        'ru': "йцукенгшщзхъфывапролджэячсмитьбю123456789",
        'sv': "qwertyuiopåasdfghjklöäzxcvbnm123456789",
        'no': "qwertyuiopåasdfghjklæøzxcvbnm123456789",
        'tr': "qwertyuıopğasdfghjklşizxcvbnmöç123456789",
        'hu': "qwertzuiopőúasdfghjkléáűíyxcvbnmöüó123456789",
        'el': "ςερτυθιοπασδφγηξκλζχψωβνμ123456789",
        'he': "קראטוןםפשדגכעיחלךףזסבהנמצתץ123456789",
        'th': "ๅ/ฯภถุึคตจขช123456789",
        'uk': "йцукенгшщзхїфівапролджєячсмитьбю123456789",
        'sk': "qwertzuiopasdfghjklýxčvbnmľ123456789",
        'hr': "qwertzuiopasdfghjklčćžšđyxcvbnm123456789",
        'bg': "йцукенгшщзхъфхбпрлджэячстивмю123456789",
        'lt': "qwertyuiopasdfghjklščęzxcvbnmė123456789",
        'lv': "qwertyuiopasdfghjklžčņzxcvbnmļ123456789",
        'et': "qwertyuiopüõasdfghjklöäzxcvbnm123456789",
        'sr': "љњертзиопшђасдфгхјклћжџцвбнм123456789",
        'fa': "ضصثقفغعهخحجچژیطسشئبلاتنمکگ123456789",
    }

    static #getKeyboardSequence(locale) {
        const keyboard = PasswordCheck.#keyboards[locale] || 'en'
        return PasswordCheck.#sequences[keyboard]
    }

    static #shannonEntropy(str) {
        if (str.length === 0) return 0

        // Frequency map to count occurrences of each character
        const freqMap = {}
        for (const char of str.toLowerCase()) {
            freqMap[char] = (freqMap[char] || 0) + 1
        }

        const totalLength = str.length
        let entropy = 0

        // Calculate entropy
        for (const freq of Object.values(freqMap)) {
            const probability = freq / totalLength
            entropy -= probability * Math.log2(probability)
        }

        return Math.round(entropy * 1000) / 1000
    }

    static #salt
    static #knownAccounts = []
    static #ELEMENT_NAME = "citadel-password-check"

    static getSalt() {
        if (!PasswordCheck.#salt)
            if (Context.isPageScript()) {
                const el = document.querySelector(`meta[name="${PasswordCheck.#ELEMENT_NAME}"]`)
                PasswordCheck.#salt = el?.content ? PBKDF2.fromBase64(el.content) : undefined
            } else if (Context.isServiceWorker()) {
                PasswordCheck.#salt = PBKDF2.fromBase64(PasswordVault.prehashSalt)
            }

        return PasswordCheck.#salt
    }

    static {
        if (Context.isContentScript()) {
            callServiceWorker("InitPasswordCheck").then(info => {
                PasswordCheck.#knownAccounts = info.accounts
                PasswordCheck.#salt = info.salt ? PBKDF2.fromBase64(info.salt) : undefined

                document.head.appendChild(Object.assign(document.createElement("meta"), {
                    name: PasswordCheck.#ELEMENT_NAME,
                    content: info.salt
                }))
            })
        }
    }
}