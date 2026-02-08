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

    renderDeviceDashboard()
    renderAccountDashboard()
    renderExtensionDashboard()

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

    const params = new URLSearchParams(window.location.search)
    params.set('tab', tabId)
    window.history.replaceState({}, '', `${window.location.pathname}?${params}`)

    renderDeviceDashboard()
    renderAccountDashboard()
    renderExtensionDashboard()
    if (tabId === "events") startEventRefreshing(); else stopEventRefreshing()
}

async function renderDeviceDashboard() {
    const devicetrust = await callServiceWorker("GetDeviceStatus")
    const state = devicetrust.state

    document.getElementById("status-label").textContent = t("control.state." + state) || "-"
    document.getElementById("dot").className = "state-dot " + state.toLowerCase()

    document.getElementById("compliance").textContent = devicetrust.compliance

    if (state === State.UNKNOWN) return

    const tb = document.getElementById("devicetrust-issues")
    tb.innerHTML = ""
    const controls = Object.values(devicetrust.controls)
        .sort((a, b) => a.name.localeCompare(b.name))

    for (const ctrl of controls) {
        const next = ctrl.nextState
        const ctrlText = I18n.fromObject(ctrl.definition?.text).getTranslator()

        let label = ctrlText("label") ?? ctrl.name
        const explainPage = ctrlText("explain")
        if (explainPage) {
            label = `<a href="${explainPage}">${label}</a>`
        }

        let errors = ''
        if (!ctrl.passing && ctrl.report?.errors?.length) {
            errors = ctrl.report.errors.slice(0, 30).join('\n')
            if (ctrl.report.errors.length > 30) {
                errors += '\n...'
            }
            errors = ` <span class="has-errors" data-tooltip="${errors.escapeHtmlEntities()}">&#128269;</span>`
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
}

async function renderAccountDashboard() {
    const accounttrust = await callServiceWorker("GetAccountStatus")
    const tb = document.getElementById("accounttrust-issues")
    tb.innerHTML = ""

    tb.removeEventListener('click', handleDeleteClick)
    tb.addEventListener('click', handleDeleteClick)

    for (const acct of accounttrust.accounts) {
        const next = acct.report.nextState
        let errors = acct.report.issues?.description
        if (acct.report.issues?.count > 0) {
            errors = ` <span class="has-errors" data-tooltip="${errors.escapeHtmlEntities()}">&#128269;</span>`
        }

        const tr = document.createElement("tr")
        tr.innerHTML =
            `<td><span class="ellipsis" title="${acct.username}">${acct.username}</span></td>` +
            `<td class="label"><span class="ellipsis" title="${acct.system}"><a href="https://${acct.system}" target="_blank" rel="noopener noreferrer">${acct.system}</a></span></td>` +
            `<td>${errors}</td>` +
            `<td class="state ${acct.report.state.toLowerCase()}">${t("control.state." + acct.report.state)}</td>` +
            `<td class="days">${next.days ?? ""}</td>` +
            `<td class="nextstate ${next.state.toLowerCase()}">${t("control.state." + next.state) || "-"}</td>` +
            `<td><span class="delete-btn" data-username="${acct.username}" data-system="${acct.system}">🗑</span></td>`

        tb.appendChild(tr)
    }
}

async function renderExtensionDashboard() {
    const extensiontrust = await callServiceWorker("GetExtensionStatus")
    const tb = document.getElementById("extension-details")
    tb.innerHTML = ""

    tb.removeEventListener('click', handleDeleteClick)
    tb.addEventListener('click', handleDeleteClick)

    for (const [_, extension] of extensiontrust.extensions) {
        let risks
        console.log("ext", extension)
      //  if (acct.report.issues?.count > 0) {
      //      errors = ` <span class="has-errors" data-tooltip="${errors.escapeHtmlEntities()}">&#128269;</span>`
       // }

        const tr = document.createElement("tr")
        tr.innerHTML =
            `<td><span class="ellipsis" title="${extension.storeInfo.name}">${extension.storeInfo.name}</span></td>` +
            `<td><span class="ellipsis" title="${extension.id}">${extension.storeInfo.id}</span></td>` +
            `<td>${risks}</td>` +
            `<td class="state ${extension.state.toLowerCase()}">${t("control.state." + extension.state)}</td>` +
            `<td><span class="delete-btn" data-extension="${extension.id}">🗑</span></td>`

        tb.appendChild(tr)
    }
}

async function renderEventsDashboard() {
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
            `<td title="${entry.timestamp.toISOString()}">${shortTime}</td>
             <td>${entry.browseragent.level}</td>
             <td>${entry.browseragent.result ?? entry.browseragent.event}</td>
             <td><span class="ellipsis" title="${entry.url}">${entry.url || '-'}</span></td>
             <td><span class="ellipsis" title="${entry.browseragent.description}">${entry.browseragent.description || '-'}</span></td>`
        logTable.appendChild(tr)
    }
}

async function handleDeleteClick(event) {
    if (event.target.classList.contains('delete-btn')) {
        const username = event.target.dataset.username
        const system = event.target.dataset.system
        await callServiceWorker("DeleteAccount", { username, system })
        renderAccountDashboard()
    }
}

let port

function connect() {
    port = chrome.runtime.connect({name: "SecurityDashboard"})
    port.onDisconnect.addListener(reconnect)
    port.onMessage.addListener((msg) => {
        if (msg.type === 'RefreshDeviceStatus') {
            updateBtn.classList.remove('refreshing')
            renderDeviceDashboard()
        } else if (msg.type === 'RefreshAccountStatus') {
            renderAccountDashboard()
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
updateBtn.addEventListener('click', function () {
    if (updateBtn.classList.contains('refreshing')) return

    updateBtn.classList.add('refreshing')

    refreshDeviceStatus()
});

(function(){
    let tooltip, hideHandler

    document.body.addEventListener('click', function(ev) {
        const el = ev.target.closest('.has-errors')

        // Remove existing tooltip if any
        if (tooltip) {
            // If the click is inside the tooltip, do nothing
            if (ev.target.closest('.click-tooltip')) {
                return
            }
            // If clicking another info icon, remove current and continue
            tooltip.remove()
            tooltip = null
            if (hideHandler) document.removeEventListener('click', hideHandler, true)
        }

        if (!el) return;

        // Create tooltip
        tooltip = document.createElement('div')
        tooltip.className = "click-tooltip"
        tooltip.innerText = el.dataset.tooltip || ''
        document.body.appendChild(tooltip)

        const rect = el.getBoundingClientRect()
        tooltip.style.top = (window.scrollY + rect.bottom + 6) + 'px'
        tooltip.style.left = (window.scrollX + rect.left) + 'px'

        // Handler to hide tooltip only when clicking outside both .has-info and the tooltip
        hideHandler = function(ev2) {
            // If click is on the info icon or inside the tooltip, do nothing
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

document.addEventListener('visibilitychange', handleVisibilityChange);
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
    refreshInterval = setInterval(() => {
        renderEventsDashboard()
    }, 5 * ONE_SECOND)
}

function stopEventRefreshing() {
    if (refreshInterval) {
        clearInterval(refreshInterval)
        refreshInterval = null
    }
}

