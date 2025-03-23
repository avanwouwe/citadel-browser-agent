<div align="center">
  <img alt="Citadel logo" src="gui/images/logo.png" width="25%">
</div>

# Citadel browser agent
Citadel is a browser agent that detects malware and shadow IT by analyzing and logging browser security events to syslog and Windows Event Log a privacy-respecting way. It is meant to be used by CISO and CIO to secure staff laptops, increase situational awareness and allow Digital Forensics and Incident Response ([DFIR](https://en.wikipedia.org/wiki/Digital_forensics)).

Citadel comes pre-integrated with [Wazuh](https://wazuh.com/), the open source XDR. But any system that can ingest syslog lines containing JSON objects will work.

## Security event detection
Citadel detects the following events in the browser:
* IP or URL is blacklisted (configurable blacklist, good defaults provided)
* user is using unencrypted protocols for an application (e.g. FTP, HTTP or WS)
* user is using URL with username or password in the URL
* user has downloaded a file
* user has selected a file (N.B. it is unknown if the file was uploaded)
* user has opened the print dialog for a page (N.B. it is unknown if the dialog was cancelled)
* the user is warned that the downloaded file is dangerous
* user has accepted downloading of dangerous file
* user has used a password that does not conform to the password policy
* security-related network errors (e.g. certificate issues, detection of phishing or virus, etc. See [list](chrome://network-errors))

It also reports on usage statistics of applications, allowing for detection of shadow IT and unused licences.

Events and reports are written as syslog entries with a relevant level, and can then be consumed by a SIEM or EDR. Citadel comes [pre-integrated with Wazuh](/doc/wazuh.md).


## Application management
Citadel helps you identify shadow IT and unused licences. It does this by inspecting internet use (navigation, clicking, application logins). Citadel attempts to identify sites that are applications by separating authenticated and unauthenticated internet sites.

The reports are generated as security events. Two types of reports are generated:
* one event per day, per application, showing the number of interactions (triggered once per day)
* one event per application, showing the number of days the application was not used (triggered once every two weeks)

These usage reports can be aggregated in your SIEM / EDR and used to detect unexpected applications or unused licences.

## Password policy enforcement
Any time a password is sent to a web application, Citadel checks whether the password is conforming to the policy you have configured. Once every two weeks a report is triggered that generates one event for every application, for every account that has a password that does not conform to the password policy.


## Privacy respecting
Citadel hashes the URL for events that do not indicate immediate threats, and are only logged for digital forensics. The different parts (hostname, path, query, etc) of the URL are hashed separately so that it remains possible to perform analysis after an incident.

The shadow IT detection only reports on interaction with (authenticated) applications, and only tracks the number of interactions per site, per day.

The data is logged on your computer and is never sent across the network, unless of course you choose to ship the events to your SIEM.


## Installation
There are a lot of moving parts. Citadel needs to be installed in the browser, on the OS, and in your SIEM. Nevertheless installation of Citadel should be relatively easy. There are sensible defaults, and [the installer](https://github.com/avanwouwe/citadel-browser-agent/releases/latest) takes care of everything except integration into your SIEM.

* [macOS](/doc/macos.md)
* [Windows](/doc/windows.md)
* [browser plugin](/doc/browser.md)
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

### does Citadel help me with my ISO 27001 certification?
Citadel's many features cover a wide range of ISO 27001 controls. For more information, see the [dedicated page](/doc/ISO27001.md).

### what about performance?
Citadel is designed to be very efficient. It only runs (very briefly) everytime when you click on a web page. All operations are asynchronous and are designed not to impact your browsing experience. With the default blacklist configuration the extension consumes only 20 Mb of memory and will download approximately 20 Mb every hour (roughly equivalent to 5 minutes of video conferencing)

### how much security does this provide?
Citadel is mainly intended for policy enforcement, licence management and DFIR. It uses heuristics to analyze the traffic it observes, which may produce false positives or false negatives. Whilst it does offer a basic blacklisting functionality, it does not (yet) use heuristic behavioural analysis to detect unknown threat types.

For more detail see the complete [list of limitations](/doc/limitations.md).