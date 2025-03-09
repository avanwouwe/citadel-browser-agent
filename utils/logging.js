class Log {

    static TRACE = "TRACE"
    static DEBUG = "DEBUG"
    static INFO  = "INFO"
    static WARN  = "WARN"
    static ERROR = "ERROR"
    static ALERT = "ALERT"
    static NONE = "NONE"

    static #levelValue = {
        TRACE: 0,
        DEBUG: 1,
        INFO:  2,
        WARN:  3,
        ERROR: 4,
        ALERT: 5,
        NONE: 6
    };

    static #minLogLevel
    static #minConsoleLevel
    static #maxUrlMaskLevel


    log(
        timestamp,
        event,
        result,
        url,
        level,
        value,
        description = undefined,
        initiator = undefined,
        id = getRandomInt()
    ){
        Log.#loadConfig()

        const levelvalue = Log.#levelnameToLevelvalue(level)

        if (levelvalue < Log.#minLogLevel && levelvalue < Log.#minConsoleLevel) { return }

        url = this.maskUrl(url, level)
        initiator = this.maskUrl(initiator, level)

        url = truncateString(url, config.logging.maxUrlLength) ?? "".emptyToUndefined();
        initiator = truncateString(initiator, config.logging.maxUrlLength) ?? "".emptyToUndefined();

        const logEntry = {
            timestamp,
            id,
            url,
            browseragent: {
                event,
                result,
                level,
                value,
                description,
                initiator
            }
        }

        // if the value is an object, move it to the "details" node
        if (typeof value === 'object') {
            const details = value[event]
            if (details && typeof details === 'object'  ) {
                logEntry['browseragent']['detail'] = {};
                logEntry['browseragent']['detail'][event] = details
            }

            delete logEntry['browseragent']['value']
        }

        if (levelvalue >= Log.#minLogLevel) {
            Port.postMessage("event", logEntry)
        }

        if (levelvalue >= Log.#minConsoleLevel) {
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

    maskUrl(url, level) {
        if (!url) { return url }

        if (Log.#levelnameToLevelvalue(level) < Log.#maxUrlMaskLevel) {
            if (typeof url === 'string') { url = new URL(url) }

            url.username ? url.username = url.username.hashDJB2() : undefined
            url.password ? url.password = url.password.hashDJB2() : undefined
            url.hostname ? url.hostname = url.hostname.hashDJB2() : undefined
            url.pathname && url.pathname !== "/" ? url.pathname = url.pathname.hashDJB2() : undefined
            url.hash ? url.hash = url.hash.hashDJB2() : undefined
            url.search ? url.search = url.search.hashDJB2() : undefined
        }
        return url.toString()
    }


    static #levelnameToLevelvalue(level) { return Log.#levelValue[level] }

    static #loadConfig() {
        Config.assertIsLoaded()

        if (Log.#minLogLevel === undefined) {
            Log.#minLogLevel     = Log.#levelnameToLevelvalue(config.logging.logLevel)
            Log.#minConsoleLevel = Log.#levelnameToLevelvalue(config.logging.consoleLevel)
            Log.#maxUrlMaskLevel = Log.#levelnameToLevelvalue(config.logging.maskUrlLevel)

            console.log("minimum log level:", config.logging.logLevel)
            console.log("minimum console level:", config.logging.consoleLevel)
        }
    }
}

const logger = new Log()
