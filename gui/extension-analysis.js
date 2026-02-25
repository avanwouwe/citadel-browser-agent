let t, config, tabState, storePage, storeInfo, manifest, evaluation

I18n.loadPage('/utils/i18n', async (i18n) => {
    t = i18n.getTranslator()
    i18n.translatePage()

    if (Context.isExtensionPage()) {
        tabState = await new TabState().getState("ExtensionAnalysis")
        storePage = tabState.url
        config = tabState.config

        try {
            await renderPage()
        } catch (exception) {
            const errorType = ExtensionAnalysis.Headless.findErrorType(exception, { storeInfo, manifest, evaluation })
            setError(errorType)
            if (config.extensions.exceptions.allowed) proposeException()
        }
    } else {
        chrome.runtime.onMessage.addListener((request, _, sendResponse) => {
            if (request.type === 'PING') {
                sendResponse({ready: true})
                return
            }

            if (request.type !== 'ANALYZE_EXTENSION') return

            (async () => {
                const analysisPromise = ExtensionAnalysis.promiseOf(request.storePage, request.config)
                const analysis = await ExtensionAnalysis.Headless.resolveAnalysis(analysisPromise)
                sendResponse(analysis)
            })()

            return true
        })
    }
})()


async function renderPage() {
    document.getElementById("backButton").onclick = () => { window.history.go(-2) }

    setStatus(t('extension-analysis.block-page.status.analyze-store'), true)
    document.getElementById("logo").src = tabState?.logo

    const analysis = ExtensionAnalysis.promiseOf(storePage, config)

    storeInfo = await analysis.storeInfo
    renderStoreInfo()

    setStatus(t('extension-analysis.block-page.status.analyze-manifest'), true)
    manifest = await analysis.manifest
    evaluation = await analysis.evaluation
    renderManifestInfo()

    setStatus(t('extension-analysis.block-page.status.analyze-code'), true)

    // TODO temporarily turn off risk analysis since it is not yet implemented
    const scores = evaluation.scores
    scores.global = null
    scores.impact = null
    scores.likelihood = null

    renderScore("global")
    renderScore("likelihood")
    renderScore("impact")

    showAnalysis()
    showInstall(evaluation.allowed)
}

function showInstall(allowed) {
    if (allowed) {
        const installButton = document.getElementById("installButton")
        installButton.onclick = () => callServiceWorker('ShowExtensionPage', { tabId: tabState.tabId, storePage })
        installButton.disabled = false
    } else {
        const rejection = evaluation?.rejection
        document.getElementById("blockedSection").textContent = `${t('extension-analysis.block-page.install-blocked.blocked')} ${t('extension-analysis.block-page.install-blocked.' + rejection.reasons[0], rejection)}.`
        if (config.extensions.exceptions.allowed) proposeException()
    }
}

function renderStoreInfo() {
    renderLogo(storeInfo.extensionLogo)
    document.getElementById('extension-name').textContent = storeInfo.name
    document.getElementById('extension-id').textContent = storeInfo.id
    document.getElementById('extension-category').textContent = storeInfo.categories.map(c => c.secondary).join(", ")

    renderVerified('risk-value-verified-extension', storeInfo.isVerifiedExtension)
    renderVerified('risk-value-verified-publisher', storeInfo.isVerifiedPublisher)

    document.getElementById('risk-value-downloads').textContent = renderNumber(storeInfo.numInstalls)
    document.getElementById('risk-value-rating').textContent = renderNumber(storeInfo.rating, false, true)
    document.getElementById('risk-value-ratings').textContent = renderNumber(storeInfo.numRatings, true, false)
}

const riskClassMap = {
    1:      'risk-low',
    2:   'risk-medium',
    3:     'risk-high',
    4: 'risk-critical'
}

function renderManifestInfo() {
    renderManifestVersion('risk-value-manifest', manifest.manifest_version)

    const risks = evaluation.permissionCheck.effectivePermissions.map(permission => Extension.Permissions.riskOf(permission))
        .filter(Boolean)
        .sort((a, b) => (b.risk ?? 0) - (a.risk ?? 0))

    const tbody = document.getElementById('permissions')
    tbody.innerHTML = ''

    risks.forEach(permission => {
        const tr = document.createElement('tr')

        const nameTd = document.createElement('td')
        nameTd.textContent = permission.name
        tr.appendChild(nameTd)

        const descTd = document.createElement('td')
        const key = `extension-analysis.permissions.${permission.name.replace('.','_')}.analysis`
        const trad = t(key)
        descTd.textContent = trad === key ? '' : trad
        tr.appendChild(descTd)

        const riskTd = document.createElement('td')
        if (permission.risk) {
            riskTd.textContent = t(`extension-analysis.risk-level.${permission.risk}`)
            const riskClass = riskClassMap[permission.risk]
            if (riskClass) riskTd.classList.add(riskClass)
            tr.appendChild(riskTd)
        }
        tr.appendChild(riskTd)

        tbody.appendChild(tr)
    })
}

function renderNumber(value, shorten = false, decimal = false) {
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

    return decimal ?
        value.toLocaleString(undefined, {minimumFractionDigits: 1}) :
        value.toLocaleString()
}

function renderLogo(url) {
    if (!url) return

    const img = document.getElementById('extension-logo')
    img.src = url
    img.hidden = false
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

function renderScore(type) {
    const id = `risk-${type}`
    const score = formatScore(evaluation.scores[type])
    const risk = Extension.Risk.ofScore(score).toLowerCase()
    const riskClass = `risk-${risk}`
    const riskLabel = t(`extension-analysis.levels.${risk}`)
    const scoreLabel = t(`extension-analysis.scores.${type}.label`)
    const scoreDescription = t(`extension-analysis.scores.${type}.description`)

    const html = `
        <div class="risk-score ${riskClass}">
            <small>${scoreLabel}</small>
            <p>${score ?? "??"} / 10</p>
            <strong>
                ${riskLabel}
                    <span class="help">
                    <svg width="14px" height="14px" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M9 9C9 5.49997 14.5 5.5 14.5 9C14.5 11.5 12 10.9999 12 13.9999" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M12 18.01L12.01 17.9989" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
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

function formatScore(score) { return score != null ? Number(score).toFixed(1) : score }

function showAnalysis() {
    document.getElementById("status").hidden = true
    document.getElementById("content").hidden = false
}

function setStatus(text, showSpinner = true) {
    document.getElementById('status-text').textContent = text + (showSpinner ? '...' : '')
    document.getElementById('status-spinner').hidden = !showSpinner
}

function setError(message) {
    const retryButton = document.getElementById("retryButton")
    retryButton.hidden = false
    retryButton.onclick = () => location.reload()

    const error = t(`extension-analysis.block-page.status.${errorType}`) + (message ? ' : ' + message : '')
    setStatus(error, false)
}

function proposeException() {
    const exceptionSectionToggle = document.getElementById('exceptionSectionToggle')
    exceptionSectionToggle.hidden = false
    exceptionSectionToggle.addEventListener('click', function() {
        exceptionSectionToggle.hidden = true
        document.getElementById('exceptionSection').hidden = false
        document.getElementById("backButton").hidden = true
    })

    const exceptionReasonInput = document.getElementById('exceptionReason')
    const exceptionButton = document.getElementById('submitException')

    // Enable submit button only when text field is filled
    exceptionButton.disabled = true
    exceptionReasonInput.addEventListener('input', function() {
        exceptionButton.disabled = !exceptionReasonInput.value.trim()
    })

    // Handle exception request submission
    exceptionButton.addEventListener('click', function() {
        evaluation.allowed = true

        const exception = {
            storePage,
            analysis: { storeInfo, manifest, evaluation },
            exceptionReason: exceptionReasonInput.value.trim()
        }

        sendMessage('allow-extension', exception)
    })
}