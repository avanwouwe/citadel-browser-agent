---
layout: default
title: Device Dashboard
parent: Dashboard
nav_order: 1
---

# Device Dashboard
Your organisation has put in place policies and mechanisms to ensure the information security, such as:
* hard disks encryption
* software updates
* firewalls
* anti-virus scanners
.. etc

If these policies are not applied, this creates an information security risk. Citadel verifies that your device implements these policies and mechanisms, and can disable your access if this is not the case, in order to protect the information.

The Device Dashboard shows if your device is currently running safely. Each control has its own status.
* <span class="failing">`FAILING`</span> : your system is safe, but safety could be improved: Citadel will periodically remind you
* <span class="warning">`WARNING`</span> : your system is unsafe, your access to sensitive IT systems unless you act
* <span class="blocking">`BLOCKING`</span> : your access your organisation's IT systems has been cut, for safety reasons
* <span class="unknown">`UNKNOWN`</span> : the check could not be run

The "worst" control defines the state of your device.  If Citadel is raising issues, and you are not sure what to do, click on the name of the control for more information.

For detailed information about why Citadel considers a control failed, click on the 🔍 icon.

If you have correct the issue you can ask Citadel to re-evaluate by clicking on the ↻ icon, located next to the state of your device.

![Device Dashboard Screenshot](/img/screenshot/screenshot-dashboard-device.png)