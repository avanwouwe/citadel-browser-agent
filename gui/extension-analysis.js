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

        const entries = await ExtensionStore.fetchPackage(storeInfo.downloadUrl)
        const manifest = await ExtensionStore.getManifest(entries)
        renderManifestInfo(manifest)

        const staticAnalysis = ExtensionStore.analyseStatically(entries)
        console.log(staticAnalysis)

        const scores = ExtensionAnalysis.calculateRisk(storeInfo, manifest, staticAnalysis)
        renderScore("global", scores)
        renderScore("likelihood", scores)
        renderScore("impact", scores)
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

    const risks = manifestInfo.permissions.map(permission => Extension.Risk.ofPermission(permission))
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

function renderScore(type, scores) {
    const id = `risk-${type}`
    const score = Number(scores[type]).toFixed(1)
    const risk = Extension.Risk.ofScore(score).toLowerCase()
    const riskClass = `risk-${risk}`
    const riskLabel = t(`extension-analysis.levels.${risk}`)
    const scoreLabel = t(`extension-analysis.scores.${type}.label`)
    const scoreDescription = t(`extension-analysis.scores.${type}.description`)

    const html = `
        <div class="risk-score ${riskClass}">
            <small>${scoreLabel}</small>
            <p>${score} / 10</p>
            <strong>
                ${riskLabel}
                <span class="help">
                    <svg width="14" height="15" viewBox="0 0 14 15" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <rect x="0.5625" y="0.583008" width="12.875" height="12.875" rx="6.4375" stroke="white" stroke-width="1.125"></rect>
                        <path d="M6.875 3.52051V8.02051" stroke="white" stroke-width="1.125" stroke-linecap="round" stroke-linejoin="round"></path>
                        <path d="M6.875 9.89551H6.88272" stroke="white" stroke-width="1.125" stroke-linecap="round" stroke-linejoin="round"></path>
                    </svg>
                    <span class="tooltip">
                        <span>${scoreDescription}.</span>
                    </span>
                </span>
            </strong>
        </div>
    `

    const element = document.getElementById(id)
    element.innerHTML = html
}