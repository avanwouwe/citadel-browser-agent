
window.onload = async function() {
    const params = await new TabState().getState("Popup")
    const title = params?.title ?? ''
    const message = params?.message ?? ''

    document.getElementById('title').textContent = title
    document.getElementById('message').safeInnerHTML(message)
}