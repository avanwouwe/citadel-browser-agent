---
layout: default
title: Device Dashboard
parent: Dashboard
nav_order: 1
---

# Device Dashboard
The Device dashboard shows if your device is currently running safely. Each control has its own status, and the "worst" state defines the state of your device.

The following states are possible:
* `FAILING` : your system is safe, but safety could be improved: Citadel will periodically remind you
* `WARNING` : your system is unsafe, your access to sensitive IT systems unless you act
* `BLOCKING` : your access your organisation's IT systems has been cut, for safety reasons
* `UNKNOWN` : the check could not be run

If Citadel is raising issues, and you are not sure what to do, click on the name of the control for more information.

For detailed information about why Citadel considers a control failed, click on the 🔍 icon.

If you have correct the issue you can click on the ↻ icon, next to the state of your device.

![Device Dashboard Screenshot](/img/screenshot/screenshot-dashboard-device.png)