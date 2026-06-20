class I18n {

    static defaultLanguage = "en"

    #translations

    constructor(translations) {
        this.#translations = translations
    }

    /**
     * Translate a key with optional variable substitution
     * @param {string} key - Translation key (e.g., "block-page.title")
     * @param {Object} values - Values to substitute in template (e.g., {name: "John"})
     * @returns {string} Translated string
     */
    t(key, values = {}) {
        if (key === undefined) return undefined

        let template = key.split('.').reduce((o, k) => (o ? o[k] : undefined), this.#translations)
        if (!template) {
            console.warn(`missing key "${key}" for language ${I18n.getLanguage()}`)
            return key
        }

        return template.replace(/{{\s*([\w.]+)\s*}}/g, (match, p1) => {
            return (p1 in values) ? values[p1] : match
        })
    }

    /**
     * Translate all elements in the page with data-i18n attributes
     * @param {Object} handlers - Optional handlers for rich text elements
     * @param {Object} values - Optional values for template substitution
     */
    translatePage(handlers = {}, values = {}) {
        // Handle simple text translations
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n')
            const translated = this.t(key, values)

            if (el.hasAttribute('placeholder')) {
                el.setAttribute('placeholder', translated)
            } else {
                el.textContent = translated
            }
        })

        // Handle rich text with safe markup
        document.querySelectorAll('[data-i18n-rich]').forEach(el => {
            const key = el.getAttribute('data-i18n-rich')
            const handlerKey = el.getAttribute('data-handler')

            el.textContent = ''
            const translated = this.t(key, values)
            const elementHandlers = handlerKey && handlers[handlerKey] ? handlers[handlerKey] : {}
            el.safeInnerHTML(translated, elementHandlers)
        })
    }

    /**
     * Get browser language code
     * @returns {string} Language code (e.g., "en", "de")
     */
    static getLanguage() {
        return navigator.language.split('-')[0]
    }

    /**
     * Get bound translator function
     * @returns {Function} Bound t() function
     */
    getTranslator() {
        return this.t.bind(this)
    }

    /**
     * Load translations from JSON file
     * @param {string} path - Path to translations directory (without trailing slash)
     * @param {string} lang - Language code (defaults to browser language)
     * @returns {Promise<I18n>} I18n instance
     */
    static async fromFile(path, lang = I18n.getLanguage()) {
        const i18n = new I18n()
        const filename = `${path}/${lang}.json`
        try {
            i18n.#translations = await readJsonFile(filename)
        } catch (err) {
            console.warn(`cannot load i18n file ${filename}: ${err}`)
            if (lang !== I18n.defaultLanguage) {
                return await I18n.fromFile(path, I18n.defaultLanguage)
            }
        }
        return i18n
    }

    /**
     * Load translations from object
     * @param {Object} obj - Object with language codes as keys
     * @returns {I18n} I18n instance
     */
    static fromObject(obj = {}) {
        const lang = I18n.getLanguage()

        let translations = obj[lang]
        if (!translations) {
            console.warn(`cannot load i18n translations for "${lang}", falling back to "${I18n.defaultLanguage}"`)
            translations = obj[I18n.defaultLanguage]
        }

        if (!translations) {
            console.warn(`cannot load i18n fallback translations using language "${I18n.defaultLanguage}"`)
        }

        return new I18n(translations)
    }

    /**
     * Helper to load page translations and execute callback when ready
     * @param {string} path - Path to translations directory
     * @param {Function} callback - Callback that receives i18n instance
     * @returns {Function} Async function to execute
     */
    static loadPage(path, callback) {
        return async () => {
            const [_, i18n] = await Promise.all([
                domReady(),
                I18n.fromFile(path)
            ])

            callback(i18n)
        }
    }
}