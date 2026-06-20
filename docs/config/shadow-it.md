---
layout: default
title: Shadow IT
parent: Configuration
nav_order: 7
---

# Shadow IT
Shadow IT is the use of applications, services and tools that have not been sanctioned by your organization. Even when used with good intentions, these applications represent an information security risk, because the information they handle escapes your governance. Company data can end up being stored, processed or transmitted by a third party that you have no contract with, that you cannot audit, and that may use the data to train models or that may suffer a breach. Typical examples are personal cloud storage, online document converters, public AI assistants, file transfer services and unsanctioned messaging tools.

## warn and block
Citadel detects when the browser navigates to a known shadow IT application, and can then either:
* **warn** : the user is shown a dismissable modal that explains the risk. The user can acknowledge the warning and continue, or request an exception. Acknowledging the warning is logged as a `WARN` event.
* **block** : the page is blocked and the user is told why. 

If exceptions are allowed, the user can request one by giving a reason, after which they can access the application without further warnings or blocking. The exception is logged as a time-critical security event (`ERROR`).

Applications on the `shadowit.warn` list are warned, and applications on the `shadowit.block` list are blocked.

```
    ...
    "shadowit": {
        "warn": [ "chatgpt.com", "dropbox.com" ],
        "block": [ "wetransfer.com" ]
    }
    ...
```

## sensitive logging
Shadow IT applications are considered sensitive, in the same way as the domains in `domain.sensitive`. This means that their URLs are not masked in the logs, even for events below the `maskUrlLevel`. Where a regular hostname, path and query string would be hashed to protect personal data, the URLs of shadow IT applications are logged in clear, so that your SOC can understand exactly which application was used and how. See [Logging & Reporting](/config/logging-reporting) for more on URL masking.

## your own applications
An application is only considered shadow IT if it is not one of your own. Any host listed in `company.applications` or `company.domains` is part of your protected scope, and Citadel never applies shadow IT logic to it. To stop a sanctioned application from being treated as shadow IT, simply declare it as one of your applications.

```
    ...
    "company": {
        "applications": [ "your-crm.com", "your-mdm.com" ]
    }
    ...
```

This is useful when one of the applications in the default list is in fact sanctioned in your organization. For example, if you have a company agreement for Dropbox, adding `dropbox.com` to `company.applications` stops it from being flagged.

## default applications
Citadel ships with a list of typical shadow IT applications, all configured as `warn`. These cover categories such as public AI assistants and AI coding tools, personal cloud storage and file transfer, online document processing, tunneling services, unsanctioned messaging and collaboration tools, personal email, remote access tools, and no-code application builders. The intent is to give you a useful starting point that surfaces the most common cases without blocking anyone, so that you can observe what is actually used in your organization before hardening your stance.

You can override the default list entirely by re-stating `shadowit.warn`, since it is an array. For example to disable shadow IT warnings altogether, set the value to an empty array:
```
    ...
    "shadowit": {
        "warn": []
    }
    ...
```


## hardening the stance
There are two ways to move an application, or all applications, from warning to blocking:
* add a specific application to `shadowit.block`, which blocks that one application while leaving the rest as warnings
* set `shadowit.alwaysBlock` to `true`, which blocks every application on both the `warn` and `block` lists

```
    ...
    "shadowit": {
        "alwaysBlock": true
    }
    ...
```

When you deploy Citadel, generally you start with the default warnings, review what the warnings surface in your SIEM, then either block individual applications that you do not want used, or switch to `alwaysBlock` once you are confident that everything legitimate has been declared in `company.applications`.

## exceptions and warning interval
Once a user has dismissed warnings or obtained exceptions for a specific shadow IT application, Citadel does not bother them again straight away. How long it waits depends on how the application was handled:

* `shadowit.warnInterval` controls how long after a user acknowledges a **warning** before the warning is shown again. It is stated in days and defaults to one week. This prevents a user who works in a non-authorized application all day from being interrupted on every navigation, while still reminding them periodically.
* `shadowit.exceptions.duration` controls how long a **block exception** lasts once the user has requested it. It is also stated in days and defaults to one year. Setting it to `0` disables exceptions entirely, so that a blocked application cannot be accessed at all.

```
    ...
    "shadowit": {
        "exceptions": {
            "duration": 365
        },
        "warnInterval": 7
    }
    ...
```

## identifying new applications
Citadel comes with a set of common shadow IT applications, but this list will never be complete. By aggregating application usage statistics, and reverse-sorting by the unique number of users, it is possible to identify widely used shadow IT applications specific to your organization. 

Since Citadel masks traffic that is not related to your protected scope, this means that your top N applications will include many hashed host names. By adding those hashes to `domain.unhash` you can unmask those applications, and thus ensure that they do not represent a risk.

By default Citadel hashes any URL that is not related to your protected scope. This makes identifying use of unauthorized 
