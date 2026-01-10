I18n.loadPage('/utils/i18n', async (i18n) => {
    t = i18n.getTranslator()
    await renderPage(i18n)
})()

async function renderPage(i18n) {
    const blocked = await new TabState().getState("BlockedPage")

    const handlers = {
        exceptionToggle: {
            enableExceptionSection: function(e) {
                const exceptionSection = document.getElementById('exceptionSection')
                const exceptionSectionToggle = document.getElementById('exceptionSectionToggle')

                exceptionSection.style.display = 'block'
                exceptionSectionToggle.style.display = 'none'
            }
        }
    }

    const values = {
        securityAnalysisUrl: await getSecurityAnalysisUrl(blocked.url)
    }

    i18n.translatePage(handlers, values)

    document.getElementById("logo").src = blocked.logo
    document.getElementById('url').textContent = blocked.url || t("block-page.not-specified")
    document.getElementById('reason').textContent = blocked.reason || t("block-page.not-specified")
    document.getElementById('contact').textContent = blocked.contact

    if (blocked.allowException) {
        document.getElementById('exceptionSectionToggle').style.display = 'block'

        const exceptionReasonInput = document.getElementById('exceptionReason')
        const submitButton = document.getElementById('submitException')

        submitButton.disabled = true
        exceptionReasonInput.addEventListener('input', function() {
            submitButton.disabled = !exceptionReasonInput.value.trim()
        })

        submitButton.addEventListener('click', function() {
            const exceptionReason = exceptionReasonInput.value.trim()

            sendMessage('allow-blacklist', {
                url: blocked.url,
                description: blocked.reason,
                reason: exceptionReason
            })

            alert(t("block-page.request-submitted-popup"))

            history.go(-2)
        })
    }
}