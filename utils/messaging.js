class NativeMessaging {
    static #REQUEST_TIMEOUT = 5 * ONE_SECOND
    static #MIN_RETRY_DELAY = ONE_SECOND
    static #MAX_RETRY_DELAY = 10 * ONE_MINUTE
    static #LOST_EVENTS_FREQ = ONE_DAY
    static #LOST_EVENTS_POPUP = 'lost-event-popup'
    static #LOST_EVENTS_STATISTICS = 'lost-event-statistics'

    static #port
    static #messageHandlers = { }
    static #pendingReplies = { }
    static #hasReceivedMessage = false      // used to only start counting errors once we have received at least one message

    static #retryDelay
    static #lastError
    static #lostEvents = new EventAccumulator(this.#LOST_EVENTS_STATISTICS, NativeMessaging.#LOST_EVENTS_FREQ, (lostEvents) => {
        logger.log(nowTimestamp(), "report", "events lost", undefined, Log.ERROR, lostEvents, `lost ${lostEvents} event due to native messaging issue`)
    })

    static #readyResolve
    static #readyPromise = new Promise((resolve) => { NativeMessaging.#readyResolve = resolve })

    static init() {
        assert(Context.isBackground(), "must initialized in background service worker")

        NativeMessaging.#resetRetryDelay()
        NativeMessaging.#connect()
        NativeMessaging.#readyResolve()
    }

    static ready() {
        return NativeMessaging.#readyPromise
    }

    static postMessage(type, message) {
        try {
            assert(NativeMessaging.#port, 'Native Messaging is not yet initialized')

            message = { type, version: PROTOCOL_VERSION, message };

            NativeMessaging.#port.postMessage(message);

            NativeMessaging.#resetRetryDelay()

            NativeMessaging.#lostEvents.report()
        } catch (error) {
            if (config.logging.reportFailure && this.#hasReceivedMessage) {
                NativeMessaging.#lostEvents.increment()
            }
        }
    }

    static onMessage(type, handler) {
        assert(NativeMessaging.#port, 'Native Messaging is not yet initialized')

        NativeMessaging.#messageHandlers[type] = handler
        NativeMessaging.#port.onMessage.addListener((message) => {
            this.#hasReceivedMessage = true

            if (message.type === type) {
                handler(message.message)
            }
        })
    }

    static request(sendType, message = undefined, replyType = sendType) {
        assert(NativeMessaging.#port, 'Native Messaging is not yet initialized')

        return new Promise((resolve, reject) => {
            const entry = { resolve, reject }
            NativeMessaging.#addWaiter(replyType, entry)

            setTimeout(() => {
                NativeMessaging.#removeWaiter(replyType, entry)
                reject(new Error(`request timed out waiting for "${replyType}"`))
            }, NativeMessaging.#REQUEST_TIMEOUT)

            NativeMessaging.postMessage(sendType, message)
        })
    }

    static #connect() {
        NativeMessaging.#port = chrome.runtime.connectNative(EXTENSION_NAME)

        NativeMessaging.#port.onMessage.addListener((message) => {
            this.#hasReceivedMessage = true

            NativeMessaging.#takeWaiters(message.type).forEach(({ resolve }) => resolve(message.message))
        })

        NativeMessaging.#port.onDisconnect.addListener(() => {
            NativeMessaging.#rejectAllWaiters(new Error("port disconnected"))

            NativeMessaging.#lastError = chrome.runtime.lastError?.message

            if (NativeMessaging.#retryDelay < NativeMessaging.#MAX_RETRY_DELAY) {
                NativeMessaging.#retryDelay *= 2
            }

            setTimeout(() => {
                NativeMessaging.#connect()
            }, NativeMessaging.#retryDelay)

            const error = isString(NativeMessaging.#lastError) ? " " + t("errors.messaging.with-error", { error: NativeMessaging.#lastError.embedTag('mono') }) : ""
            const message = t("errors.messaging.please-contact", { contact: config.organization.contact.embedTag('nowrap') })

            rateLimit(NativeMessaging.#LOST_EVENTS_POPUP, NativeMessaging.#LOST_EVENTS_FREQ, (mustShowPopup) => {
                if (mustShowPopup) {
                    showPopup(message + error)
                }
            })
        })

        Object.entries(NativeMessaging.#messageHandlers).forEach(([type, handler]) => { NativeMessaging.onMessage(type, handler) })
    }

    static #addWaiter(type, entry) {
        (NativeMessaging.#pendingReplies[type] ??= []).push(entry)
    }

    static #removeWaiter(type, entry) {
        const waiters = NativeMessaging.#pendingReplies[type]
        const i = waiters?.indexOf(entry) ?? -1
        if (i !== -1) waiters.splice(i, 1)
    }

    static #takeWaiters(type) {
        const waiters = NativeMessaging.#pendingReplies[type] ?? []
        NativeMessaging.#pendingReplies[type] = []
        return waiters
    }

    static #rejectAllWaiters(error) {
        for (const type of Object.keys(NativeMessaging.#pendingReplies)) {
            NativeMessaging.#takeWaiters(type).forEach(({ reject }) => reject(error))
        }
    }

    static #resetRetryDelay() {
        if (NativeMessaging.#retryDelay !== NativeMessaging.#MIN_RETRY_DELAY) {
            rateLimitReset(NativeMessaging.#LOST_EVENTS_POPUP)
            NativeMessaging.#retryDelay = NativeMessaging.#MIN_RETRY_DELAY
        }
    }
}