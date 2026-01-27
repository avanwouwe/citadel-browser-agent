class Log {

    static NEVER  = "NEVER"
    static TRACE = "TRACE"
    static DEBUG = "DEBUG"
    static INFO  = "INFO"
    static WARN  = "WARN"
    static ERROR = "ERROR"
    static ALERT = "ALERT"

    static #levelValue = {
        NEVER: 0,
        TRACE: 1,
        DEBUG: 2,
        INFO:  3,
        WARN:  4,
        ERROR: 5,
        ALERT: 6,
    }

    static #levelLabel = Object.fromEntries(Object.entries(this.#levelValue).map(([key, value]) => [value, key]))

    static #throttles

    log(
        timestamp,
        event,
        result,
        url,
        level,
        value,
        description = undefined,
        initiator = undefined,
        id = undefined,
        throttle = true
    ){
        const config = Config.forURL(url)
        const levelValue = Log.#levelValue[level]

        if (level === Log.NEVER || levelValue < config.logging.logLevel && levelValue < config.logging.consoleLevel) { return }

        if (throttle && Log.#throttles?.[levelValue]?.throttle()) { return }

        url = this.maskUrl(url, level, config)
        initiator = this.maskUrl(initiator, level, config)

        url = url?.truncate(config.logging.maxUrlLength)
        initiator = initiator?.truncate(config.logging.maxUrlLength)

        description = description.replace("@@URL@@", url)

        const logEntry = {
            timestamp: timestamp ?? nowTimestamp(),
            id : id ?? getRandomInt(),
            browseragent: {
                event,
                level,
                value,
                description,
            }
        }
        if (url) logEntry.url = url
        if (initiator) logEntry.browseragent.initiator = initiator
        if (result) logEntry.browseragent.result = result
        if (PROFILE_ADDRESS) logEntry.browseragent.profile = PROFILE_ADDRESS

        // add a specific 'numvalue' if the value is numeric
        const numvalue = Number(value ?? "null")
        if (typeof numvalue === 'number' && !isNaN(numvalue) && isFinite(numvalue)) {
            logEntry.browseragent.numvalue = numvalue
        }

        // if the value is an object, move it to the "details" node
        if (typeof value === 'object' && value.type) {
            const details = value.value
            if (details && typeof details === 'object'  ) {
                logEntry['browseragent']['detail'] = {};
                logEntry['browseragent']['detail'][value.type.replaceAll(' ','_')] = details
            }

            delete logEntry['browseragent']['value']
        }

        if (config.logging.logLevel > 0 && levelValue >= config.logging.logLevel) {
            Port.postMessage("event", logEntry)

            if (levelValue >= config.logging.shipLevel) {
                events.push(logEntry)
            }
        }

        if (config.logging.consoleLevel > 0 && levelValue >= config.logging.consoleLevel) {
            switch (event.level) {
                case Log.TRACE:
                    return console.trace(logEntry)
                case Log.DEBUG:
                    return console.debug(logEntry)
                case Log.INFO:
                    return console.info(logEntry)
                case Log.WARN:
                    return console.warn(logEntry)
                case Log.ERROR:
                case Log.ALERT:
                default:
                    console.error(logEntry)      // there is no console.fatal()
             }
        }

    }

    maskUrl(url, level, config) {
        if (!url) return url

        const urlObj = url.toURL()
        if (! urlObj) return url    // if we can't parse the URL, we can't mask it
        url = urlObj

        if (! Config.isProtected(url.hostname) && Log.#levelValue[level] < config.logging.maskUrlLevel) {
            url.username ? url.username = url.username.hashDJB2() : undefined
            url.hostname ? url.hostname = url.hostname.hashDJB2() : undefined
            url.pathname && url.pathname !== "/" ? url.pathname = url.pathname.hashDJB2() : undefined
            url.hash ? url.hash = url.hash.hashDJB2() : undefined
            url.search ? url.search = url.search.hashDJB2() : undefined
        }

        url.password ? url.password = '-masked-' : undefined

        return url.toString()
    }


    static init(config) {
        const logging = config.logging

        if (logging?.logLevel) logging.logLevel = Log.#levelValue[logging.logLevel]
        if (logging?.shipLevel) logging.shipLevel = Log.#levelValue[logging.shipLevel]
        if (logging?.consoleLevel) logging.consoleLevel = Log.#levelValue[logging.consoleLevel]
        if (logging?.maskUrlLevel) logging.maskUrlLevel = Log.#levelValue[logging.maskUrlLevel]
    }

    static start() {
        const throttling = config.logging.throttle

        Log.#throttles = []

        Object.entries(this.#levelValue).forEach(([levelLabel, levelValue]) => {
            const rate = throttling.rates[levelLabel]
            const reportLevel = Log.upgrade(levelLabel)

            const warningCallback = () => {
                logger.log(nowTimestamp(), "report", "events lost", undefined, reportLevel, 0, `more than ${rate} messages of level ${levelLabel} within ${throttling.windowDuration} minutes, starting throttling`, undefined, undefined, false)
            }

            const reportCallback = (lostEvents) => {
                logger.log(nowTimestamp(), "report", "events lost", undefined, reportLevel, lostEvents, `lost ${lostEvents} events of level ${levelLabel} due to throttling`, undefined, undefined, false)
            }

            this.#throttles[levelValue] = new RateThrottle(rate, throttling.windowDuration, throttling.reportFrequency, warningCallback, reportCallback)
        })
    }

    static downgrade(level) {
        let value = this.#levelValue[level]
        assert(value !== undefined, `unknown log level '${level}'`)

        if (level !== Log.NEVER) {
            value--
        }

        return this.#levelLabel[value]
    }

    static upgrade(levelLabel) {
        let value = this.#levelValue[levelLabel]
        assert(value !== undefined, `unknown log level '${levelLabel}'`)

        if (levelLabel !== Log.ALERT && levelLabel !== Log.NEVER) {
            value++
        }

        return this.#levelLabel[value]
    }

}

const logger = new Log()
