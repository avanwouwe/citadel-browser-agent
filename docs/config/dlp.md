---
layout: default
title: Data Loss Prevention
parent: Configuration
nav_order: 9
---

# Data Loss Prevention
Data Loss Prevention (DLP) can target both mistakes made by users (sending data to the wrong person, leaving a password in a config file) but also malicious users trying to exfiltrate secret information.

## Leaking Secrets
Users can transfer data to other sites by pasting the clipboard, or dragging / selecting files. Citadel uses [Gitleaks](https://github.com/gitleaks/gitleaks) to detect secrets, such as API keys, certificate or tokens. After the operation is performed, Citadel will warn the user of the risks, and tell them to sanitize the secrets and perform to paste, drag or select again. If possible, Citadel will propose to sanitize the clipboard for the user.

* `dlp.leaking.level` by default the events are logged as `WARN`; level `NEVER` disables the control
* `dlp.leaking.warnProtected` accidental leaking of secrets is also checked for protected domains, if set to `true`
* `dlp.leaking.rules` location of file containing secrets-matching rules, set to [Gitleaks repository](https://raw.githubusercontent.com/gitleaks/gitleaks/master/config/gitleaks.toml) by default
* `dlp.leaking.freq` frequency (in hours) that rules are refreshed

```
    "dlp": {
        "leaking": {
            "level": "WARN",
            "warnProtected": true,
            "rules": 'https://raw.githubusercontent.com/gitleaks/gitleaks/master/config/gitleaks.toml',
            "freq": 24,
        },
    }
```

In order to prevent [alert fatigue](https://en.wikipedia.org/wiki/Alarm_fatigue), it is important to exclude applications where users often legitimately upload secrets. Using the `dlp.leaking.domains` key you can include or exclude specific domains:
```
    "dlp": {
        "leaking": {
            "domains": ["-*.application.com"],
        },
    }
```
