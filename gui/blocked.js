I18n.loadPage('/utils/i18n', async (i18n) => {
    t = i18n.getTranslator()
    i18n.translatePage()
    await renderPage()
})()

async function renderPage() {
    const blocked = await new TabState().getState("BlockedPage")

    document.getElementById("logo").src = blocked.logo
    document.getElementById('url').textContent = blocked.url || t("block-page.not-specified")
    document.getElementById('reason').textContent = blocked.reason || t("block-page.not-specified")
    document.getElementById('contact').textContent = blocked.contact

    const exceptionSectionToggle = document.getElementById('exceptionSectionToggle')
    const exceptionSection = document.getElementById('exceptionSection')

    if (blocked.allowException) {
        exceptionSectionToggle.style.display = 'block'

        exceptionSectionToggle.addEventListener('click', function() {
            exceptionSection.style.display = 'block'
            exceptionSectionToggle.style.display = 'none'
        })

        const exceptionReasonInput = document.getElementById('exceptionReason')
        const submitButton = document.getElementById('submitException')

        // Enable submit button only when text field is filled
        submitButton.disabled = true
        exceptionReasonInput.addEventListener('input', function() {
            submitButton.disabled = !exceptionReasonInput.value.trim()
        })

        // Handle exception request submission
        submitButton.addEventListener('click', function() {
            const exceptionReason = exceptionReasonInput.value.trim()

            chrome.runtime.sendMessage({
                type: 'allow-blacklist',
                url: blocked.url,
                description: blocked.reason,
                reason: exceptionReason
            })

            alert(t("block-page.request-submitted-popup"))

            history.go(-2)
        })

    }
}