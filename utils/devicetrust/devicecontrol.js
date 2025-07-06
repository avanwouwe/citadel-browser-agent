class DeviceControl {

    name
    definition
    report
    #lastDayStart
    #failedDays = 0
    #action

    constructor(controlName) {
        const isSkipped = config.devicetrust.actions[DeviceTrust.Action.SKIP].includes(controlName)
        assert(!isSkipped, `tried to create skipped control ${controlName}`)

        this.name = controlName
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
            return DeviceTrust.State.PASSING
        } else if (this.#action === DeviceTrust.Action.BLOCK) {
            return DeviceTrust.State.BLOCKING
        } else if (this.#action === DeviceTrust.Action.NOTHING || this.#action === DeviceTrust.Action.NOTIFY) {
            return DeviceTrust.State.FAILING
        } else if (this.#failedDays >= config.devicetrust.trigger.block) {
            return DeviceTrust.State.BLOCKING
        } else if (this.#failedDays >= config.devicetrust.trigger.warn) {
            return DeviceTrust.State.WARNING
        } else {
            return DeviceTrust.State.FAILING
        }
    }

    getNextState() {
        if (this.report.passed) {
            return {state: DeviceTrust.State.PASSING}
        } else if (this.#action === DeviceTrust.Action.BLOCK) {
            return { state: DeviceTrust.State.BLOCKING }
        } else if (this.#action === DeviceTrust.Action.NOTHING || this.#action === DeviceTrust.Action.NOTIFY) {
            return { state: DeviceTrust.State.FAILING }
        } else if (this.#failedDays < config.devicetrust.trigger.warn) {
            return { state: DeviceTrust.State.WARNING, days: config.devicetrust.trigger.warn - this.#failedDays }
        } else if (this.#failedDays < config.devicetrust.trigger.block) {
            return { state: DeviceTrust.State.BLOCKING, days: config.devicetrust.trigger.block - this.#failedDays }
        } else {
            return { state: DeviceTrust.State.BLOCKING }
        }
    }

}

