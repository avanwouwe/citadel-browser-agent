I18n.loadPage('/utils/i18n', async (i18n) => {
    t = i18n.getTranslator()
    i18n.translatePage()
    await renderPage()
})()

async function renderPage() {
    const tabState = await new TabState().getState("ExtensionAnalysis")
    const extensionPage = tabState.url

    document.getElementById("logo").src = tabState.logo

    const exceptionSectionToggle = document.getElementById('exceptionSectionToggle')
    const exceptionSection = document.getElementById('exceptionSection')

    if (tabState.allowException) {
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

            sendMessage('allow-extension', {
                url: extensionPage,
                reason: exceptionReason
            })

            alert(t("extension-analysis.block-page.request-submitted-popup"))

            history.go(-2)
        })

        const storeInfo = await fetchStoreInfo(extensionPage)
        renderStoreInfo(storeInfo)

        const manifestInfo = await fetchManifestInfo(storeInfo.downloadUrl)
        renderManifestInfo(manifestInfo)
        console.log(storeInfo, manifestInfo)
    }
}

async function fetchStoreInfo(storeUrl) {
    const html = await sendMessagePromise('FetchExtensionPage', { url: storeUrl })
    const dom = html2dom(html.content)
    dom.location = { href: storeUrl }

    const store = ExtensionStore.of(storeUrl)
    const extensionInfo = store.parsePage(dom)
    if (!extensionInfo) return null
    extensionInfo.extensionId = ExtensionStore.extensionIdOf(storeUrl)

    return extensionInfo
}

async function fetchManifestInfo(downloadUrl) {
    return await sendMessagePromise('FetchExtensionManifest', { url: downloadUrl })
}

function renderStoreInfo(extensionInfo) {
    document.getElementById('risk-value-name').textContent = extensionInfo.name
    document.getElementById('risk-value-id').textContent = extensionInfo.id
    document.getElementById('risk-value-category').textContent = extensionInfo.categories.map(c => c.secondary).join(", ")

    document.getElementById('risk-value-verified-extension').textContent = extensionInfo.isVerifiedExtension
    document.getElementById('risk-value-verified-publisher').textContent = extensionInfo.isVerifiedPublisher
    document.getElementById('risk-value-downloads').textContent = extensionInfo.numInstalls
    document.getElementById('risk-value-rating').textContent = extensionInfo.rating
    document.getElementById('risk-value-ratings').textContent = extensionInfo.numRatings

}

function renderManifestInfo(manifestInfo) {
    document.getElementById('risk-value-manifest').textContent = "v" + manifestInfo.manifest_version

    const risks = manifestInfo.permissions.map(permission => Extension.Risk.of(permission)).filter(Boolean)

    const tbody = document.getElementById('permissions')
    tbody.innerHTML = ''

    risks.forEach(permission => {
        const tr = document.createElement('tr')

        const nameTd = document.createElement('td')
        nameTd.textContent = permission.name
        tr.appendChild(nameTd)

        const descTd = document.createElement('td')
        descTd.textContent = t(`extension-analysis.risk-level.${permission.risk}`)
        tr.appendChild(descTd)

        const riskTd = document.createElement('td')
        riskTd.textContent =  t(`extension-analysis.permissions.${permission.name}.analysis`)
        tr.appendChild(riskTd)

        tbody.appendChild(tr)
    })

}