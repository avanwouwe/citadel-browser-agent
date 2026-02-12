---
layout: default
title: Logging & Reporting
parent: Configuration
nav_order: 2
---

# reporting
Citadel can report on various aspects, such as application use and password policy adherence. By default, the reporting is configured to report only on authenticated applications. To prevent overloading the SIEM, the reporting only reports on the most important applications (i.e. the most visited or the ones with the most password issues).

```
    ...
    "reporting": {
        "maxApplicationEntries": 500,
        "maxAccountEntries": 500,
        "onlyAuthenticated": true
    }
    ...
```

The bi-weekly frequency of some reports has been chosen so that in your SIEM you can select "show last two weeks" and you will generally have exactly one event for every endpoint (actually, every browser / profile combination). Two weeks is long enough to (almost) still cover endpoints that are turned off during holidays, but short enough for the information to remain relevant. Any endpoints that have never been turned on during that period will not appear in the reporting.

# errors
Citadel reports when certain security-sensitive errors are raised by the browser (see [chrome://network-errors](chrome://network-errors) for a list of all browser errors). This can be for example a user ignoring a virus warning, or issues with certificates. You can override the default event level of each error type, should the default levels not work out for your specific environment.

For example, you can lower the level of certificate issues to `DEBUG`, so that they are still logged locally but not shipped to the SIEM. Or you can manually configure an extreme logging level for an error that is not detected by default, such as `ERR_ACCESS_DENIED`. To disable logging completely use the `NEVER` level:

```
    ...
    "errors": {
        "exceptions": {
            "net::ERR_CERT_AUTHORITY_INVALID"   : "NEVER",
            "net::ERR_CERT_COMMON_NAME_INVALID" : "DEBUG",
            "net::ERR_CERT_DATE_INVALID"        : "DEBUG",
            "net::ERR_ACCESS_DENIED"            : "ERROR"
        }
    }
    ...
```

# logging
The default logging settings are:
```
    ...
    "logging": {
        "reportFailure": true,
        "logLevel": 'DEBUG',
        "shipLevel": 'INFO',
        "consoleLevel": 'WARN',
        "maskUrlLevel": 'WARN',
        "maxUrlLength": 500
    }
    ...
```
* `failurePopup` : should end-users be notified if logging is broken? (so they can warn you)
* `logLevel` : from which level onward should events be entered in the system log
* `shipLevel` : from which level onward will events be shipped to the SIEM (align this with your SIEM integration)
* `consoleLevel` : from which level onward should events be entered in the developer console log of the extension
* `maskUrlLevel` : up to which level onward should events be masked (i.e. this level is *not* masked)
* `maxUrlLength` : truncate URLs to which length (to prevent filling the logs too quickly)

When specifying the logging level you can use the following log levels:
* `TRACE` : low level events that are not necessarily user actions, for example `webRequest`. Not enabled by default
* `DEBUG` : standard user actions, for example `webNavigation`. Events could be useful for DFIR, but are too frequent and too sensitive for a SIEM and should not be shipped
* `INFO` : standard user actions with potential security implications, such as `onDownload`. Also used for reporting events.
* `WARN` : potentially risky user actions with, such as unencrypted requests or invalid certificates. Should be used to perform a periodic aggregated review to build situational awareness.
* `ERROR` : clearly malicious activity or otherwise potentially risky events that require immediate awareness of your SOC team, such as visiting a blacklisted URL or ignoring a virus warning

The special log level `NEVER` is used to disable logging.

# URL masking
In order to minimize the amount of personal data, Citadel masks URLs of events unless the information is strictly necessary:
* if the host is part of the protected scope
* if the event is of `maskUrlevel` or higher (by default set to `WARN`)
* if the host has been explicitly been exempted from masking (by placing it in the `domain.unhash` list)

When masking the URL the hostname, username, pathname, hash and search components of the URL are separately hashed. This allows SOC analysis some level of understanding of a click-stream, without unduly exposing sensitive personal information.

If present, the password component is always masked.

# log rate throttling
Citadel performs rate throttling on logging to ensure that one issue does not overwhelm the storage of the local machine or your SIEM. Throttling is triggered if more than the specified number of events arrive within a `windowDuration` minutes, and on a per-level basis. Throttling stopped if no more events arrive during the window.

If throttling is triggered, warnings are issued at the level just above the original level. One warning is raised at the start of throttling, and periodic warnings are raised every `reportFrequency` to report on the number of lost events.

```
    ...
    "logging": {
        "throttle": {
            "windowDuration": 10,
            "reportFrequency": 60,
            "rates": {
                "TRACE": 1000,
                "DEBUG": 100,
                "INFO": 50,
                "WARN": 50,
                "ERROR": 10,
                "ALERT": 10
            }
        }
   }
   ...
```
