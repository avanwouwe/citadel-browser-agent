window.addEventListener('DOMContentLoaded', function () {
    const tabButtons = document.querySelectorAll('.tab')
    const tabContents = document.querySelectorAll('.tab-content')
    tabButtons.forEach((btn, i) => {
        btn.addEventListener('click', function () {
            tabButtons.forEach((b, j) => {
                b.classList.toggle('active', i === j)
                tabContents[j].classList.toggle('active', i === j)
            })
        })
    })
    // (Optional) Keyboard navigation for tabs ...
})

let t
I18n.loadPage('/utils/i18n', (i18n) => {
    t = i18n.getTranslator()
    i18n.translatePage()
    renderDeviceDashboard()
    renderAccountIssues()
})()

function renderDeviceDashboard() {
    chrome.runtime.sendMessage({type: "GetDeviceStatus"}, function(devicetrust) {
        const state = devicetrust.state

        document.getElementById("status-label").textContent = t("control.state." + state) || "-"
        document.getElementById("dot").className = "state-dot " + state.toLowerCase()

        document.getElementById("compliance").textContent = devicetrust.compliance

        if (devicetrust.compliance === 100) { return }

        const tb = document.getElementById("devicetrust-issues")
        tb.innerHTML = ""
        const controls = Object.values(devicetrust.controls)
        for (const ctrl of controls) {
            const next = ctrl.nextState
            let ctrlText = ctrl.definition?.text ?? {}
            ctrlText = ctrlText[I18n.getLanguage()] ?? ctrlText[I18n.defaultLanguage] ?? {}

            const tr = document.createElement("tr")
            tr.innerHTML =
                `<td>${ctrlText.label ?? ctrl.name}</td>` +
                `<td class="state ${ctrl.state.toLowerCase()}">${t("control.state." + ctrl.state)}</td>` +
                `<td class="nextstate ${next.state.toLowerCase()}">${t("control.state." + next.state) || "-"}</td>` +
                `<td class="days">${next.days ?? ""}</td>`
            tb.appendChild(tr)
        }
    })
}

function renderAccountIssues() {
    chrome.runtime.sendMessage({type: "GetAccountIssues"}, function(accounttrust) {
        const tb = document.getElementById("accounttrust-issues")
        tb.innerHTML = ""

        for (const acct of accounttrust.accounts) {
            const issue = acct.report.issues?.count > 0 ? `has ${acct.report.issues?.count} issues` : ""
            const description = acct.report.issues?.description

            const tr = document.createElement("tr")
            tr.innerHTML =
                `<td><span class="ellipsis" title="${acct.username}">${acct.username}</span></td>` +
                `<td><span class="ellipsis" title="${acct.system}">${acct.system}</span></td>` +
                `<td class="state ${acct.report.state.toLowerCase()}">${t("control.state." + acct.report.state)}</td>` +
                `<td${description ? ` title="${description.escapeHtmlAttr()}"` : ''}>${issue}</td>`
            tb.appendChild(tr)
        }
    })
}

let port

function connect() {
    port = chrome.runtime.connect({name: "SecurityDashboard"})
    port.onDisconnect.addListener(reconnect)
    port.onMessage.addListener((msg) => {
        if (msg.type === 'RefreshDeviceStatus') {
            updateBtn.classList.remove('refreshing')
            renderDeviceDashboard()
        }
    })
}

function reconnect() {
    console.warn("Dashboard port disconnected, will reconnect in 10 seconds...")
    setTimeout(connect, 10 * ONE_SECOND)
}

connect()

function refreshStatus() {
    chrome.runtime.sendMessage({ type: "RefreshDeviceStatus" })
}

const updateBtn = document.getElementById('update-button')
updateBtn.addEventListener('click', function () {
    if (updateBtn.classList.contains('refreshing')) return

    updateBtn.classList.add('refreshing')

    refreshStatus()
})
