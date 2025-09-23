class Modal {
    static #HOST_ELEMENT_ID = "CitadelModalOverlayHost"

    static async createForDomain(domain, title, message, onAcknowledge, onException) {
        const options = Modal.#prepareOptions(title, message, onAcknowledge, onException)

        await injectFilesIntoDomain(domain, ['/gui/modal.js'])
        await injectFuncIntoDomain(domain, async options => await Modal.create(options), [options])
    }

    static async createForTab(tabId, title, message, onAcknowledge, onException) {
        const options = Modal.#prepareOptions(title, message, onAcknowledge, onException)

        await injectFilesIntoTab(tabId, ['/gui/modal.js']).catch(err => console.error(err))
        await injectFuncIntoTab(tabId, async options => await Modal.create(options), [options])
    }

    static async removeFromDomain(domain) {
        return injectFuncIntoDomain(domain, (elemId) => document.getElementById(elemId)?.remove(), [Modal.#HOST_ELEMENT_ID])
    }

    static async removeFromTab(tabId) {
        return injectFuncIntoTab(tabId, (elemId) => document.getElementById(elemId)?.remove(), [Modal.#HOST_ELEMENT_ID])
    }

    static async create(options) {
        await domReady()

        if (document.getElementById(Modal.#HOST_ELEMENT_ID)) return

        const page = await fetch(chrome.runtime.getURL("/gui/modal.html"))
        const css = await fetch(chrome.runtime.getURL("/gui/modal.css"))
        const host = document.createElement('div')
        host.id = Modal.#HOST_ELEMENT_ID
        document.body.appendChild(host)
        const shadow = host.attachShadow({mode: 'open'})
        shadow.innerHTML = `<style>${await css.text()}</style>${await page.text()}`

        shadow.getElementById('companyLogo').src = options.logo || ''
        shadow.getElementById('modalTitle').textContent = options.text.title || ''
        shadow.getElementById('modalMessage').innerHTML = options.text.message || ''

        const acknowledge = shadow.getElementById('acknowledgeButton')
        acknowledge.hidden = options.onAcknowledge === undefined
        acknowledge.textContent = options.text.acknowledge || ''

        acknowledge.addEventListener('click', function () {
            sendMessage(options.onAcknowledge)
        })

        if (!options.exception) {
            shadow.getElementById('exceptionDiv').hidden = true
            return
        }

        shadow.getElementById('exceptionEnabler').innerHTML = options.exception.text.request || ''
        shadow.getElementById('exceptionTitle').innerText = options.exception.text.requestHeader || ''
        shadow.getElementById('exceptionTextarea').placeholder = options.exception.text.provideReason || ''
        shadow.getElementById('exceptionSubmit').innerText = options.exception.text.submitRequest || 'Submit'

        const exceptionEnabler = shadow.getElementById('exceptionEnabler')
        const exceptionSection = shadow.getElementById('exceptionSection')
        exceptionEnabler.onclick = () => {
            acknowledge.hidden = true
            exceptionSection.style.display = 'flex'
            shadow.getElementById('exceptionTextarea').focus()
        }

        const textarea = shadow.getElementById('exceptionTextarea')
        const submit = shadow.getElementById('exceptionSubmit')
        textarea.addEventListener('input', () => {
            submit.disabled = !textarea.value.trim()
        })

        submit.addEventListener('click', function() {
            const onException = options.exception.onException ?? {}
            onException.reason = textarea.value.trim()

            sendMessage(onException)
        })
    }

    static #prepareOptions(title, message, onAcknowledge, onException) {
        const options = {
            logo: Logo.getLogo(),
            text: {
                title,
                message,
                acknowledge: t("block-modal.acknowledge"),
            },
        }

        if (onAcknowledge) {
            options.onAcknowledge = onAcknowledge
        }

        if (onException) {
            options.exception = {
                text: {
                    request: t("block-modal.request-exception"),
                    requestHeader: t("block-modal.request-exception-header"),
                    provideReason: t("block-modal.provide-reason"),
                    submitRequest: t("block-modal.submit-request"),
                },
                onException
            }
        }

        return options
    }
}
