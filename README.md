<div align="center">
  <img alt="Citadel logo" src="gui/images/logo.png" width="25%">
</div>

# Citadel browser agent
Citadel is a browser agent that enforces IT policy and detects malware and shadow IT by analyzing and logging browser security events to syslog and Windows Event Log a privacy-respecting way. It is meant to be used by CISO and CIO to secure staff laptops, increase situational awareness and allow Digital Forensics and Incident Response ([DFIR](https://en.wikipedia.org/wiki/Digital_forensics)).

Citadel comes pre-integrated with [Wazuh](https://wazuh.com/), the open source XDR. But any system that can ingest syslog lines containing JSON objects will work.

<table>
  <tr>
    <td><img src="/doc/screenshot wazuh.png" alt="screenshot Wazuh"></td>
    <td><img src="/doc/screenshot-mfa-blocked.png" alt="screenshot MFA blocking"></td>
  </tr>
</table>

## Overview
In today's cybersecurity landscape it is difficult to have good control over your endpoints and their use. You need a solution to ensure endpoint compliance, but most of those do not manage the browser. And it is difficult to get a full-blown MDM installed on endpoints that are not provided by your organisation, such as in the case of employee BYOD, or of external staff. Many applications do not allow you to configure a password policy, and if they do provide security controls such as "MFA must be enabled", it is only as part of an "Enterprise" licence. So you have to select, integrate and maintain several solutions, each one costing a couple of dollars per endpoint.

Out of this dissatisfaction, and the realisation that for many organisations the browser constitutes today's operating system, Citadel was born.

Citadel has a native component that ensures device compliance by monitoring the usual controls (patching, disk encryption, firewall, etc) and even a few more unusual ones (protection of SSH keys, requiring or prohibiting of installed or running software, storage of unnecessary sensitive data, etc). It also has a browser component that performs web filtering, enforces your password and MFA policies, and limits the maximum duration of authenticated sessions.

In case of non-compliance users are notified and access to protected systems can be temporarily disabled until the controls are compliant. To prevent users being blocked at a critical moment it is possible to give the possibility to request exceptions. 

On top of this, Citadel detects the following events in the browser:
* IP, URL or domain is blacklisted (good default blacklists provided, can be made bypassable by users)
* user is using unencrypted protocols for an application (e.g. FTP, HTTP or WS)
* user has downloaded a file
* the user is warned that the downloaded file is dangerous
* user has accepted downloading of a dangerous file
* user has selected a file on the local drive (N.B. it is unknown if the file was uploaded)
* user has opened the print dialog for a page (N.B. it is unknown if the dialog was cancelled)
* security-related browser errors (e.g. certificate issues, detection of phishing or virus, etc. See [list](chrome://network-errors))
* user is using URL with username or password in the URL

Citadel also reports on usage statistics of applications, allowing for detection of shadow IT and unused licences.

Events and reports are written as syslog entries with a relevant level, and can then be consumed by a SIEM or EDR. Citadel comes [pre-integrated with Wazuh](/doc/wazuh.md).

## Blacklists
Can blacklist URLs, IP ranges or domains, using lists periodically downloaded from the internet. By default, users can request an exception if they are blocked by a blacklist. They are then asked to provide a reason for the exception, after which they can then temporarily bypass the blacklist for that hostname. The exception request is logged, as are the navigation and web requests that use the exception.

It is possible to define a whitelist that will override the blacklist.

## Application management
Citadel helps you identify shadow IT and unused licences. It does this by inspecting internet use (navigation, clicking, application logins). Citadel attempts to identify sites that are "applications" by separating authenticated and unauthenticated internet sites.

The reports are generated as security events. Two types of reports are generated:
* one event per day, per application, showing the number of interactions (triggered once per day)
* one event per application (triggered once every two weeks)
  * showing the number of days the application was not used
  * and the accounts used for that application, if they are not conforming to security policies (password quality, etc)

These usage reports can be aggregated in your SIEM / EDR and used to get an overview of policy adherence or unused licences.

## Password policy enforcement
Any time a password is sent to a web application via a form, Citadel checks whether the password conforms to the policy you have configured. 

When users connect to systems that are part of the protected scope, Citadel hashes and stores the password. This list of hashes is used to detect re-use of passwords when connecting to any system, even non-protected ones.

Once every two weeks a report is triggered that generates one event for every application, for every account that has a password that does not conform to the password policy.

## MFA policy enforcement
Citadel can check if MFA is used after a password is sent to a web application via a form. The idea being that generally non-password based authentication such as delegated authentication (OIDC, SAML, etc) will require MFA anyway, and does not need to be checked. Detection of the MFA is based on various heuristics, such as the name of form fields, the structure of URLs and the content of the fields. Use of the `navigator.credentials` API to request for example use of WebAuthn or FIDO is detected.

If a password is observed, users are allowed a couple of minutes to use or configure MFA. Failing that they are disconnected from the application, and instructed to configure MFA. For urgent and exceptional cases they can request a temporary exception. Both events are logged.

Sessions that are authenticated using MFA have a maximum duration. Once this duration is exceeded the user is disconnected and is this forced to re-authenticate.

Since MFA is not available for all sites, the list of sites for which MFA is required must be explicitly configured.

## Device Trust
Citadel uses [osquery](https://osquery.io/) to check the state of various controls, regarding disk encryption, screen locking, etc. Controls are defined using osquery queries, and depending on the configured severity of the control, it is possible to notify the user or block use of protected sites until the control stops failing. It is also possible to warn users before blocking them, or even to allow them to ask for (temporary) exceptions.

## Privacy respecting
Citadel hashes the URL for events that do not indicate immediate threats, and are only logged for digital forensics. The different parts (hostname, path, query, etc) of the URL are hashed separately so that it remains possible to perform analysis after an incident.

The shadow IT detection only reports on interaction with (authenticated) applications, and only tracks the number of interactions per site, per day.

The data is logged on the local machine and is never sent across the network, unless of course you choose to ship the events to your SIEM.


## Installation
There are a lot of moving parts. Citadel needs to be installed in the browser, on the OS, and in your SIEM. Nevertheless, installation of Citadel should be relatively straightforward. There are sensible defaults, and [the installer](https://github.com/avanwouwe/citadel-browser-agent/releases/latest) takes care of everything except integration into your SIEM.

* [macOS](/doc/macos.md)
* [Windows](/doc/windows.md)
* [browser plugin](/doc/browser.md)
* [configuration](/doc/configuration.md)
* [integration into Wazuh](/doc/wazuh.md)


## Frequently Asked Questions

### who is Citadel meant for?
The design objective of Citadel is to allow a CISO or a CIO to secure staff laptops, increase situational awareness and allow DFIR. Citadel does check for injection vulnerabilities but competent adversarial users or sites may be able to render compliance verifications ineffective.

### what about the privacy of my staff?
Citadel has privacy-preserving defaults and allows you to reinforce (or reduce) this protection using the configuration. By default:
* shadow IT detection only logs the name of the site, and the number of interactions (not the duration of usage)
* shadow IT detection tries to report only on applications (i.e. websites that require authentication)
* events lower than `INFO` log level are masked or hashed (meaning only sensitive events such as downloads and alerts are logged with details)
* log levels allow you to log events locally but not send them to your EDR, thus allowing post-incident analysis without having everything centrally logged

See the [configuration](/config.js) to understand the default settings.

If you have informed your staff of the fact that you are monitoring their internet use, you do not reduce the default privacy-related measures, you restrict access to the log entries, and you have listed an entry for "logging and monitoring" in your Records of Processing Activities, you are likely in compliance with the GDPR.

### which browsers are supported?
Citadel uses the [Chrome Extensions API](https://developer.chrome.com/docs/extensions/reference/) (V3) and fully supports Chrome, Mozilla, Opera, Edge and Brave. Other Chromium-based browsers may work. However, this has not been tested so it is unlikely to work out of the box. Also, the deployment of the Native Messaging is (slightly) different for different browsers. Unfortunately Safari does not support all of the Chrome API and so porting it would take considerable effort (aside from the horribly complex Apple tool chain).

### I don't want to install external software
Of course, you can inspect the source code. You can then build the installer yourself using the build scripts for [Windows](/bin/build/win/build.ps1) and [macOS](/bin/build/mac/build.sh). And you can verify that the code corresponds to the extension that is [served via the Chrome store](https://chromewebstore.google.com/detail/citadel-browser-agent/anheildjmkfdkdpgbndmpjnmkfliefga). If you don't want to risk that the extension is updated one day, you can [pin the extension version](https://support.google.com/chrome/a/answer/11190170?hl=en) (though that may not be supported by all browsers). Or you can even take the locally built plugin and [distribute that to your endpoints](https://developer.chrome.com/docs/extensions/how-to/distribute).

### what about performance?
Citadel is designed to be very efficient. It only runs (very briefly) every time when you click on a web page. All operations are asynchronous and are optimized so as to have a minimal impact on the browsing experience of the user. With the default blacklist configuration the extension consumes about 35 Mb of memory and will download approximately 20 Mb every hour. That is roughly equivalent to 5 minutes of video conferencing.

In fact, other solutions that address the same problem generally shunt all the traffic via a web proxy. This will log the traffic, but it will not cover other events, such as browser errors, password quality, use of MFA, etc. And not only does this add a Single Point of Failure to your architecture, or require more compute since all traffic has to be parsed and analyzed, but it also requires that compute to be centralized. Moreover, forcing all traffic via proxy adds significant network latency to any and all use of the Internet. By running in your user's browser and hooking into existing events, Citadel sidesteps all of these issues.

### how much security does this provide?
Citadel is mainly intended for policy enforcement, licence management and DFIR. It uses heuristics to analyze the traffic it observes, which may produce false positives or false negatives. Whilst it does offer a basic blacklisting functionality, it does not (yet) use heuristic behavioural analysis to detect unknown threat types. It reports when the browser detects malware (thus making you more aware), but it does not itself analyze the content of uploads or downloads.

For more detail see the complete [list of limitations](/doc/limitations.md).

### does Citadel help me with my ISO 27001 certification?
Citadel, when integrated with your SIEM (like [Wazuh](https://wazuh.com/)), providers many features that cover a wide range of ISO 27001 controls. For more information, see the [overview of controls](/doc/ISO27001.md).
