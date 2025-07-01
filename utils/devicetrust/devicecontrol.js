class DeviceControl {

    #controlName
    #lastReport
    #lastDayStart
    #failedDays = 0
    #action

    constructor(controlName) {
        this.#controlName = controlName
        for (const action of DeviceTrust.Action.values) {
            if (config.devicetrust.actions[action].includes(controlName)) {
                this.#action = action
            }
        }

        if (this.#action === undefined) {
            this.#action = config.devicetrust.actions.default
        }
    }

    addReport(report) {
        assert(report.name === this.#controlName, `sent report for "${report.name}" to control "${this.#controlName}"`)

        if (report.passing) {
            this.#lastReport = report
            this.#lastDayStart = report.timestamp
            this.#failedDays = 0
            return
        }

        if (report.timestamp - this.#lastDayStart > ONE_DAY) {
            this.#lastDayStart = report.timestamp
            this.#failedDays++
        }

        this.#lastReport = report
    }

    getReport() {
        return this.#lastReport
    }

    getName() {
        return this.#controlName
    }

    getState() {
        if (this.#lastReport.passed) {
            return DeviceTrust.State.PASSING
        } else if (this.#action === DeviceTrust.Action.NOTHING || this.#action === DeviceTrust.Action.NOTIFY) {
            return DeviceTrust.State.FAILING
        } else if (this.#failedDays >= config.devicetrust.trigger.block) {
            return DeviceTrust.State.BLOCKING
        } else if (this.#action === DeviceTrust.Action.WARN && this.#failedDays >= config.devicetrust.trigger.warn) {
            return DeviceTrust.State.WARNING
        } else {
            return DeviceTrust.State.FAILING
        }
    }

    getNextState() {
        if (this.#lastReport.passed) {
            return {state: DeviceTrust.State.PASSING}
        } else if (this.#action === DeviceTrust.Action.NOTHING || this.#action === DeviceTrust.Action.NOTIFY) {
            return { state: DeviceTrust.State.FAILING }
        } else if (this.#action === DeviceTrust.Action.WARN && this.#failedDays < config.devicetrust.trigger.warn) {
            return { state: DeviceTrust.State.WARNING, days: config.devicetrust.trigger.warn - this.#failedDays }
        } else if (this.#failedDays < config.devicetrust.trigger.block) {
            return { state: DeviceTrust.State.BLOCKING, days: config.devicetrust.trigger.block - this.#failedDays }
        } else {
            return { state: DeviceTrust.State.FAILING }
        }
    }

}

