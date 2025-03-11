<div align="center">
  <img alt="Citadel logo" src="gui/images/logo.png" width="25%">
</div>

# Citadel browser agent
Citadel is a browser agent that detects malware and shadow IT by analyzing and logging browser security events to syslog and Windows Event Log a privacy-respecting way. It is meant to be used by CISO and CIO to secure staff laptops, increase situational awareness and allow Digital Forensics and Incident Response (DFIR).

Citadel comes pre-integrated with [Wazuh](https://wazuh.com/), the open source XDR.

## Security event detection
It detects the following events in the browser:
* IP or URL is blacklisted (configurable blacklist)
* the browser has blocked the navigation to the site
* user is using unencrypted protocols for an application (e.g. FTP or HTTP)
* user is using URL with username or password in the URL
* user has downloaded a file
* user has used a password that does not conform to the password policy
* user has selected a file (n.b. it is unknown if the file was uploaded)
* user has opened the print dialog for a page (n.b. it is unknown if the dialog was cancelled)
* the user is warned that the downloaded file is dangerous
* user has accepted downloading of dangerous file
* security-related network errors (see chrome://network-errors)

It also reports on usage statistics of applications, allowing for detection of shadow IT.

Events and reports are written as syslog entries with a relevant level, and can then be consumed by a SIEM or EDR. Citadel comes [pre-integrated with Wazuh](/doc/wazuh.md).


## Shadow IT detection
Citadel inspects internet use and generates daily statistics per site. Citadel attempts to identify sites that are applications by separating authenticated and unauthenticated internet sites.

The interaction analysis is based both on navigation events and on clicks, ensuring that it also works for Single Page Applications.

These usage reports can be aggregated in your SIEM / EDR and used to detect unexpected applications or unused licences.

## Privacy respecting
Citadel hashes the URL for events that do not indicate immediate threats, and are only logged for digital forensics. The different parts (hostname, path, query, etc) of the URL are hashed separately so that it remains possible to perform analysis after an incident.

The shadow-IT detection only reports on interaction with (authenticated) applications, and only tracks the number of interactions per site, per day.

The data is logged on your computer and is never sent across the network, unless of course you choose to ship the events to your SIEM.


## Installation
* [browser plugin](/doc/browser.md)
* [macOS](/doc/macos.md)
* [Windows](/doc/windows.md)
* [configuration](/doc/configuration.md)
* [integration into Wazuh](/doc/wazuh.md)


## Frequently Asked Questions

### who is Citadel meant for?
The design objective of Citadel is to allow a CISO or a CIO to secure staff laptops, increase situational awareness and allow DFIR. Theoretically end-users can decide by themselves to install the extension to benefit from the blacklist functionality, but logging won't work unless Native Messaging components are also installed ([macOS](/doc/macos.md) / [Windows](/doc/windows.md)).


### what about end-user privacy?
Citadel has privacy-preserving defaults and allows you to reinforce (or reduce) this protection using the configuration. By default:
* shadow IT detection only logs the name of the site, and the number of interactions
* shadow IT detection tries to report only on applications (i.e. websites that require authentication)
* events lower than `INFO` log level are masked (meaning only sensitive events such as downloads and alerts are not masked)
* log levels allow you to log events locally but not send them to your EDR, thus allowing post-incident analysis without having everything centrally logged
 
See the [configuration](/config.js) to understand the default settings.


### which browsers are supported?
Citadel uses the [Chrome Extensions API](https://developer.chrome.com/docs/extensions/reference/) (V3). This is theoretically compatible with Mozilla, Edge and other Chromium-based browsers. However, this has not been tested so it is unlikely to work out of the box. Also, the deployment of the Native Messaging is (slightly) different for different browsers. If you nag me I may include support for other browsers.


### what about performance?
Citadel is designed to be very efficient. It only runs (very briefly) everytime when you click on a web page. All operations are asynchronous and are designed not to impact your browsing experience. With the default blacklist configuration the extension consumes only 20 Mb of memory and will download approximately 20 Mb every hour (roughly equivalent to 5 minutes of video conferencing)
