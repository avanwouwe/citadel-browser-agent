class DeviceTrust {

    static State = class {
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

    #devicecontrols = { }
    #deviceState
    #lastNotification = 0

    addReport(report) {
        const browserUpdated = Browser.isUpdated(report.browsers)
        this.getControl("BrowserUpdated")
            .addReport({name: "BrowserUpdated", passed: browserUpdated, timestamp: nowTimestamp()})

        for (const controlReport of Object.values(report.controls)) {
            const isSkipped = config.devicetrust.actions[DeviceTrust.Action.SKIP].includes(controlReport.name)
            if (!isSkipped) {
                this.getControl(controlReport.name)
                    .addReport(controlReport)
            }
        }

        let worstState = DeviceTrust.State.indexOf(DeviceTrust.State.PASSING)
        Object.values(this.#devicecontrols).forEach(control => {
            const controlState = DeviceTrust.State.indexOf(control.getState())
            worstState = Math.max(worstState, controlState)
        })
        this.#deviceState = DeviceTrust.State.values[worstState]

        this.#notify()
    }

    getControl(name) { return this.#devicecontrols.getOrSet(name, new DeviceControl(name)) }

    getControls() { return this.#devicecontrols }

    getState() { return this.#deviceState }

    getNextState() {
        let worstState = { state: DeviceTrust.State.PASSING }

        Object.values(this.#devicecontrols).forEach(control => {
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
        const controls = Object.values(this.#devicecontrols)
        let compliant = 0

        controls.forEach(control => { if (control.getState() === DeviceTrust.State.PASSING) compliant++ })
        const rate = controls.length ? compliant / controls.length : 1
        return Math.round(rate * 100)

    }

    report() {
        Object.values(this.#devicecontrols).forEach(control => {
            logger.log(nowTimestamp(), "report", "devicetrust control", undefined, Log.INFO, control.getState(), `control ${control.getName()} = ${control.getState()}`, undefined, undefined, false)
        })
        logger.log(nowTimestamp(), "report", "devicetrust compliance", undefined, Log.INFO, this.getCompliance(), `endpoint compliance rate = ${this.getCompliance()} %`, undefined, undefined, false)
    }

    #notify() {
        setWarning(this.#deviceState === DeviceTrust.State.WARNING || this.#deviceState === DeviceTrust.State.BLOCKING)

        const alertId = "devicetrust"
        const title = "Device security issues"
        const timeSinceLastNotification = Date.now() - this.#lastNotification

        if (this.#deviceState === DeviceTrust.State.PASSING) {
            cancelAlert(alertId)
            this.#lastNotification = Date.now()
            return
        }

        if (DeviceTrust.State.FAILING && timeSinceLastNotification >= ONE_DAY * 7) {
            raiseAlert(alertId, title, `Your device has security issues. Click to fix them.`)
            this.#lastNotification = Date.now()
        } else if (DeviceTrust.State.WARNING && timeSinceLastNotification >= ONE_DAY * 1) {
            raiseAlert(alertId, title, `⚠️ Your device is not is securely configured. In ${this.getNextState().days ?? "a few"} days your device will be blocked. Click to fix issues.`)
            this.#lastNotification = Date.now()
        } else if (DeviceTrust.State.BLOCKING && timeSinceLastNotification >= ONE_DAY * 1) {
            raiseAlert(alertId, title, `⚠️ Your device is insecure and has been blocked. Click to fix issues.`)
            this.#lastNotification = Date.now()
        }
    }
}

