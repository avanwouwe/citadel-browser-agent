---
layout: default
title: Configuration
nav_order: 3
has_children: true
---

# Getting started
Citadel has privacy-preserving and secure [default settings](https://github.com/avanwouwe/citadel-browser-agent/blob/main/config.js), and needs very little configuration to get started. However, many of its features are highly configurable.

At the very minimum you should consider overriding:
* your company name and logo (to lend more credibility to the alerts)
* the e-mail address of your own IT department (so warnings show the support team address)
* the list of domains and netmasks that are part of your **protected scope**
* the applications authorized by your IT team

Your **protected scope** is the set of domains and netmasks that your IT policy should be applied to, and that you need to protect. It is also the scope of systems where you are justified in logging in more detail the security- or privacy-sensitive details of your users. It determines for example for a host if:
* your encryption policy must be applied
* your password policy must be applied
* non-critical security events should have their URL masked
* passwords should be hashed and stored to detect password re-use
* security-related browser warnings should be logged (see `chrome://network-errors/`)
* access should be blocked in case of non-compliance of the IT policy

The following controls and monitoring are required to protect the security of the protected scope, and are performed **even** on activity that is not directly in the protected scope:
* browser alerts that indicate imminent security threats (e.g. `ERR_FILE_VIRUS_INFECTED` or `ERR_BLOCKED_BY_ADMINISTRATOR`)
* web filtering is triggered

You can override the configurations by placing a file called `citadel-config.json` containing a JSON object in the directory where the `citadel-browser-agent` binary lives.

Example:

```
{
    "company": {
        "contact": "it-support@yourcompany.com",
        "name": "Company",
        "logo": "https://www.yourcompany.com/assets/images/company-logo.png",
        "domains": [
          "yourcompany.com",
          "yourcompany.io",
          "yourcompany.net"
        ]
        "applications": [
            "www.your-crm.com",
            "www.your-hris.com",
            "login.your-iam-solution.com
        ]
    }
}
```

> **Tip**
>
> You can encode your company logo as a URL. That way you don't have to host it somewhere, and it will show correctly even if the endpoint is temporarily not connected to internet. You can use any [online encoding tool](https://elmah.io/tools/base64-image-encoder), but be sure to use a low-res 128x128 version, to stay under 2 Kb)
{: .tip }

If you want to go further, you can define:
* your password policy (if it differs from the Citadel default)
* the applications where you require MFA
* the applications where you limit session duration
* the ability for users to request exceptions (for different rejections)

Organisations with mature and robust security systems may decide to:
* change the escalation schema in case of account- or device policy infringement
* modify or add device controls (using [osquery](https://www.osquery.io/) requests)
* adapt the extension policy