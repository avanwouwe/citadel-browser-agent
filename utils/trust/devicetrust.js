class DeviceTrust {

    static TYPE = "device"

    #audit = new Audit()

    addReport(report) {
        for (const controlReport of Object.values(report.controls.results)) {
            const control = this.#audit.getFinding(controlReport.name) ?? this.#createControl(controlReport.name)
            if (!control || control.action === Action.SKIP) continue

            control.addReport(controlReport)
            this.#audit.setFinding(control)

            control.definition = report.controls.definitions[controlReport.name]
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
            logger.log(nowTimestamp(), "report", "devicetrust control", undefined, Log.INFO, control.getState(), `control ${control.name} = ${control.getState()}`, undefined, undefined, false)
        })
        logger.log(nowTimestamp(), "report", "devicetrust compliance", undefined, Log.INFO, this.#audit.getCompliance(), `endpoint compliance rate = ${this.#audit.getCompliance()} %`, undefined, undefined, false)
    }

}

