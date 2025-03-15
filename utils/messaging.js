class Port {
    static #MIN_RETRY_DELAY = ONE_SECOND
    static #MAX_RETRY_DELAY = 10 * ONE_MINUTE
    static #LOST_EVENTS_FREQ = ONE_DAY;
    static #LOST_EVENTS_POPUP = 'lost-event-popup'
    static #LOST_EVENTS_STATISTICS = 'lost-event-statistics'

    static #port
    static #messageHandlers = { }

    static #retryDelay
    static #lastError
    static #lostEvents = new EventAccumulator(this.#LOST_EVENTS_STATISTICS, Port.#LOST_EVENTS_FREQ, (lostEvents) => {
        logger.log(nowTimestamp(), "report", "events lost", undefined, Log.ERROR, lostEvents, `${lostEvents} events were lost due to native messaging issue`);
    });


    static postMessage(type, message) {
        try {
            message = { type, version: PROTOCOL_VERSION, message };

            Port.#port.postMessage(message);

            Port.#resetRetryDelay()

            Port.#lostEvents.report()
        } catch (error) {
            if (config.logging.failurePopup) {
                Port.#lostEvents.increment()
            }
        }
    }

    static onMessage(type, handler) {
        Port.#messageHandlers[type] = handler;
        Port.#port.onMessage.addListener((message) => {
            if (message.type === type) {
                handler(message.message)
            }
        });
    }

    static #connect() {
        Port.#port = chrome.runtime.connectNative(EXTENSION_NAME)


        Port.#port.onDisconnect.addListener(function () {
            Port.#lastError = chrome.runtime.lastError?.message

            if (Port.#retryDelay < Port.#MAX_RETRY_DELAY) {
                Port.#retryDelay *= 2;
            }

            setTimeout(() => {
                Port.#connect();
            }, Port.#retryDelay);


            const error = isString(Port.#lastError) ? ` with the error:\n\n${Port.#lastError.htmlMonospace()}` : "";
            const message = `Unable to connect to native application. Please contact ${config.company.contact.htmlNowrap()}${error}`

            rateLimit(Port.#LOST_EVENTS_POPUP, Port.#LOST_EVENTS_FREQ, (mustShowPopup) => {
                if (mustShowPopup) {
                    showPopup(message)
                }
            });
        });

        Object.entries(Port.#messageHandlers).forEach(([type, handler]) => { Port.onMessage(type, handler) })
    }

    static #resetRetryDelay() {
        if (Port.#retryDelay !== Port.#MIN_RETRY_DELAY) {
            rateLimitReset(Port.#LOST_EVENTS_POPUP)
            Port.#retryDelay = Port.#MIN_RETRY_DELAY
        }
    }

    static {
        Port.#resetRetryDelay()
        Port.#connect()
    }

}