function renderDashboard() {
    chrome.runtime.sendMessage({type: "GetSecurityStatus"}, function(devicetrust) {
        const state = devicetrust.state
        document.getElementById("status-label").textContent = state || "-"
        document.getElementById("dot").className = "state-dot " + state.toLowerCase()

        document.getElementById("compliance").textContent = devicetrust.compliance

        const tb = document.getElementById("controls")
        tb.innerHTML = ""
        const controls = Object.values(devicetrust.controls)
        for (const ctrl of controls) {
            const next = ctrl.nextState
            const tr = document.createElement("tr")
            tr.innerHTML =
                `<td>${ctrl.name}</td>` +
                `<td class="state ${ctrl.state.toLowerCase()}">${ctrl.state.toLowerCase()}</td>` +
                `<td class="nextstate ${next.state.toLowerCase()}">${next.state?.toLowerCase() || "-"}</td>` +
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

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('update-button').addEventListener('click', refreshStatus)
})

document.addEventListener("DOMContentLoaded", renderDashboard)

const updateBtn = document.getElementById('update-button')
updateBtn.addEventListener('click', function () {
    if (updateBtn.classList.contains('refreshing')) return

    updateBtn.classList.add('refreshing')

    refreshStatus()

    // If you have existing update logic: call it, and when it completes, remove 'refreshing'
    // e.g., somePromise().finally(() => updateBtn.classList.remove('refreshing'));
})
