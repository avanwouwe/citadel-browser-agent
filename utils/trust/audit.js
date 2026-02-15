class State {
    static UNKNOWN = "UNKNOWN"
    static PASSING = "PASSING"
    static FAILING = "FAILING"
    static WARNING = "WARNING"
    static BLOCKING = "BLOCKING"

    static values = [this.PASSING, this.FAILING, this.WARNING, this.BLOCKING]
    static indexOf(value) { return this.values.indexOf(value) }
}

class Action {
    static SKIP = "SKIP"
    static NOTHING = "NOTHING"
    static NOTIFY = "NOTIFY"
    static WARN = "WARN"
    static BLOCK = "BLOCK"

    static values = [this.NOTHING, this.NOTIFY, this.WARN, this.BLOCK]
    static indexOf(value) { return this.values.indexOf(value) }
}

class Audit {

    #findings = {}
    #conclusion = State.PASSING
    #persistence
    #type

    constructor(type) {
        this.#type = type
        this.#persistence = new HydratedObject(
            `audit-${type}`,
            this,
            (data, audit) => {
                audit.#conclusion = data.conclusion
                audit.#findings = Object.fromEntries(
                    Object.entries(data.findings ?? {}).map(
                        ([name, ctrlData]) => [name, Control.hydrate(ctrlData)]
                    )
                )
            },
            (audit) => ({
                conclusion: audit.#conclusion,
                findings: Object.fromEntries(
                    Object.entries(audit.#findings).map(
                        ([name, control]) => [name, control.dehydrate()]
                    )
                )
            })
        )
    }

    async ready() {
        await Promise.all([
            Notification.init(),
            this.#persistence.ready()
        ])
        return this
    }

    async save() {
        this.notify()
        return this.#persistence.save()
    }

    getFindings() {
        return this.#findings
    }

    getFinding(name) {
        return this.#findings[name]
    }

    removeFinding(name) {
        delete this.#findings[name]
    }

    setFinding(control) {
        this.#findings[control.name] = control

        let worstState = State.indexOf(State.PASSING)
        Object.values(this.#findings).forEach(finding => {
            const findingState = State.indexOf(finding.getState())
            worstState = Math.max(worstState, findingState)
        })
        this.#conclusion = State.values[worstState]
    }

    getState() {
        return this.#conclusion ?? State.UNKNOWN
    }

    getNextState() {
        if (this.getState() === State.UNKNOWN) return { state: State.UNKNOWN }

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

        findings.forEach(finding => {
            if (finding.getState() === State.PASSING) compliant++
        })
        const rate = findings.length ? compliant / findings.length : 0
        return Math.round(rate * 100)
    }

    getStatus() {
        const status = {
            controls: {},
            state: this.getState(),
            nextState: this.getNextState(),
            compliance: this.getCompliance()
        }

        Object.values(this.getFindings()).forEach((control) => {
            status.controls[control.name] = {
                name: control.name,
                definition: control.definition,
                report: control.report,
                passing: control.report.passing,
                state: control.getState(),
                nextState: control.getNextState(),
            }
        })

        return status
    }

    notify() {
        const title = t(`${this.#type}trust.notification.title`)
        const contact = config.company.contact

        if (this.#conclusion === State.PASSING) {
            Notification.setAlert(this.#type, this.#conclusion)
        } else if (this.#conclusion === State.FAILING) {
            Notification.setAlert(this.#type, this.#conclusion, title, t(`${this.#type}trust.notification.failing`, { contact }))
        } else if (this.#conclusion === State.WARNING) {
            const days = this.getNextState().days ?? t(`${this.#type}trust.notification.a-few`)
            Notification.setAlert(this.#type, this.#conclusion, title, t(`${this.#type}trust.notification.warning`,  { days, contact }))
        } else if (this.#conclusion === State.BLOCKING) {
            Notification.setAlert(this.#type, this.#conclusion, title, t(`${this.#type}trust.notification.blocking`, { contact }))
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

    constructor(controlName, action, warnTrigger, blockTrigger, definition = undefined) {
        assert(action !== Action.SKIP, `tried to create skipped control ${controlName}`)

        this.name = controlName
        this.action = action
        this.definition = definition
        this.#warnTrigger = warnTrigger
        this.#blockTrigger = blockTrigger
    }

    addReport(report) {
        assert(report.name === this.name, `sent report for "${report.name}" to control "${this.name}"`)

        this.#lastDayStart = this.#lastDayStart ?? report.timestamp

        if (report.passing) {
            this.#lastDayStart = report.timestamp
            this.#failedDays = 0
        } else {
            // days don't count if an endpoint is turned off
            const newFailedDays = (report.timestamp - this.#lastDayStart) / ONE_DAY
            if (newFailedDays >= 1) {
                this.#lastDayStart = report.timestamp
                this.#failedDays++
            }
        }

        this.report = report
    }

    getState() {
        if (this.report.passing == null) {
            return State.UNKNOWN
        } else if (this.report.passing) {
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
        if (this.report.passing == null) {
            return { state: State.UNKNOWN }
        } else if (this.report.passing) {
            return { state: State.PASSING }
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

    dehydrate() {
        const report = cloneDeep(this.report)
        if (report?.timestamp) {
            report.timestamp = report.timestamp.toISOString()
        }

        return {
            name: this.name,
            action: this.action,
            definition: this.definition,
            report: report,
            warnTrigger: this.#warnTrigger,
            blockTrigger: this.#blockTrigger,
            lastDayStart: this.#lastDayStart?.toISOString(),
            failedDays: this.#failedDays
        }
    }

    static hydrate(data) {
        const control = new Control(
            data.name,
            data.action,
            data.warnTrigger,
            data.blockTrigger,
            data.definition
        )
        control.#lastDayStart = parseTimestamp(data.lastDayStart)
        control.#failedDays = data.failedDays

        control.report = data.report
        if (control?.report?.timestamp) {
            control.report.timestamp = parseTimestamp(control.report.timestamp)
        }

        return control
    }
}
