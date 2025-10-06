class DeviceControl {

    name
    definition
    report
    #lastDayStart
    #failedDays = 0
    #action

    constructor(controlName) {
        const isSkipped = config.device.actions[Action.SKIP].includes(controlName)
        assert(!isSkipped, `tried to create skipped control ${controlName}`)

        this.name = controlName
        for (const action of Action.values) {
            if (config.device.actions[action].includes(controlName)) {
                this.#action = action
            }
        }

        if (this.#action === undefined) {
            this.#action = config.device.actions.default
        }
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
        } else if (this.#action === Action.BLOCK) {
            return State.BLOCKING
        } else if (this.#action === Action.NOTHING || this.#action === Action.NOTIFY) {
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
        } else if (this.#action === Action.BLOCK) {
            return { state: State.BLOCKING }
        } else if (this.#action === Action.NOTHING || this.#action === Action.NOTIFY) {
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

