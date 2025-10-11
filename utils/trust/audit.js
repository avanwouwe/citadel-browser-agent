class State {
    static UNKNOWN = "UNKNOWN"
    static PASSING = "PASSING"
    static FAILING = "FAILING"
    static WARNING = "WARNING"
    static BLOCKING = "BLOCKING"

    static values= [this.PASSING, this.FAILING, this.WARNING, this.BLOCKING]
    static indexOf(value) { return this.values.indexOf(value) }
}

class Action {
    static SKIP = "SKIP"
    static NOTHING = "NOTHING"
    static NOTIFY = "NOTIFY"
    static WARN = "WARN"
    static BLOCK = "BLOCK"

    static values= [this.NOTHING, this.NOTIFY, this.WARN, this.BLOCK]
}

class Audit {

    #findings = { }
    #conclusion

    addReport(report) {
        for (const controlReport of Object.values(report.controls.results)) {
            const control = this.getFinding(controlReport.name)

            if (!control || control.action === Action.SKIP) continue

            control.addReport(controlReport)
            control.definition = report.controls.definitions[controlReport.name]
        }

        let worstState = State.indexOf(State.PASSING)
        Object.values(this.#findings).forEach(finding => {
            const findingState = State.indexOf(finding.getState())
            worstState = Math.max(worstState, findingState)
        })
        this.#conclusion = State.values[worstState]
    }

    getFindings() { return this.#findings }

    getFinding(name) {
        const warnTrigger = config.device.trigger.warn
        const blockTrigger = config.device.trigger.block

        let action = config.device.actions.default
        for (const i of Action.values) {
            if (config.device.actions[i].includes(name)) {
                action = i
            }
        }

        return this.#findings.getOrSet(name, new DeviceControl(name, action, warnTrigger, blockTrigger))
    }

    getControls() { return this.#findings }

    getState() { return this.#conclusion ?? State.UNKNOWN }

    getNextState() {
        if (this.getState() === State.UNKNOWN) return  { state: State.UNKNOWN }

        let worstState = { state: State.PASSING }

        Object.values(this.#findings).forEach(control => {
            const currState = control.getNextState()
            if (
                State.indexOf(currState.state) > State.indexOf(worstState.state) ||
                State.indexOf(currState.state) === State.indexOf(worstState.state) &&
                currState.days < worstState.days
            ) {
                worstState = currState
            }
        })

        return worstState
    }

    getCompliance() {
        const findings = Object.values(this.#findings)
        let compliant = 0

        findings.forEach(finding => { if (finding.getState() === State.PASSING) compliant++ })
        const rate = findings.length ? compliant / findings.length : 0
        return Math.round(rate * 100)
    }

    getStatus() {
        const status = {
            controls: { },
            state: this.getState(),
            nextState: this.getNextState(),
            compliance: this.getCompliance()
        }

        Object.values(this.getControls()).forEach((control) => {
            status.controls[control.name] = {
                name: control.name,
                definition: control.definition,
                report: control.report,
                passing: control.report.passed,
                state: control.getState(),
                nextState: control.getNextState(),
            }
        })

        return status
    }

    notify(type) {
        const title = t(`${type}.notification.title`)

        if (this.#conclusion === State.PASSING) {
            Notification.setAlert(DeviceTrust.TYPE, this.#conclusion)
        } else if (this.#conclusion === State.FAILING) {
            Notification.setAlert(DeviceTrust.TYPE, this.#conclusion, title, t(`${type}.notification.failing`))
        } else if (this.#conclusion === State.WARNING) {
            const days = this.getNextState().days ?? t(`${type}.notification.a-few`)
            Notification.setAlert(DeviceTrust.TYPE, this.#conclusion, title, t(`${type}.notification.warning`, {days}))
        } else if (this.#conclusion === State.BLOCKING) {
            Notification.setAlert(DeviceTrust.TYPE, this.#conclusion, title, t(`${type}.notification.blocking`))
        }
    }
}

class Control {

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
        } else if (this.#failedDays >= this.#blockTrigger) {
            return State.BLOCKING
        } else if (this.#failedDays >= this.#warnTrigger) {
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
        } else if (this.#failedDays < this.#warnTrigger) {
            return { state: State.WARNING, days: this.#warnTrigger - this.#failedDays }
        } else if (this.#failedDays < this.#blockTrigger) {
            return { state: State.BLOCKING, days: this.#blockTrigger - this.#failedDays }
        } else {
            return { state: State.BLOCKING }
        }
    }

}

