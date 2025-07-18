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
                errors = ` <span class="has-errors" data-tooltip="${errors.escapeHtmlAttr()}">&#128269;</span>`
            }

            const tr = document.createElement("tr")
            tr.innerHTML =
                `<td ${explainPage ? "class='label'" : ''}>${label}</td>` +
                `<td>${errors}</td>`+
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
            let errors = acct.report.issues?.description
            if (acct.report.issues?.count > 0) {
                errors = ` <span class="has-errors" data-tooltip="${errors.escapeHtmlAttr()}">&#128269;</span>`
            }

            const tr = document.createElement("tr")
            tr.innerHTML =
                `<td><span class="ellipsis" title="${acct.username}">${acct.username}</span></td>` +
                `<td><span class="ellipsis" title="${acct.system}">${acct.system}</span></td>` +
                `<td>${errors}</td>` +
                `<td class="state ${acct.report.state.toLowerCase()}">${t("control.state." + acct.report.state)}</td>`
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