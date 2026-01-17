class DeviceTrust {

    static TYPE = "device"

    static #audit = new Audit(DeviceTrust.TYPE)

    static async init() {
        await DeviceTrust.#audit.ready()
    }

    static addReport(report) {
        for (const controlReport of Object.values(report.controls.results)) {
            const prevState = DeviceTrust.#audit.getFinding(controlReport.name)?.getState()

            const control = DeviceTrust.#audit.getFinding(controlReport.name) ?? DeviceTrust.#createControl(controlReport.name)
            if (!control || control.action === Action.SKIP) continue

            control.addReport(controlReport)
            control.definition = report.controls.definitions[controlReport.name]
            DeviceTrust.#audit.setFinding(control)

            const currState = control.getState()
            if (control.action === Action.BLOCK && currState === State.BLOCKING && prevState !== currState) {
                logger.log(nowTimestamp(), "devicetrust", "immediate block", undefined, Log.ERROR, control.name, `control '${control.name}' triggered an immediate blocking`, undefined, undefined, false)
            }
        }

        DeviceTrust.#audit.save()
        DeviceTrust.#audit.notify()
    }

    static #createControl(name) {
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

    static getStatus() {
        return DeviceTrust.#audit.getStatus()
    }

    static report() {
        Object.values(DeviceTrust.#audit.getFindings()).forEach(control => {
            logger.log(nowTimestamp(), "report", "devicetrust control", undefined, Log.INFO, control.getState(), `control '${control.name}' = ${control.getState()}`, undefined, undefined, false)
        })
        logger.log(nowTimestamp(), "report", "devicetrust compliance", undefined, Log.INFO, DeviceTrust.#audit.getCompliance(), `endpoint compliance rate = ${DeviceTrust.#audit.getCompliance()} %`, undefined, undefined, false)
    }

}

