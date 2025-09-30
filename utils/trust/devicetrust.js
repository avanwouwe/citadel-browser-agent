class DeviceTrust {

    static TYPE = "device"

    static State = class {
        static UNKNOWN = "UNKNOWN"
        static PASSING = "PASSING"
        static FAILING = "FAILING"
        static WARNING = "WARNING"
        static BLOCKING = "BLOCKING"

        static values= [this.PASSING, this.FAILING, this.WARNING, this.BLOCKING]
        static indexOf(value) { return this.values.indexOf(value) }
    }

    static Action = class {
        static SKIP = "SKIP"
        static NOTHING = "NOTHING"
        static NOTIFY = "NOTIFY"
        static WARN = "WARN"
        static BLOCK = "BLOCK"

        static values= [this.NOTHING, this.NOTIFY, this.WARN, this.BLOCK]
    }

    #controls = { }
    #deviceState

    addReport(report) {
        for (const controlReport of Object.values(report.controls.results)) {
            const isSkipped = config.device.actions[DeviceTrust.Action.SKIP].includes(controlReport.name)
            if (!isSkipped) {
                const control = this.getControl(controlReport.name)
                control.addReport(controlReport)
                control.definition = report.controls.definitions[controlReport.name]
            }
        }

        let worstState = DeviceTrust.State.indexOf(DeviceTrust.State.PASSING)
        Object.values(this.#controls).forEach(control => {
            const controlState = DeviceTrust.State.indexOf(control.getState())
            worstState = Math.max(worstState, controlState)
        })
        this.#deviceState = DeviceTrust.State.values[worstState]

        this.#notify()
    }

    getControl(name) { return this.#controls.getOrSet(name, new DeviceControl(name)) }

    getControls() { return this.#controls }

    getState() { return this.#deviceState ?? DeviceTrust.State.UNKNOWN }

    getNextState() {
        if (this.getState() === DeviceTrust.State.UNKNOWN) return  { state: DeviceTrust.State.UNKNOWN }

        let worstState = { state: DeviceTrust.State.PASSING }

        Object.values(this.#controls).forEach(control => {
            const currState = control.getNextState()
            if (
                DeviceTrust.State.indexOf(currState.state) > DeviceTrust.State.indexOf(worstState.state) ||
                DeviceTrust.State.indexOf(currState.state) === DeviceTrust.State.indexOf(worstState.state) &&
                currState.days < worstState.days
            ) {
                worstState = currState
            }
        })

        return worstState
    }

    getCompliance() {
        const controls = Object.values(this.#controls)
        let compliant = 0

        controls.forEach(control => { if (control.getState() === DeviceTrust.State.PASSING) compliant++ })
        const rate = controls.length ? compliant / controls.length : 0
        return Math.round(rate * 100)
    }

    getStatus() {
        const status = {
            controls: { },
            state: devicetrust.getState(),
            nextState: devicetrust.getNextState(),
            compliance: devicetrust.getCompliance()
        }

        Object.values(devicetrust.getControls()).forEach((control) => {
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

    report() {
        Object.values(this.#controls).forEach(control => {
            logger.log(nowTimestamp(), "report", "devicetrust control", undefined, Log.INFO, control.getState(), `control ${control.name} = ${control.getState()}`, undefined, undefined, false)
        })
        logger.log(nowTimestamp(), "report", "devicetrust compliance", undefined, Log.INFO, this.getCompliance(), `endpoint compliance rate = ${this.getCompliance()} %`, undefined, undefined, false)
    }

    #notify() {
        const title = t("devicetrust.notification.title")

        if (this.#deviceState === DeviceTrust.State.PASSING) {
            Notification.setAlert(DeviceTrust.TYPE, this.#deviceState)
        } else if (this.#deviceState === DeviceTrust.State.FAILING) {
            Notification.setAlert(DeviceTrust.TYPE, this.#deviceState, title, t("devicetrust.notification.failing"))
        } else if (this.#deviceState === DeviceTrust.State.WARNING) {
            const days = this.getNextState().days ?? t("devicetrust.notification.a-few")
            Notification.setAlert(DeviceTrust.TYPE, this.#deviceState, title, t("devicetrust.notification.warning", {days}))
        } else if (this.#deviceState === DeviceTrust.State.BLOCKING) {
            Notification.setAlert(DeviceTrust.TYPE, this.#deviceState, title, t("devicetrust.notification.blocking"))
        }
    }
}

