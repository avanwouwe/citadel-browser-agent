class RateThrottle {
    /**
     * @param limit max number of occurrences before throttling starts
     * @param windowDuration the length of the throttling window (in minutes)
     * @param reportFrequency frequency to perform reporting for ongoing throttling
     * @param warningCallback function to call to report start of throttling
     * @param reportCallback function to call to report throttled events
     **/
    constructor(limit, windowDuration, reportFrequency, warningCallback, reportCallback) {
        assert(reportFrequency >= windowDuration, "reportFrequency must be >= duration")

        this.limit = limit
        this.windowDuration = windowDuration * ONE_MINUTE

        this.reportFrequency = reportFrequency * ONE_MINUTE
        this.reportCallback = reportCallback
        this.warningCallback = warningCallback
        this.reportCount = 0

        this.state = null
    }

    #startReporting() {
        if (this.timer !== undefined) {
            return
        }

        this.warningCallback()
        this.timer = setInterval(this.#report, Date.now() + this.reportFrequency)
    }

    #stopReporting() {
        if (this.timer) {
            clearInterval(this.timer)
            this.timer = undefined
            this.#report()
        }
    }

    /**
     * Update reporting event tally and report according to the reportFrequency.
     */
    #report() {
        const currReportCount = this.reportCount
        if (currReportCount > 0) {
            this.reportCallback(currReportCount)
            this.reportCount = 0
        }
    }

    #startWindow(setThrottled) {
        const currThrottled = this?.state?.throttled ?? false

        this.state = {
            count: 1,
            windowEnd: Date.now() + this.windowDuration,
            throttled: setThrottled,
        }

        if (currThrottled && !setThrottled) {
            this.#stopReporting()
        } else if (!currThrottled && setThrottled) {
            this.#startReporting()
        }

        return setThrottled
    }


    /**
     * Returns `false` if NOT throttled (allowed), `true` if throttled.
     */
    throttle() {
        const now = Date.now()
        let s = this.state

        // outside of a window
        if (!s || now > s.windowEnd) {
            return this.#startWindow(false)
        }

        if (s.throttled) {
            this.reportCount++
        }
        s.count++

        // in window, within limit, stay in current window and state
        if (s.count <= this.limit) {
            return s.throttled
        }

        // exceeded limit, start a new (throttled) window
        return this.#startWindow(true)
    }
}