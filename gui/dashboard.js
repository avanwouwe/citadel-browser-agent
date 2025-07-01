function renderDashboard() {
    chrome.runtime.sendMessage({type: "GetDeviceTrustStatus"}, function(devicetrust) {
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


document.addEventListener("DOMContentLoaded", renderDashboard)
