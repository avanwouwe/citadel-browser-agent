class Dashboard {

    static #dashboards = []

    static sendMessage(msg) {
        Dashboard.#dashboards.forEach((port) => {
            try {
                port.postMessage(msg)
            } catch (e) {
                console.warn("Failed to post message to dashboard port:", e)
            }
        })
    }

    static {
        chrome.runtime.onConnect.addListener((port) => {
            if (port.name === "SecurityDashboard") {
                Dashboard.#dashboards.push(port)

                port.onDisconnect.addListener(() => {
                    const idx = Dashboard.#dashboards.indexOf(port)
                    if (idx !== -1) Dashboard.#dashboards.splice(idx, 1)
                })
            }
        })
    }
}