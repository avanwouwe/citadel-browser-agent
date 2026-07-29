let t
let port
let config
let updateBtn
let currentTab

// ── Entry point ───────────────────────────────────────────────────────────────

I18n.loadPage('/utils/i18n', async (i18n) => {
    t = i18n.getTranslator()
    i18n.translatePage()

    await callServiceWorker("GetConfig").then(conf => config = conf)

    init()

    const params = new URLSearchParams(window.location.search)
    selectTab(params.get('tab') ?? 'device')
})().catch(err => console.error('dashboard init failed', err))

function init() {
    wireTabs()
    wireUpdateButton()
    wireTooltip()
    document.addEventListener('visibilitychange', handleVisibilityChange)
    connect()
}

// ── Tab handling ──────────────────────────────────────────────────────────────

const renderTab = (tabId) => dashboards[tabId]?.()

function wireTabs() {
    document.querySelectorAll('.tab').forEach(btn => {
        btn.addEventListener('click', () => selectTab(btn.id))
    })
}

function selectTab(tabId) {
    currentTab = tabId

    const tabButtons = document.querySelectorAll('.tab')
    const tabContents = document.querySelectorAll('.tab-content')

    for (let i = 0; i < tabButtons.length; i++) {
        const isActive = tabButtons[i].id === tabId
        tabButtons[i].classList.toggle('active', isActive)
        tabContents[i].classList.toggle('active', isActive)
    }

    renderTab(tabId)

    const params = new URLSearchParams(window.location.search)
    params.set('tab', tabId)
    window.history.replaceState({}, '', `${window.location.pathname}?${params}`)

    handleVisibilityChange()

    const manualLink = document.getElementById('manual-link')
    if (manualLink) {
        manualLink.href = tabId === 'privacy'
            ? 'https://citadelagent.org/privacy'
            : `https://citadelagent.org/dashboard/${tabId}-dashboard`
    }}

// ── Dashboards ────────────────────────────────────────────────────────────────

let devicetrust

const renderDeviceDashboard = serialized(async function () {
    const prevCompliance = devicetrust?.compliance
    devicetrust = await callServiceWorker("GetDeviceStatus")
    const controls = Object.values(devicetrust.controls)
        .sort((a, b) => a.name.localeCompare(b.name))
    const state = devicetrust.state

    document.getElementById("status-label").textContent = t("control.state." + state) || "-"
    document.getElementById("dot").className = "state-dot " + state.toLowerCase()

    document.getElementById("compliance").textContent = devicetrust.compliance

    if (state === State.UNKNOWN) return

    const anyFailing = controls.some(ctrl => !ctrl.report.passing)
    const tb = document.getElementById("devicetrust-issues")
    tb.innerHTML = ""
    tb.classList.toggle('has-failures', anyFailing)

    for (const ctrl of controls) {
        const next = ctrl.nextState
        const ctrlText = I18n.fromObject(ctrl.definition?.text).getTranslator()

        let label = ctrlText("label") ?? ctrl.name
        const explainPage = ctrlText("explain")
        if (explainPage) {
            label = `<a href="${(safeHref(explainPage) ?? '').escapeHtmlEntities()}" target="_blank">${label.escapeHtmlEntities()}`

            if (! ctrl.report.passing) {
                label += '&nbsp' + Icons.outgoingLink
            }

            label += '</a>'
        }

        let errors = ''
        if (!ctrl.passing && ctrl.report?.errors?.length) {
            errors = ctrl.report.errors.slice(0, 30).join('\n')
            if (ctrl.report.errors.length > 30) {
                errors += '\n...'
            }
            errors = `<span class="has-errors" title="${t("dashboard.action.detail")}" data-tooltip="${errors.escapeHtmlEntities()}">${Icons.search}</span>`
        }

        const tr = document.createElement("tr")
        tr.innerHTML =
            `<td ${explainPage ? "class='label'" : ''}>${label}</td>` +
            `<td>${errors}</td>` +
            `<td class="state ${ctrl.state.toLowerCase()}">${t("control.state." + ctrl.state)}</td>` +
            `<td class="days">${next.days ?? ""}</td>` +
            `<td class="nextstate ${next.state.toLowerCase()}">${t("control.state." + next.state)}</td>`
        tb.appendChild(tr)
    }

    if (prevCompliance < 100 && devicetrust.compliance === 100) confettiCelebrate()
})

const renderAccountDashboard = serialized(async function () {
    const tb = document.getElementById("accounttrust-issues")
    tb.innerHTML = ""

    tb.removeEventListener('click', handleDeleteAccount)
    tb.addEventListener('click', handleDeleteAccount)

    const failingAccounts = await callServiceWorker("GetAccountStatus")
    for (const acct of Object.values(failingAccounts)) {
        const next = acct.report.nextState

        const tr = document.createElement("tr")
        tr.innerHTML =
            `<td><span class="ellipsis"></span></td>` +
            `<td class="label"><span class="ellipsis"><a target="_blank" rel="noopener noreferrer"></a></span></td>` +
            `<td class="issues"></td>` +
            `<td class="state ${acct.report.state.toLowerCase()}">${t("control.state." + acct.report.state)}</td>` +
            `<td class="days">${next?.days ?? ""}</td>` +
            `<td class="nextstate ${next.state.toLowerCase()}">${t("control.state." + next.state)}</td>` +
            `<td><span class="delete-btn" title="${t("dashboard.action.delete")}">${Icons.delete}</span></td>`

        const userSpan = tr.cells[0].querySelector("span")
        userSpan.title = acct.username
        userSpan.textContent = acct.username

        const systemAnchor = tr.cells[1].querySelector("a")
        systemAnchor.href = `https://${acct.system}`
        systemAnchor.textContent = acct.system
        systemAnchor.appendChild(document.createTextNode("\u00A0"))
        systemAnchor.appendChild(Icons.nodeOf(Icons.outgoingLink))
        tr.cells[1].querySelector("span").title = acct.system

        // Issues as plain text (safe, no HTML injection, newlines preserved via CSS)
        tr.cells[2].textContent = acct.report.issues?.description ?? ""

        const deleteBtn = tr.querySelector(".delete-btn")
        deleteBtn.dataset.username = acct.username
        deleteBtn.dataset.system = acct.system

        tb.appendChild(tr)
    }
})

const renderExtensionDashboard = serialized(async function () {
    const extensionTrust = await callServiceWorker("GetExtensionStatus")
    const extensions = Object.values(extensionTrust)
        .sort((a, b) => a.storeInfo.id.localeCompare(b.storeInfo.id))

    const lockStatusColumn = Browser.isFirefox() && ! await Extension.isAdminInstalled()

    const tb = document.getElementById("extension-details")
    tb.innerHTML = ""

    tb.removeEventListener('click', handleExtensionAction)
    tb.addEventListener('click', handleExtensionAction)

    for (const analysis of extensions) {
        if (! analysis.isInstalled) continue

        let issues = ''
        if (! analysis.evaluation?.allowed) {
            issues = `<span class="has-errors" title="${t("dashboard.action.detail")}" data-tooltip="${analysis.issues.escapeHtmlEntities()}">${Icons.search}</span>`
        }

        const name = analysis.storeInfo?.name ?? ''

        let logoEl
        if (analysis.storeInfo?.extensionLogo) {
            logoEl = document.createElement("img")
            logoEl.src = analysis.storeInfo.extensionLogo
            logoEl.alt = `${name} logo`
            logoEl.className = "extension-logo"
            logoEl.addEventListener("error", () => { logoEl.style.display = 'none' })
        } else {
            logoEl = document.createElement("span")
            logoEl.className = "extension-logo-placeholder"
            logoEl.appendChild(Icons.nodeOf(Icons.extension, 25))
        }

        const storePage = safeHref(analysis.storeInfo?.storePage)
        let nameEl
        if (storePage) {
            nameEl = document.createElement("a")
            nameEl.href = storePage
            nameEl.target = "_blank"
            nameEl.rel = "noopener noreferrer"
            nameEl.textContent = name
            nameEl.appendChild(document.createTextNode('\xA0'))
            nameEl.appendChild(Icons.nodeOf(Icons.outgoingLink))
        } else {
            nameEl = document.createElement("span")
            nameEl.textContent = name
        }

        const checked = analysis.isEnabled ? 'checked' : ''
        const isBlocked = analysis.state === State.BLOCKING
        const isLocked = analysis.isEnabled && ! analysis.mayDisable ||
            ! analysis.isEnabled && ! analysis.mayEnable ||
            lockStatusColumn

        const actionCell =
            `<label class="ext-toggle">` +
            `<input type="checkbox" class="ext-toggle-input ${isBlocked ? 'ext-blocked' : ''}" ${checked}${isLocked ? ' disabled' : ''}` +
            ` data-extension="${analysis.storeInfo.id.escapeHtmlEntities()}">` +
            `<span class="ext-toggle-slider"></span>` +
            `</label>`

        const tr = document.createElement("tr")
        tr.innerHTML =
            `<td></td>` +
            `<td class="label ellipsis"></td>` +
            `<td><span class="ellipsis"></span></td>` +
            `<td>${issues}</td>` +
            `<td class="state ${analysis.state.toLowerCase()}">${t("control.state." + analysis.state)}</td>` +
            `<td class="action-cell">${actionCell}</td>`

        tr.cells[0].appendChild(logoEl)
        tr.cells[1].title = name
        tr.cells[1].appendChild(nameEl)
        const idSpan = tr.cells[2].querySelector("span")
        idSpan.title = analysis.storeInfo.id
        idSpan.textContent = analysis.storeInfo.id

        tb.appendChild(tr)
    }
})

const renderEventsDashboard = serialized(async function () {
    const log = await callServiceWorker('GetEvents')
    const logTable = document.getElementById("event-log-entries")
    logTable.innerHTML = ""
    for (let i = log.length - 1; i >= 0; i--) {
        const entry = log[i]
        const tr = document.createElement('tr')
        const timestamp = new Date(entry.timestamp)
        const hours = String(timestamp.getHours()).padStart(2, '0')
        const minutes = String(timestamp.getMinutes()).padStart(2, '0')
        const seconds = String(timestamp.getSeconds()).padStart(2, '0')
        const shortTime = `${hours}:${minutes}:${seconds}`

        tr.innerHTML =
            `<td></td>` +
            `<td></td>` +
            `<td></td>` +
            `<td class="label ellipsis"></td>` +
            `<td class="ellipsis"></td>`

        tr.cells[0].title = timestamp.toLocaleString()
        tr.cells[0].textContent = shortTime

        const levelLower = entry.browseragent.level.toLowerCase()
        tr.cells[1].classList.add(`alert-${levelLower}`)
        tr.cells[1].textContent = entry.browseragent.level

        const eventText = entry.browseragent.result ?? entry.browseragent.event
        tr.cells[2].textContent = eventText
        tr.cells[2].title = eventText

        tr.cells[3].title = entry.url ?? ''
        const href = safeHref(entry.url)
        if (href) {
            const a = document.createElement("a")
            a.href = href
            a.target = "_blank"
            a.rel = "noopener noreferrer"
            a.textContent = entry.url
            tr.cells[3].appendChild(a)
        } else {
            tr.cells[3].textContent = entry.url ?? '-'
        }
        tr.cells[4].title = entry.browseragent.description ?? ''
        tr.cells[4].textContent = entry.browseragent.description || '-'

        logTable.appendChild(tr)
    }
})

const renderPrivacyDashboard = serialized(async function () {
    const content = buildPrivacyNotice()
    document.getElementById("privacy-notice").safeInnerHTML(content)
})

function buildPrivacyNotice() {
    const org = (config.privacy.controller ?? config.company.name).escapeHtmlEntities()
    const contact = (config.privacy.dpo ?? config.company.contact ?? '').escapeHtmlEntities()
    const authority = config.privacy.authority
    const domains = patternsOf(config.company.domains)
    const apps = patternsOf(config.company.applications)

    const header = `<h2>${t('privacy.notice.header', { org })}</h2>`
    const effectiveDate = config.privacy.effectiveDate ?? config.privacy.lastModified
    const lastModified = config.privacy.lastModified ?? config.privacy.effectiveDate
    const dates = lastModified ?? effectiveDate ? `<p>${t('privacy.notice.meta', { effectiveDate, lastModified })}</p>` : ''

    const scope = t(config.account.checkOnlyInternal
        ? 'privacy.notice.scope.internal-only'
        : 'privacy.notice.scope.all-accounts', { org })

    const restriction = t(config.account.checkOnlyProtected
        ? 'privacy.notice.scope.protected-only'
        : 'privacy.notice.scope.no-restriction', { org })

    return [
        header,
        dates,
        section('privacy.notice.controller.title', 'privacy.notice.controller.body', { org }),
        section('privacy.notice.roles.title', 'privacy.notice.roles.body', { org }),
        section('privacy.notice.changes.title', 'privacy.notice.changes.body', { org }),
        purposesSection(org),
        dataCollectedSection(),
        section('privacy.notice.legal-basis.title', 'privacy.notice.legal-basis.body', { org }),
        scopeSection(org, domains, apps),
        section('privacy.notice.account-scope.title', 'privacy.notice.account-scope.body', { scope, restriction }),
        retentionSection(org),
        section('privacy.notice.security.title', 'privacy.notice.security.body', { org }),
        section('privacy.notice.recipients.title', 'privacy.notice.recipients.body', { org }),
        rightsSection(contact, authority, org),
    ].join('')
}

function section(titleKey, bodyKey, params) {
    return `<section><h3>${t(titleKey)}</h3><p>${t(bodyKey, params)}</p></section>`
}

function purposesSection(org) {
    const items = ['device', 'account', 'shadowit', 'dlp', 'extension']
        .map(k => `<li>${t('privacy.notice.purposes.item.' + k, { org })}</li>`).join('')
    return `<section>
        <h3>${t('privacy.notice.purposes.title')}</h3>
        <ul>${items}</ul>
    </section>`
}

function dataCollectedSection() {
    const url = 'https://www.citadelagent.org/privacy/transparency/'
    const link = `<a href="${url}">${t('privacy.notice.data-collected.link-text')}</a>`
    return `<section>
        <h3>${t('privacy.notice.data-collected.title')}</h3>
        <p>${t('privacy.notice.data-collected.body', { link })}</p>
    </section>`
}

function scopeSection(org, domains, apps) {
    if (!domains.length && !apps.length) {
        return `<section>
            <h3>${t('privacy.notice.scope.title')}</h3>
            <p>${t('privacy.notice.scope.none', { org })}</p>
        </section>`
    }
    const domainsText = domains.map(d => d.escapeHtmlEntities()).join(', ') || t('privacy.notice.scope.none-listed')
    const appsText = apps.map(a => a.escapeHtmlEntities()).join(', ') || t('privacy.notice.scope.none-listed')

    return `<section>
        <h3>${t('privacy.notice.scope.title')}</h3>
        <p>${t('privacy.notice.scope.intro', { org })}</p>
        <ul>
            <li>${t('privacy.notice.scope.domains', { domains: '<code>' + domainsText + '</code>' })}</li>
            <li>${t('privacy.notice.scope.applications', { apps: '<code>' + appsText + '</code>'  })}</li>
        </ul>
    </section>`
}

function retentionSection(org) {
    return section('privacy.notice.retention.title', 'privacy.notice.retention.body', {
        org,
        appDays: config.application.retentionDays,
        acctDays: config.account.retentionDays,
        sessionDays: config.session.maxSessionDays,
    })
}

function rightsSection(contact, authority, org) {
    const rightKeys = ['access', 'rectification', 'erasure', 'restriction', 'objection', 'portability']
    const items = rightKeys.map(k => `<li>${t('privacy.notice.rights.item.' + k, { org })}</li>`).join('')
    authority = authority?.replace(/\n/g, '<br>') ?? ''

    return `<section>
        <h3>${t('privacy.notice.rights.title')}</h3>
        <p>${t('privacy.notice.rights.intro', { contact, org })}</p>
        <ul>${items}</ul>
        <p>${t('privacy.notice.rights.authority')}</p>
        <p>${authority}</p>
    </section>`
}

function patternsOf(value) {
    if (Array.isArray(value)) return value
    if (value && typeof value === 'object') {
        return Object.keys(value).filter(key => value[key] !== false)
    }
    return []
}

document.getElementById('privacy-notice').addEventListener('click', (ev) => {
    const link = ev.target.closest('[data-tab-ref]')
    if (!link) return
    ev.preventDefault()
    selectTab(link.dataset.tabRef)
})

const dashboards = {
    device: renderDeviceDashboard,
    account: renderAccountDashboard,
    extension: renderExtensionDashboard,
    privacy: renderPrivacyDashboard,
}

// ── Actions ───────────────────────────────────────────────────────────────────

async function handleDeleteAccount(event) {
    const btn = event.target.closest('.delete-btn')
    if (!btn) return
    const { system, username } = btn.dataset
    await callServiceWorker("DeleteAccount", { system, username })
}

async function showBlockExtensionModal(title, message, onException = undefined) {
    const onAcknowledge = { label: t('global.cancel') }
    const options = Modal.prepareOptions(
        title,
        message,
        onAcknowledge,
        onException,
        undefined,
        false
    )
    await Modal.create(options)
}

async function handleExtensionAction(event) {
    const input = event.target
    if (!input.classList.contains('ext-toggle-input')) return

    const extensionId = input.dataset.extension
    const enable = input.checked

    if (input.classList.contains('ext-blocked') && enable) {
        event.preventDefault()

        setPointerBusy()
        const extensionInfo = await Extension.infoOf(extensionId)
        const analysis = await ExtensionAnalysis.Headless.fetch(extensionInfo)
        setPointerBusy(false)

        const errors = analysis.evaluation.rejection?.reasons.filter(reason => reason.startsWith("error")) ?? []
        if (errors.length > 0) {
            const message = `${t('extension-analysis.disable-modal.message-error')} : ${t(`extension-analysis.block-page.status.${errors[0]}`)}`
            await showBlockExtensionModal(t('extension-analysis.disable-modal.title'), message)
            return
        }

        const rejection = analysis?.evaluation?.rejection
        if (!rejection) {
            await ExtensionTrust.allow(analysis)
            return
        }

        const reason = `${t('extension-analysis.block-page.install-blocked.blocked')} ${t('extension-analysis.block-page.install-blocked.' + rejection.reasons[0], rejection)}.`
        const onException = { type: 'allow-extension', analysis }
        await showBlockExtensionModal(t('extension-analysis.disable-modal.title'), reason, onException)
    } else {
        await callServiceWorker("EnableExtension", { extensionId, enable })
    }
}

// ── Refresh spinner ───────────────────────────────────────────────────────────

const REFRESH_TIMEOUT = 60 * ONE_SECOND
let refreshTimeout = null

function wireUpdateButton() {
    updateBtn = document.getElementById('update-button')
    updateBtn.addEventListener('click', async () => {
        if (updateBtn.classList.contains('refreshing')) return
        updateBtn.classList.add('refreshing')
        refreshTimeout = setTimeout(clearRefreshSpinner, REFRESH_TIMEOUT)
        await refreshDeviceStatus()
    })
}

function clearRefreshSpinner() {
    updateBtn?.classList.remove('refreshing')
    if (refreshTimeout) {
        clearTimeout(refreshTimeout)
        refreshTimeout = null
    }
}

async function refreshDeviceStatus() {
    await callServiceWorker("RefreshDeviceStatus")
}

// ── Port / service-worker connection ─────────────────────────────────────────

function connect() {
    port = chrome.runtime.connect({ name: "SecurityDashboard" })
    port.onDisconnect.addListener(reconnect)
    port.onMessage.addListener(async (msg) => {
        if (msg.type === 'RefreshDeviceStatus') {
            clearRefreshSpinner()
            await renderDeviceDashboard()
        } else if (msg.type === 'RefreshAccountStatus') {
            await renderAccountDashboard()
        } else if (msg.type === 'RefreshExtensionStatus') {
            await renderExtensionDashboard()
        }
    })
}

function reconnect() {
    console.warn("Dashboard port disconnected, will reconnect in 10 seconds...")
    setTimeout(connect, 10 * ONE_SECOND)
}

// ── Tooltip ───────────────────────────────────────────────────────────────────

function wireTooltip() {
    let tooltip, hideHandler

    document.body.addEventListener('click', function (ev) {
        const el = ev.target.closest('.has-errors')

        if (tooltip) {
            if (ev.target.closest('.click-tooltip')) {
                return
            }
            tooltip.remove()
            tooltip = null
            if (hideHandler) document.removeEventListener('click', hideHandler, true)
        }

        if (!el) return

        tooltip = document.createElement('div')
        tooltip.className = "click-tooltip"
        tooltip.innerText = el.dataset.tooltip || ''
        document.body.appendChild(tooltip)

        const rect = el.getBoundingClientRect()
        tooltip.style.top = (window.scrollY + rect.bottom + 6) + 'px'
        tooltip.style.left = (window.scrollX + rect.left) + 'px'

        hideHandler = function (ev2) {
            if (ev2.target.closest('.has-info') || ev2.target.closest('.click-tooltip')) return
            if (tooltip) {
                tooltip.remove()
                tooltip = null
                document.removeEventListener('click', hideHandler, true)
            }
        }
        document.addEventListener('click', hideHandler, true)
    })
}

// ── Event tab auto-refresh ────────────────────────────────────────────────────

const EVENT_REFRESH_MS = 5 * ONE_SECOND
let refreshInterval = null

function handleVisibilityChange() {
    if (!document.hidden && currentTab === 'events') {
        startEventRefreshing()
    } else {
        stopEventRefreshing()
    }
}

function startEventRefreshing() {
    if (refreshInterval) return
    renderEventsDashboard()
    refreshInterval = setInterval(renderEventsDashboard, EVENT_REFRESH_MS)
}

function stopEventRefreshing() {
    if (refreshInterval) {
        clearInterval(refreshInterval)
        refreshInterval = null
    }
}