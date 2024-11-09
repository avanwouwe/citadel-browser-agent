<div align="center">
  <img alt="Citadel logo" src="gui/images/logo.png" width="50%">
</div>

# citadel-browser-agent
A browser agent that detects malware and shadow IT by analysing and logging security events in a privacy-respecting way. Comes pre-integrated with the open source EDR Wazuh.

## security event detection
It detects the following events in the browser:
* IP or URL is blacklisted (configurable blacklist)
* the browser has blocked the navigation to the site
* user is using unencrypted protocols (e.g. FTP or HTTP)
* user is using non-standard port numbers (i.e. not 443)
* user is using URL with username or password in the URL
* user has downloaded a file
* the user is warned that the downloaded file is dangerous
* user has accepted downloading of dangerous file
* domain name does not match the SSL certificate
* SSL certificate authority invalid (e.g. self-signed or expired certificate)
* SSL protocol error

It also reports on usage statistics of applications, allowing for detection of shadow IT.

Events and reports are written as syslog entries with a relevant level, and can then be consumed by a SIEM or EDR. Citadel comes [pre-integrated with Wazuh](/doc/wazuh.md)..


## shadow IT detection
Citadel inspects internet use and generates daily statistics per site. Citadel attempts to identify sites that are applications by separating authenticated and unauthenticated internet sites.

The interaction analysis is based both on navigation and on clicks, ensuring that it also works for Single Page Applications.


## Privacy respecting
Citadel hashes the URL for events that do not indicate immediate threats, and are only logged for digital forensics. The different parts (hostname, path, query, etc) of the URL are hashed separately so that it remains possible to perform analysis after an incident.

The shadow-IT detection only reports on interaction with (authenticated) applications, and only tracks the number of interactions per site, per day.

The data is logged on your computer and is never sent to the cloud.