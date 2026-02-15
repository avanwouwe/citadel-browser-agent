---
layout: default
title: Device Dashboard
parent: Dashboard
nav_order: 1
---

# Device Dashboard
The Device dashboard shows if your device is currently running safely. Each control has its own status, and the "worst" state defines the state of your device.

The following states are possible:
* `FAILING` : your system is not unsafe, but safety could be improved: Citadel will periodically remind you
* `WARNING` : your system is unsafe, your access your organisation's IT systems will by cut if nothing is done
* `BLOCKING` : your access your organisation's IT systems has been cut, for safety reasons
* `UNKNOWN` : the check could not be run

If Citadel is raising issues, and you are not sure what to do, click on the name of the control for more information.

For detailed information about why Citadel considers this control failed, click on the 🔍 icon.

If you have correct the issue you can click on the ↻ icon, next to the state of your device.

![Device Dashboard Screenshot](/img/screenshot/screenshot-dashboard-device.png)