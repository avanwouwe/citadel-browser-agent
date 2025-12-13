injectPageScripts(['/utils/injected/bundle/citadel-bundle-start.js'])

const listeners = { }
document.addEventListener("click", (e) => listeners?.clickListener?.(e), true)
document.shadowRoot?.addEventListener("click", (e) => listeners?.clickListener?.(e), true)

document.addEventListener('keydown', (e) => listeners?.keyListener?.(e), true)