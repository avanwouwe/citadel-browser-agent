class DeviceTrust {

    static TYPE = "device"

    #audit = new Audit()

    addReport(report) {
        for (const controlReport of Object.values(report.controls.results)) {
            const prevState = this.#audit.getFinding(controlReport.name)?.getState()

            const control = this.#audit.getFinding(controlReport.name) ?? this.#createControl(controlReport.name)
            if (!control || control.action === Action.SKIP) continue

            control.addReport(controlReport)
            control.definition = report.controls.definitions[controlReport.name]
            this.#audit.setFinding(control)

            const currState = control.getState()
            if (control.action === Action.BLOCK && currState === State.BLOCKING && prevState !== currState) {
                logger.log(nowTimestamp(), "devicetrust", "immediate block", undefined, Log.ERROR, control.name, `control '${control.name}' triggered an immediate blocking`, undefined, undefined, false)
            }
        }

        this.#audit.notify(DeviceTrust.TYPE)
    }

    #createControl(name) {
        const warnTrigger = config.device.trigger.warn
        const blockTrigger = config.device.trigger.block

        let action = config.device.actions.default
        for (const i of Action.values) {
            if (config.device.actions[i].includes(name)) {
                action = i
            }
        }
        return new Control(name, action, warnTrigger, blockTrigger)
    }

    getStatus() {
        return this.#audit.getStatus()
    }

    report() {
        Object.values(this.#audit.getFindings()).forEach(control => {
            logger.log(nowTimestamp(), "report", "devicetrust control", undefined, Log.INFO, control.getState(), `control '${control.name}' = ${control.getState()}`, undefined, undefined, false)
        })
        logger.log(nowTimestamp(), "report", "devicetrust compliance", undefined, Log.INFO, this.#audit.getCompliance(), `endpoint compliance rate = ${this.#audit.getCompliance()} %`, undefined, undefined, false)
    }

}

