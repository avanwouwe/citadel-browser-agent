window.addEventListener('DOMContentLoaded', function () {
    const tabButtons = document.querySelectorAll('.tab')
    tabButtons.forEach(btn => {
        btn.addEventListener('click', function () {
            selectTab(btn.id)
        })
    })
})

let t
I18n.loadPage('/utils/i18n', (i18n) => {
    t = i18n.getTranslator()
    i18n.translatePage()

    const params = new URLSearchParams(window.location.search)
    const tabName = params.get('tab') ?? 'device'
    selectTab(tabName)
})()

function selectTab(tabId) {
    const tabButtons = document.querySelectorAll('.tab')
    const tabContents = document.querySelectorAll('.tab-content')

    for (let i = 0; i < tabButtons.length; i++) {
        const isActive = tabButtons[i].id === tabId
        tabButtons[i].classList.toggle('active', isActive)
        tabContents[i].classList.toggle('active', isActive)
    }

    renderDeviceDashboard()
    renderAccountDashboard()
    renderExtensionDashboard()

    const params = new URLSearchParams(window.location.search)
    params.set('tab', tabId)
    window.history.replaceState({}, '', `${window.location.pathname}?${params}`)

    if (tabId === "events") startEventRefreshing(); else stopEventRefreshing()

    const manualLink = document.getElementById('manual-link')
    if (manualLink) {
        manualLink.href = `https://citadelagent.org/dashboard/${tabId}-dashboard`
    }
}

const renderDeviceDashboard = serialized(async function () {
    const devicetrust = await callServiceWorker("GetDeviceStatus")
    const controls = Object.values(devicetrust.controls)
        .sort((a, b) => a.name.localeCompare(b.name))
    const state = devicetrust.state

    document.getElementById("status-label").textContent = t("control.state." + state) || "-"
    document.getElementById("dot").className = "state-dot " + state.toLowerCase()

    document.getElementById("compliance").textContent = devicetrust.compliance

    if (state === State.UNKNOWN) return

    const tb = document.getElementById("devicetrust-issues")
    tb.innerHTML = ""

    for (const ctrl of controls) {
        const next = ctrl.nextState
        const ctrlText = I18n.fromObject(ctrl.definition?.text).getTranslator()

        let label = ctrlText("label") ?? ctrl.name
        const explainPage = ctrlText("explain")
        if (explainPage) {
            label = `<a href="${explainPage}" target="_blank">${label}</a>`
        }

        let errors = ''
        if (!ctrl.passing && ctrl.report?.errors?.length) {
            errors = ctrl.report.errors.slice(0, 30).join('\n')
            if (ctrl.report.errors.length > 30) {
                errors += '\n...'
            }
            errors = `<span class="has-errors" data-tooltip="${errors.escapeHtmlEntities()}">${Icons.search}</span>`
        }

        const tr = document.createElement("tr")
        tr.innerHTML =
            `<td ${explainPage ? "class='label'" : ''}>${label}</td>` +
            `<td>${errors}</td>`+
            `<td class="state ${ctrl.state.toLowerCase()}">${t("control.state." + ctrl.state)}</td>` +
            `<td class="days">${next.days ?? ""}</td>` +
            `<td class="nextstate ${next.state.toLowerCase()}">${t("control.state." + next.state) || "-"}</td>`
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
            errors = `<span class="has-errors" data-tooltip="${errors.escapeHtmlEntities()}">${Icons.search}</span>`
        }

        const tr = document.createElement("tr")
        tr.innerHTML =
            `<td><span class="ellipsis"></span></td>` +
            `<td class="label"><span class="ellipsis"><a target="_blank" rel="noopener noreferrer"></a></span></td>` +
            `<td>${errors}</td>` +
            `<td class="state ${acct.report.state.toLowerCase()}">${t("control.state." + acct.report.state)}</td>` +
            `<td class="days">${next?.days ?? ""}</td>` +
            `<td class="nextstate ${next.state.toLowerCase()}">${t("control.state." + next.state) || "-"}</td>` +
            `<td><span class="delete-btn" title="${t("action.delete")}">${Icons.delete}</span></td>`

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

    const tb = document.getElementById("extension-details")
    tb.innerHTML = ""

    tb.removeEventListener('click', handleDeleteExtension)
    tb.addEventListener('click', handleDeleteExtension)

    tb.removeEventListener('click', handleExtensionAction)
    tb.addEventListener('click', handleExtensionAction)

    for (const analysis of extensions) {
        let issues = ''
        if (analysis.issues) {
            issues = `<span class="has-errors" data-tooltip="${analysis.issues.escapeHtmlEntities()}">${Icons.search}</span>`
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
            logoEl.textContent = "🧩"
        }

        const storePage = safeHref(analysis.storeInfo?.storePage)
        let nameEl
        if (storePage) {
            nameEl = document.createElement("a")
            nameEl.href = storePage
            nameEl.target = "_blank"
            nameEl.rel = "noopener noreferrer"
            nameEl.textContent = name
        } else {
            nameEl = document.createElement("span")
            nameEl.textContent = name
        }

        const isBlocked = analysis.state === State.BLOCKING

        let actionCell
        if (!analysis.isInstalled) {
            actionCell = `<span class="delete-btn" data-extension="${analysis.storeInfo.id}">${Icons.delete}</span>`
        } else if (analysis.isEnabled && ! analysis.mayDisable || ! analysis.isEnabled && ! analysis.mayEnable) {
            actionCell = ''
        } else {
            const checked = analysis.isEnabled ? 'checked' : ''
            actionCell =
                `<label class="ext-toggle">` +
                `<input type="checkbox" class="ext-toggle-input ${isBlocked ? 'ext-blocked' : ''}" ${checked}` +
                ` data-extension="${analysis.storeInfo.id}">` +
                `<span class="ext-toggle-slider"></span>` +
                `</label>`
        }

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
        entry.timestamp = new Date(entry.timestamp)
        const hours = String(entry.timestamp.getHours()).padStart(2, '0')
        const minutes = String(entry.timestamp.getMinutes()).padStart(2, '0')
        const seconds = String(entry.timestamp.getSeconds()).padStart(2, '0')
        const shortTime = `${hours}:${minutes}:${seconds}`

        tr.innerHTML =
            `<td></td>` +
            `<td></td>` +
            `<td></td>` +
            `<td class="label ellipsis"></td>` +
            `<td class="ellipsis"></td>`

        tr.cells[0].title = entry.timestamp.toISOString()
        tr.cells[0].textContent = shortTime
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

async function handleDeleteAccount(event) {
    if (event.target.classList.contains('delete-btn')) {
        const system = event.target.dataset.system
        const username = event.target.dataset.username
        await callServiceWorker("DeleteAccount", { system, username })
    }
}

async function handleExtensionAction(event) {
    const input = event.target
    const extensionId = input.dataset.extension
    const enable = input.checked
    if (! input.classList.contains('ext-toggle-input')) return

    if (input.classList.contains('ext-blocked') && enable) {
        event.preventDefault()

        const extensionTrust = await callServiceWorker("GetExtensionStatus")
        const analysis = extensionTrust[extensionId]
        const rejection = analysis?.evaluation?.rejection

        if (!rejection) return

        const reason = `${t('extension-analysis.block-page.install-blocked.blocked')} ${t('extension-analysis.block-page.install-blocked.' + rejection.reasons[0], rejection)}.`
        const onException = { type: 'allow-extension', analysis }
        const options = Modal.prepareOptions(t('extension-analysis.disable-modal.title'), reason, {}, onException, false)
        await Modal.create(options)
    } else {
        await callServiceWorker("EnableExtension", { extensionId, enable })
    }
}

async function handleDeleteExtension(event) {
    if (event.target.classList.contains('delete-btn')) {
        const extensionId = event.target.dataset.extension
        await callServiceWorker("DeleteExtension", { extensionId })
    }
}

// ── Refresh spinner ───────────────────────────────────────────────────────────

const REFRESH_TIMEOUT_MS = 60 * ONE_SECOND
let refreshTimeout = null

function clearRefreshSpinner() {
    updateBtn.classList.remove('refreshing')
    if (refreshTimeout) {
        clearTimeout(refreshTimeout)
        refreshTimeout = null
    }
}

// ── Port / service-worker connection ─────────────────────────────────────────

let port

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

connect()

async function refreshDeviceStatus() {
    await callServiceWorker("RefreshDeviceStatus")
}

const updateBtn = document.getElementById('update-button')
updateBtn.addEventListener('click', async function () {
    if (updateBtn.classList.contains('refreshing')) return

    updateBtn.classList.add('refreshing')
    refreshTimeout = setTimeout(clearRefreshSpinner, REFRESH_TIMEOUT_MS)

    await refreshDeviceStatus()
})

// ── Tooltip ───────────────────────────────────────────────────────────────────

;(function () {
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
})()

// ── Event tab auto-refresh ────────────────────────────────────────────────────

document.addEventListener('visibilitychange', handleVisibilityChange)
let refreshInterval = null

function handleVisibilityChange() {
    if (!document.hidden) {
        startEventRefreshing()
    } else {
        stopEventRefreshing()
    }
}

function startEventRefreshing() {
    if (refreshInterval) return
    renderEventsDashboard()
    refreshInterval = setInterval(async () => {
        await renderEventsDashboard()
    }, 5 * ONE_SECOND)
}

function stopEventRefreshing() {
    if (refreshInterval) {
        clearInterval(refreshInterval)
        refreshInterval = null
    }
}