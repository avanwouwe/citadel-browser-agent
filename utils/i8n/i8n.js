class I8N {

    static defaultLanguage = "en"

    #translations

    constructor(translations) {
        this.#translations = translations
    }

    t(key, values = {}) {
        if (key === undefined) return undefined

        let template = key.split('.').reduce((o, k) => (o ? o[k] : undefined), this.#translations)
        if (!template) {
            console.warn(`missing key "${key}" for language ${I8N.getLanguage()}`)
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
            el.textContent = this.t(key)
        })
        document.querySelectorAll('[data-i18n-html]').forEach(el => {
            const key = el.getAttribute('data-i18n-html')
            el.innerHTML = this.t(key)
        })
    }

    getTranslator() {
        return this.t.bind(this)
    }

    static async fromFile(path, lang = I8N.getLanguage()) {
        const i8n = new I8N()
        const filename = `${path}/${lang}.json`
        try {
            i8n.#translations = await readJsonFile(filename)
        } catch (err) {
            console.warn(`cannot load i8n file ${filename}: ${err}`)
            if (lang !== I8N.defaultLanguage) {
                return await I8N.fromFile(path, I8N.defaultLanguage)
            }
        }
        return i8n
    }

    static fromObject(obj) {
        const lang = I8N.getLanguage()

        let translations = obj[lang]
        if (! translations) {
            console.warn(`cannot load i8n translations for "${lang}", falling back to "${I8N.defaultLanguage}"`)
            translations = obj.en
        }

        if (! translations) {
            console.warn(`cannot load i8n fallback translations using language "${I8N.defaultLanguage}"`)
        }

        return new I8N(translations)
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
            const i8nPromise = I8N.fromFile(path)

            const [_, i8n] = await Promise.all([domPromise, i8nPromise])

            callback(i8n)
        }
    }
}