class DeviceControl {

    name
    action
    definition
    report
    #warnTrigger
    #blockTrigger
    #lastDayStart
    #failedDays = 0

    constructor(controlName, action, warnTrigger, blockTrigger) {
        assert(action !== Action.SKIP, `tried to create skipped control ${controlName}`)

        this.name = controlName
        this.action = action
        this.#warnTrigger = warnTrigger
        this.#blockTrigger = blockTrigger
    }

    addReport(report) {
        assert(report.name === this.name, `sent report for "${report.name}" to control "${this.name}"`)

        if (report.passing) {
            this.report = report
            this.#lastDayStart = report.timestamp
            this.#failedDays = 0
            return
        }

        if (report.timestamp - this.#lastDayStart > ONE_DAY) {
            this.#lastDayStart = report.timestamp
            this.#failedDays++
        }

        this.report = report
    }

    getState() {
        if (this.report.passed) {
            return State.PASSING
        } else if (this.action === Action.BLOCK) {
            return State.BLOCKING
        } else if (this.action === Action.NOTHING || this.action === Action.NOTIFY) {
            return State.FAILING
        } else if (this.#failedDays >= config.device.trigger.block) {
            return State.BLOCKING
        } else if (this.#failedDays >= config.device.trigger.warn) {
            return State.WARNING
        } else {
            return State.FAILING
        }
    }

    getNextState() {
        if (this.report.passed) {
            return {state: State.PASSING}
        } else if (this.action === Action.BLOCK) {
            return { state: State.BLOCKING }
        } else if (this.action === Action.NOTHING || this.action === Action.NOTIFY) {
            return { state: State.FAILING }
        } else if (this.#failedDays < config.device.trigger.warn) {
            return { state: State.WARNING, days: config.device.trigger.warn - this.#failedDays }
        } else if (this.#failedDays < config.device.trigger.block) {
            return { state: State.BLOCKING, days: config.device.trigger.block - this.#failedDays }
        } else {
            return { state: State.BLOCKING }
        }
    }

}

