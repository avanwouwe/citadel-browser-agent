let config, tabState, storePage, storeInfo, scores

I18n.loadPage('/utils/i18n', async (i18n) => {
    t = i18n.getTranslator()
    i18n.translatePage()

    tabState = await new TabState().getState("ExtensionAnalysis")
    storePage = tabState.url
    config = tabState.config

    try {
        await renderPage()
    } catch (error) {
        console.error(error)
        showError(t('extension-analysis.block-page.status.error') + ' : ' + (error?.message || String(error)))
        if (config.exceptions.allowed) proposeException()
    }
})()

async function renderPage() {
    setStatus(t('extension-analysis.block-page.status.analyze-store'), true)

    document.getElementById("logo").src = tabState.logo

    storeInfo = await fetchStoreInfo(storePage)
    if (!storeInfo) {
        showError(t('extension-analysis.block-page.status.error-store'))
        return
    }
    renderStoreInfo(storeInfo)

    setStatus(t('extension-analysis.block-page.status.analyze-manifest'), true)
    const response = await fetch(storeInfo.downloadUrl)
    if (!response.ok) throw new Error("unable to download extension: " + response.status)
    const buffer = await response.arrayBuffer()
    const entries = await ExtensionStore.parsePackage(buffer)
    const manifest = await ExtensionStore.getManifest(entries)

    // Firefox extensionId cannot be determined from the storeUrl, only from the manifest. Now that we have it: was the extension already installed?
    if (Browser.version.brand === Browser.Firefox && await Extension.isInstalled(manifest?.browser_specific_settings?.gecko?.id)) {
        await callServiceWorker('ApproveExtension', { tabId: tabState.tabId, storePage })
        return
    }

    const permissionCheck = await Extension.checkPermissions(manifest, config)
    renderManifestInfo(manifest, permissionCheck.isBroad)

    config = config.extensions

    setStatus(t('extension-analysis.block-page.status.analyze-code'), true)

    scores = ExtensionAnalysis.calculateRisk(storeInfo, manifest)
    renderScore("global", scores)
    renderScore("likelihood", scores)
    renderScore("impact", scores)

    // TODO temporarily turn off risk analysis since it is not yet implemented
    scores.global = scores.global ?? 0
    scores.impact = scores.impact ?? 0
    scores.likelihood = scores.likelihood ?? 0

    const rejection = {}

    const allowId = evaluateBlacklist(storeInfo.id, config.id.allowed, config.id.forbidden, true)
    const allowCategory = evaluateBlacklist(storeInfo.categories.flatMap(c => [c.primary, c.secondary]), config.category.allowed, config.category.forbidden, true)
    const allowVerified = !config.verified.required || storeInfo.isVerifiedPublisher || storeInfo.isVerifiedExtension
    const allowInstallationCnt = storeInfo.numInstalls >= config.installations.required ?? 0
    const allowRating = storeInfo.rating >= (config.ratings.minRatingLevel ?? 0) && storeInfo.numRatings >= (config.ratings.minRatingCnt ?? 0)

console.log("permissionCheck", permissionCheck)
    console.log("config", config)
    console.log("manifest", manifest)

    if (!allowId) {
        rejection.reason = 'blacklist-extension'
    } else if (!allowCategory) {
        rejection.reason = 'blacklist-category'
    } else if (scores.global == null || scores.global > config.risk.maxGlobal) {
        rejection.reason = 'risk-global'
    } else if (scores.impact == null || scores.impact > config.risk.maxImpact) {
        rejection.reason = 'risk-impact'
    } else if (scores.likelihood == null || scores.likelihood > config.risk.maxLikelihood) {
        rejection.reason = 'risk-likelihood'
    } else if (!allowVerified) {
        rejection.reason = 'not-verified'
    } else if (!allowInstallationCnt) {
        rejection.reason = 'installation-count'
    } else if (!allowRating) {
        rejection.reason = 'poor-rating'
    } else if (!permissionCheck.allowPermissions) {
        rejection.reason = 'forbidden-permission'
        rejection.example = permissionCheck.blockingPermissions[0]
    } else if (!permissionCheck.allowAllDomains) {
        rejection.reason = 'all-domains'
        rejection.example = permissionCheck.broadHostPermissions[0]
    } else if (!permissionCheck.allowProtectedDomains) {
        rejection.reason = 'protected-domain'
        rejection.example = permissionCheck.protectedDomains[0]
    }

    const bypassVerified = config.verified.allowed && (storeInfo.isVerifiedPublisher || storeInfo.isVerifiedExtension)
    const bypassInstallationCnt = storeInfo.numInstalls >= config.installations.allowed

    const allowed = !rejection.reason || bypassVerified || bypassInstallationCnt

    const installButton = document.getElementById("installButton")
    installButton.onclick = () => callServiceWorker('ApproveExtension', { tabId: tabState.tabId, storePage })
    installButton.disabled = !allowed
    showAnalysis()

    if (!allowed) blockInstall(rejection)
}

async function fetchStoreInfo(storeUrl) {
    const html = await callServiceWorker('FetchExtensionPage', { url: storeUrl })
    const dom = html2dom(html.content)
    dom.url = storeUrl

    return ExtensionStore.of(storeUrl).parsePage(dom)
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

function renderManifestInfo(manifestInfo, isBroad) {
    renderManifestVersion('risk-value-manifest', manifestInfo.manifest_version)

    const permissions = [...manifestInfo.permissions]
    if (isBroad && !permissions.includes("<all_urls>")) {
        permissions.push("<all_urls>")
    }

    const risks = permissions.map(permission => Extension.Risk.ofPermission(permission))
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
        descTd.textContent =  t(`extension-analysis.permissions.${permission.name}.analysis`)
        tr.appendChild(descTd)

        if (permission.risk) {
            const riskTd = document.createElement('td')
            riskTd.textContent = t(`extension-analysis.risk-level.${permission.risk}`)
            const riskClass = riskClassMap[permission.risk]
            if (riskClass) riskTd.classList.add(riskClass)
            tr.appendChild(riskTd)
        }

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

function renderScore(type, scores) {
    const id = `risk-${type}`
    const score = formatScore(scores[type])
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

function showError(error) {
    setStatus(error, false)
    const backButton = document.getElementById("backButton")
    backButton.onclick = () => { window.history.go(-2) }
    backButton.hidden = false
}

function blockInstall(rejection) {
    document.getElementById("blockedSection").textContent = `${t('extension-analysis.block-page.install-blocked.blocked')} ${t('extension-analysis.block-page.install-blocked.' + rejection.reason, rejection)}.`
    if (config.exceptions.allowed) proposeException()
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
        const exceptionReason = exceptionReasonInput.value.trim()

        sendMessage('allow-extension', {
            url: storePage,
            reason: exceptionReason,
            extension: {
                name: storeInfo.name,
                id: storeInfo.id,
                score: formatScore(scores.global)
            }
        })
    })
}