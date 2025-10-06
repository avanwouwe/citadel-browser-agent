class DeviceTrust {

    static TYPE = "device"

    #controls = { }
    #deviceState

    addReport(report) {
        for (const controlReport of Object.values(report.controls.results)) {
            const isSkipped = config.device.actions[Action.SKIP].includes(controlReport.name)
            if (!isSkipped) {
                const control = this.getControl(controlReport.name)
                control.addReport(controlReport)
                control.definition = report.controls.definitions[controlReport.name]
            }
        }

        let worstState = State.indexOf(State.PASSING)
        Object.values(this.#controls).forEach(control => {
            const controlState = State.indexOf(control.getState())
            worstState = Math.max(worstState, controlState)
        })
        this.#deviceState = State.values[worstState]

        this.#notify()
    }

    getControl(name) { return this.#controls.getOrSet(name, new DeviceControl(name)) }

    getControls() { return this.#controls }

    getState() { return this.#deviceState ?? State.UNKNOWN }

    getNextState() {
        if (this.getState() === State.UNKNOWN) return  { state: State.UNKNOWN }

        let worstState = { state: State.PASSING }

        Object.values(this.#controls).forEach(control => {
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
        const controls = Object.values(this.#controls)
        let compliant = 0

        controls.forEach(control => { if (control.getState() === State.PASSING) compliant++ })
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

        if (this.#deviceState === State.PASSING) {
            Notification.setAlert(DeviceTrust.TYPE, this.#deviceState)
        } else if (this.#deviceState === State.FAILING) {
            Notification.setAlert(DeviceTrust.TYPE, this.#deviceState, title, t("devicetrust.notification.failing"))
        } else if (this.#deviceState === State.WARNING) {
            const days = this.getNextState().days ?? t("devicetrust.notification.a-few")
            Notification.setAlert(DeviceTrust.TYPE, this.#deviceState, title, t("devicetrust.notification.warning", {days}))
        } else if (this.#deviceState === State.BLOCKING) {
            Notification.setAlert(DeviceTrust.TYPE, this.#deviceState, title, t("devicetrust.notification.blocking"))
        }
    }
}

