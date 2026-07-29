---
layout: default
title: Privacy
parent: Configuration
nav_order: 7
---

> **Note**
> * The information on this page is presented as-is, and does not constitute legal advice.
    {: .note }

# Privacy
Deploying Citadel means processing personal data about your users, such as password metadata, account status, device compliance, browser extensions, and security events. Data protection regulations (e.g. GDPR) typically require that the organisation responsible for this processing (i.e. **you**, the company deploying Citadel — not its publisher) informs users of this processing.

Rather than asking every CISO / CIO to draft this notice from scratch, Citadel generates one automatically, based on how you have configured it. It is available to end-users as the **Privacy** tab of the dashboard.

## how it adapts
The notice is not static text: each section is built from your live configuration, so it always reflects what Citadel is actually doing on that device. For example:
* the accounts section states whether checks apply to `checkOnlyInternal` accounts only, or to all accounts, and whether they are `checkOnlyProtected`
* the retention section states the actual number of days configured in `application.retentionDays`, `account.retentionDays` and `session.maxSessionDays`
* the protected scope section lists the actual domains and applications configured in `company.domains` and `company.applications`

This means that if you change your configuration, the notice shown to users changes automatically; you do not need to maintain it separately.

## what it does *not* cover
Citadel's publisher does not operate a service, and does not receive, store, or have access to any data that Citadel produces. The notice makes this explicit, so that end-users understand that all data described stays within systems that you, the deploying organisation, operate and control.

Because of this, the notice deliberately does **not** enumerate every individual data field collected. The exact list depends on which checks you have enabled, and would clutter the notice. Instead, it links to a [page maintained by the publisher describing the data model](/privacy/transparency).

The notice states that data sent to your own security monitoring platform (if any) is retained according to that platform's own retention policy, since Citadel itself has no visibility into, or control over, that retention.

The notice also lists the rights that end-users typically have over their data (access, rectification, erasure, restriction, objection), phrased generically since the exact procedure for exercising them depends on your own internal process. The notice simply directs users to contact your organization's Data Protection Officer.

## configuration
The dashboard allows you to configure privacy-specific elements:
```
      "privacy": {
        "controller": "Legal organisation name",
        "dpo": "dpo@company.com",
        "effectiveDate": "2017-05-2",
        "lastModified": "2026-07-29",
        "authority": "CNIL (COMMISSION NATIONALE DE L’INFORMATIQUE ET DES LIBERTÉS)\n3 Place de Fontenoy - TSA 80715 - 75334 PARIS CEDEX 07\nTel: 01 53 73 22 22\n(Monday to Thursday from 9am to 6:30pm / Friday from 9am to 6pm)\nFax: 01 53 73 22 00\nPlease note! The CNIL does not receive the public and does not provide any information on site.\nIf you wish to file a complaint with the CNIL, you can fill in the online complaint form available at the following address: https://www.cnil.fr/fr/plaintes"
      }
```

* `privacy.controller` : name used for the Privacy Notification (defaults to the `company.name`)
* `privacy.dpo` : address of the DPO (defaults to `company.contact`)
* `privacy.effectiveDate` : date when notice was first published (defaults to `privacy.lastModified`)
* `privacy.lastModified` : date when notice was last modified (defaults to `privacy.effectiveDate`)
* `privacy.authority` : free text (may include basic HTML such as lists and links) identifying the supervisory authority, or authorities, competent to receive complaints. Since some organisations operate across multiple jurisdictions, this is left free-form rather than a single fixed field. If left unset, a generic reference to "your local data protection supervisory authority" is shown instead
