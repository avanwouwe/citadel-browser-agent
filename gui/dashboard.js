let t

I8N.loadPage('/utils/i8n', (i8n) => {
    document.getElementById('update-button').addEventListener('click', refreshStatus)

    t = i8n.getTranslator()
    i8n.translatePage()
    renderDashboard()
})()

function renderDashboard() {
    chrome.runtime.sendMessage({type: "GetSecurityStatus"}, function(devicetrust) {
        const state = devicetrust.state
        document.getElementById("status-label").textContent = t("control.state." + state) || "-"
        document.getElementById("dot").className = "state-dot " + state.toLowerCase()

        document.getElementById("compliance").textContent = devicetrust.compliance

        const tb = document.getElementById("controls")
        tb.innerHTML = ""
        const controls = Object.values(devicetrust.controls)
        for (const ctrl of controls) {
            const next = ctrl.nextState
            let ctrlText = ctrl.definition?.text ?? {}
            ctrlText = ctrlText[I8N.getLanguage()] ?? ctrlText[I8N.defaultLanguage] ?? {}

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

let port

function connect() {
    port = chrome.runtime.connect({name: "SecurityDashboard"})
    port.onDisconnect.addListener(reconnect)
    port.onMessage.addListener((msg) => {
        if (msg.type === 'RefreshSecurityStatus') {
            updateBtn.classList.remove('refreshing')
            renderDashboard()
        }
    })
}

function reconnect() {
    console.warn("Dashboard port disconnected, will reconnect in 10 seconds...")
    setTimeout(connect, 10 * ONE_SECOND)
}

connect()

function refreshStatus() {
    chrome.runtime.sendMessage({ type: "RefreshSecurityStatus" })
}

const updateBtn = document.getElementById('update-button')
updateBtn.addEventListener('click', function () {
    if (updateBtn.classList.contains('refreshing')) return

    updateBtn.classList.add('refreshing')

    refreshStatus()
})
