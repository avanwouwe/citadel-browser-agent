injectPageScript('/utils/injected/bundle/citadel-bundle-start.js')

const unpatched = function(event) { console.log("unpatched handler received event", event) }
const listeners = {
    clickListener: unpatched,
    keyListener: unpatched,
}

document.addEventListener("click", (e) => listeners.clickListener(e), true)
document.shadowRoot?.addEventListener("click", (e) => listeners.clickListener(e), true)

document.addEventListener('keydown', (e) => listeners.keyListener(e), true)