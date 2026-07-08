let t
let port
let config
let updateBtn
let currentTab

// ── Entry point ───────────────────────────────────────────────────────────────

I18n.loadPage('/utils/i18n', (i18n) => {
    t = i18n.getTranslator()
    i18n.translatePage()

    callServiceWorker("GetConfig").then(conf => config = conf)

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

    if (tabId === "events") startEventRefreshing(); else stopEventRefreshing()

    const manualLink = document.getElementById('manual-link')
    if (manualLink) {
        manualLink.href = `https://citadelagent.org/dashboard/${tabId}-dashboard`
    }
}

// ── Dashboards ────────────────────────────────────────────────────────────────

const renderDeviceDashboard = serialized(async function () {
    const devicetrust = await callServiceWorker("GetDeviceStatus")
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
                label += '&nbsp&nbsp' + Icons.outgoingLink
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
})

const renderAccountDashboard = serialized(async function () {
    const tb = document.getElementById("accounttrust-issues")
    tb.innerHTML = ""

    tb.removeEventListener('click', handleDeleteAccount)
    tb.addEventListener('click', handleDeleteAccount)

    const failingAccounts = await callServiceWorker("GetAccountStatus")
    for (const acct of Object.values(failingAccounts)) {
        const next = acct.report.nextState
        let errors = acct.report.issues?.description ?? ''
        if (acct.report.issues?.count > 0) {
            errors = `<span class="has-errors" title="${t("dashboard.action.detail")}" data-tooltip="${errors.escapeHtmlEntities()}">${Icons.search}</span>`
        }

        const tr = document.createElement("tr")
        tr.innerHTML =
            `<td><span class="ellipsis"></span></td>` +
            `<td class="label"><span class="ellipsis"><a target="_blank" rel="noopener noreferrer"></a></span></td>` +
            `<td>${errors}</td>` +
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
        tr.cells[1].querySelector("span").title = acct.system

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
            nameEl.appendChild(document.createTextNode(' '))
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

        tr.cells[2].textContent = entry.browseragent.result ?? entry.browseragent.event
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

const dashboards = {
    device: renderDeviceDashboard,
    account: renderAccountDashboard,
    extension: renderExtensionDashboard,
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

const REFRESH_TIMEOUT_MS = 60 * ONE_SECOND
let refreshTimeout = null

function wireUpdateButton() {
    updateBtn = document.getElementById('update-button')
    updateBtn.addEventListener('click', async () => {
        if (updateBtn.classList.contains('refreshing')) return
        updateBtn.classList.add('refreshing')
        refreshTimeout = setTimeout(clearRefreshSpinner, REFRESH_TIMEOUT_MS)
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