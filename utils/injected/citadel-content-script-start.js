const unpatched = function(event) { console.log("unpatched handler received event", event) }
const listeners = {
    clickListener: unpatched,
    keyListener: unpatched,
}

document.addEventListener("click", (e) => listeners.clickListener(e), true)
document.shadowRoot?.addEventListener("click", (e) => listeners.clickListener(e), true)

document.addEventListener('keydown', (e) => listeners.keyListener(e), true)

// relay the clipboard buffer captured by the MAIN-world hooks to the service worker, which scores it.
window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== window.location.origin) return
    if (event.data?.channel !== "CitadelClickFix") return

    sendMessage("analyze-clickfix", { content: event.data.content })
}, true)