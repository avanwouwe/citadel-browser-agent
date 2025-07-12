class I18n {

    static defaultLanguage = "en"

    #translations

    constructor(translations) {
        this.#translations = translations
    }

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

    static getLanguage() {
        return navigator.language.split('-')[0]
    }

    translatePage() {
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n')
            const translated = this.t(key)

            if (el.hasAttribute('placeholder')) {
                el.setAttribute('placeholder', translated)
            } else {
                el.textContent = translated
            }
        })

        document.querySelectorAll('[data-i18n-html]').forEach(el => {
            const key = el.getAttribute('data-i18n-html')
            el.innerHTML = this.t(key)
        })
    }

    getTranslator() {
        return this.t.bind(this)
    }

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

    static fromObject(obj = { }) {
        const lang = I18n.getLanguage()

        let translations = obj[lang]
        if (! translations) {
            console.warn(`cannot load i18n translations for "${lang}", falling back to "${I18n.defaultLanguage}"`)
            translations = obj[I18n.defaultLanguage]
        }

        if (! translations) {
            console.warn(`cannot load i18n fallback translations using language "${I18n.defaultLanguage}"`)
        }

        return new I18n(translations)
    }

    static loadPage(path, callback) {
        function domReady() {
            return new Promise(resolve => {
                if (document.readyState === "loading") {
                    document.addEventListener("DOMContentLoaded", resolve)
                } else {
                    resolve()
                }
            })
        }

        return async () => {
            const domPromise = domReady()
            const i18nPromise = I18n.fromFile(path)

            const [_, i18n] = await Promise.all([domPromise, i18nPromise])

            callback(i18n)
        }
    }
}