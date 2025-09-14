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
    dom.url = storeUrl

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
    renderLogo(extensionInfo.extensionLogo)
    document.getElementById('extension-name').textContent = extensionInfo.name
    document.getElementById('extension-id').textContent = extensionInfo.id
    document.getElementById('extension-category').textContent = extensionInfo.categories.map(c => c.secondary).join(", ")

    renderVerified('risk-value-verified-extension', extensionInfo.isVerifiedExtension)
    renderVerified('risk-value-verified-publisher', extensionInfo.isVerifiedPublisher)

    document.getElementById('risk-value-downloads').textContent = renderNumber(extensionInfo.numInstalls)
    document.getElementById('risk-value-rating').textContent = renderNumber(extensionInfo.rating)
    document.getElementById('risk-value-ratings').textContent = renderNumber(extensionInfo.numRatings, true)
}

const riskClassMap = {
    1:      'risk-low',
    2:   'risk-medium',
    3:     'risk-high',
    4: 'risk-critical'
}

function renderManifestInfo(manifestInfo) {
    renderManifestVersion('risk-value-manifest', manifestInfo.manifest_version)

    const risks = manifestInfo.permissions.map(permission => Extension.Risk.of(permission))
        .filter(Boolean)
        .sort((a, b) => b.risk - a.risk)

    const tbody = document.getElementById('permissions')
    tbody.innerHTML = ''

    risks.forEach(permission => {
        const tr = document.createElement('tr')

        const nameTd = document.createElement('td')
        nameTd.textContent = permission.name
        tr.appendChild(nameTd)

        const descTd = document.createElement('td')
        descTd.textContent =  t(`extension-analysis.permissions.${permission.name}.analysis`)
        tr.appendChild(descTd)

        const riskTd = document.createElement('td')
        riskTd.textContent = t(`extension-analysis.risk-level.${permission.risk}`)
        const riskClass = riskClassMap[permission.risk]
        if (riskClass) riskTd.classList.add(riskClass)

        tr.appendChild(riskTd)

        tbody.appendChild(tr)
    })
}

function renderNumber(value, shorten) {
    if (typeof value !== 'number' || isNaN(value)) return ''

    if (shorten && Math.abs(value) >= 1000) {
        const units = [
            { divisor: 1e9, suffix: 'B' },
            { divisor: 1e6, suffix: 'M' },
            { divisor: 1e3, suffix: 'K' }
        ]

        for (const unit of units) {
            if (Math.abs(value) >= unit.divisor) {
                // Format to one decimal if needed, else no decimals
                let formatted = (value / unit.divisor).toLocaleString(undefined, {
                    minimumFractionDigits: (value / unit.divisor) % 1 === 0 ? 0 : 1,
                    maximumFractionDigits: 1
                })
                return formatted + unit.suffix
            }
        }
    }

    return value.toLocaleString()
}

function renderLogo(url) {
    const img = document.getElementById('extension-logo')
    img.src = url
    img.removeAttribute('hidden')
}

function renderManifestVersion(id, version) {
    const element = document.getElementById(id)
    element.textContent = "v" + version
    if (version > 2) element.classList.add('risk-low')
    return element

}
function renderVerified(id, isVerified) {
    const element = document.getElementById(id)
    element.textContent = isVerified ? t("global.yes") : t("global.no")
    if (isVerified) element.classList.add('risk-low')
    return element
}