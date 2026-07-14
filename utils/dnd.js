class DoNotDisturb {

    static #MAX_DURATION = 24 * ONE_HOUR    // if the user is DND for more than this period, ignore the DND

    static #nativeDND = cachedFor(ONE_MINUTE, () => Port.request("dnd"))

    static #activeSince = null

    static async isActive() {
        const isDND = await DoNotDisturb.#nativeDND() || Screensharing.isActive

        if (!isDND) {
            DoNotDisturb.#activeSince = null
            return false
        }

        DoNotDisturb.#activeSince ??= Date.now()

        return Date.now() - DoNotDisturb.#activeSince < DoNotDisturb.#MAX_DURATION
    }
}

class Screensharing {
    // Tracks active share sessions keyed by tabId -> count of live tracks.
    // A tab can host >1 concurrent share; ref-count so we only go inactive at 0.
    static #sessions = new Map()   // tabId -> liveTrackCount

    static get isActive() {
        for (const n of Screensharing.#sessions.values()) if (n > 0) return true
        return false
    }

    // called from background message handler on every forwarded event.
    static onEvent(event, tabId) {
        if (tabId == null) return
        const cur = Screensharing.#sessions.get(tabId) || 0

        if (event.subtype === "start") {
            Screensharing.#sessions.set(tabId, cur + 1)
        } else if (event.subtype === "stop") {
            const next = Math.max(0, cur - 1)
            if (next === 0) Screensharing.#sessions.delete(tabId)
            else Screensharing.#sessions.set(tabId, next)
        }
    }

    // sharing is stopped when the tab is deleted or navigation is performed
    static {
        const onTabGone = tabId => Screensharing.#sessions.delete(tabId)

        if (Context.isServiceWorker()) {
            chrome.tabs.onRemoved.addListener(onTabGone)
            chrome.webNavigation.onCommitted.addListener(details => onTabGone(details.tabId))
        }
    }

}

function patchNavigatorScreenShare() {
    const trySafe = (fn) => { try { fn() } catch (e) {} }

    const report = (event) => {
        trySafe(() => {
            window.postMessage({
                type: "screenshare-event",
                subtype: event
            }, window.location.origin)
        })
    }

    const md = navigator.mediaDevices
    if (!md || !md.getDisplayMedia || md.__citadelSSHooked) return
    md.__citadelSSHooked = true

    const orig = md.getDisplayMedia.bind(md)

    md.getDisplayMedia = async function (...args) {
        const stream = await orig(...args)   // rejects on user-cancel -> no report

        report("start")

        trySafe(() => {
            const tracks = stream.getVideoTracks()
            let live = tracks.length || 0
            if (live === 0) { report("stop"); return stream; }

            const done = () => { if (--live <= 0) report("stop"); }

            for (const t of tracks) {
                // user clicks Chrome "Stop sharing"
                t.addEventListener("ended", done, { once: true })
                // app calls track.stop() itself — does NOT fire 'ended'
                const realStop = t.stop.bind(t)
                t.stop = function () { realStop(); done(); }
            }
        })

        return stream
    }
}