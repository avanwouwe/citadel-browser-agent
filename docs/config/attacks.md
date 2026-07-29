---
layout: default
title: Attacks
parent: Configuration
nav_order: 10
---

# Attacks
Citadel helps detect and prevent various known web-based attacks.

## Phishing
Phishing attacks are detected when users try to enter the password of one site into another site. Before submitting the password to the site, Citadel will warn the user about the possibility of a phishing attack and the risks of password reuse. For more information, see [Account Trust](/config/account-trust/).

## ClickFix
This type of attack involves convincing users to paste a command into a terminal (see [detailed explanation](/control/ClickFix)). Citadel monitors the clipboard and will warn the user when he or she has copied what seems to be a dangerous command, based on a scoring mechanism.

* `attack.clickfix.level` the log level of detected ClickFix attacks; `NEVER` disables the control
* `attack.clickfix.threshold` sensitivity of the control; values range between 0 (very sensitive) and 10 (very insensitive)

```
    "attack": {
        "clickfix": {
            "level": "ERROR",
            "threshold": 5
        },
    }
```
