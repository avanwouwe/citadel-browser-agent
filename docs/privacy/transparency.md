---
layout: default
title: Transparency
parent: Privacy & Compliance
nav_order: 4
---

# Data Protection Transparency
Citadel aims to strike a fair balance between security and privacy, and to maintain a posture of transparency towards end-users, in order to gain and maintain their confidence. This page gives an overview of the data processed by Citadel, and is designed to be able to be used as a Data Protection Impact Assessment.

Citadel is highly configurable. The following statements assume a default installation of Citadel and an application of the best practises outlined in this document.

## Purpose
The objective of Citadel is to allow a CISO or CIO to protect a set of sensitive web applications from cybersecurity threats, and to respond to legal, contractual and normative obligations. It does this by responding to various IT security related stakes distributed over the Security Incident Lifecycle:
* [Prevention] control efficacy : ensure that defined security controls (human, technical, organisational) are operating as designed
* [Detection] [situational awareness](https://en.wikipedia.org/wiki/Situation_awareness) : being aware of general network patterns, and possible deviations
* [Detection] incident detection : alert the Security Operations Center (SOC) of potential imminent threats
* [Response] [Digital Forensics and Incident Response (DFIR)](https://en.wikipedia.org/wiki/Digital_forensics) : investigation, examination, and analysis after cyber incidents

## Data Processing Overview
By design, Citadel lives in the browser, so that it can have access to the information that it needs to fulfill it's mission. On top of that, a local agent runs outside of the browser sandbox, in order to be able to query device status and log security events.

| information                         | example of reporting                                                                                          | treatment        | reason                                                       | scope                                                                                  |
|--------------------------------------|---------------------------------------------------------------------------------------------------------------|------------------|--------------------------------------------------------------|----------------------------------------------------------------------------------------|
| **END-USER**                        | ---                                                                                                           | ---              | ---                                                          | ---                                                                                    |
| endpoint username                    | `j.smith`                                                                                                     | stored           | control efficacy, incident response                          |                                                                                        |
| browser profile username             | `j.smith@company.com`                                                                                         | stored           | control efficacy, incident response                          |                                                                                        |
| **USAGE**                            | ---                                                                                                           | ---              | ---                                                          | ---                                                                                    |
| web application use                  | `'teams.microsoft.com' received 14 interactions on 2025-09-18`                                                | stored           | control efficacy, situational awareness                      | only websites with authentication are tracked                                          |
| application usernames                | `password for account 'j.smith@company.com' of 'login.microsoftonline.com' has 2 issues`                      | stored           | control efficacy, situational awareness                      | only accounts of protected applications are tracked                                    |
| application passwords                | N/A                                                                                                           | processed        | control efficacy, situational awareness                      | only hash and quality metadata is stored, only locally, and only of protected accounts |
| metadata about downloading           | `completed download of 'https://drive.com/SDjchTVAfbjAQXPxoY' to '/Users/j.smith/Downloads/budget 2025.docx'` | stored           | situational awareness, incident response                     | includes url, file size, path and type                                                 |
| metadata about uploading / printing  | `user selected file "Business case feedback.png"`                                                             | stored           | situational awareness, incident response                     | includes file size, path and mtime                                                     |
| security events                      | `browser error net::ERR_CERT_DATE_INVALID [WARN] for navigate to https://login.application.com/login`         | stored           | incident detection, situational awareness, incident response |                                                                                        |
| web navigations                      | `navigation to https://a7436388/b24b8947?f23b6e6b`                                                            | stored (locally) | incident response                                            | heavily hashed, only stored on endpoint                                                |
| web requests                         | N/A                                                                                                           | processed        | all                                                          | used for MFA- and blacklist detection                                                  |
| **ENDPOINT**                         | ---                                                                                                           | ---              | ---                                                          | ---                                                                                    |
| IP address                           | `185.34.22.17`                                                                                                | stored           | situational awareness                                        |                                                                                        |
| installed extensions                 | `installed extension 'laankejkbhbdhmipfmgcngd' (Grammarly) with risk 4.9`                                     | stored           | incident detection, situational awareness, incident response |                                                                                        |
| compliance status                    | `control ForbiddenApplications = PASSING`                                                                     | stored           | control efficacy, incident response                          |                                                                                        |
| security configuration               | N/A                                                                                                           | processed        | control efficacy                                             | only control state is stored (see above)                                               |
| installed & running applications     | N/A                                                                                                           | processed        | control efficacy                                             | only control state is stored (see above)                                               |
| stored documents                     | N/A                                                                                                           | processed        | control efficacy                                             | only control state is stored (see above)                                               |
| camera                               | N/A                                                                                                           | N/A              | N/A                                                          |                                                                                        |
| microphone                           | N/A                                                                                                           | N/A              | N/A                                                          |                                                                                        |

## Data Storage
In order to reduce attack surface and deployment cost, Citadel has no central server. The browser agent stores information, such as historical application use and device- or account status, in the local browser storage, but never on a central server. It does however report security events that are meant to be shipped to the SIEM / XDR, and that are thus covered by the existing authorization, security and retention policies that govern the SIEM / XDR.

## Necessity, Risks & Proportionality
Citadel requires the above data processing in order to fulfill its objectives of prevention, detection and response, and considers that those objectives constitute "legitimate interest", as per the GDPR.

Whenever possible, data minimisation is used to ensure that only the information strictly necessary is stored. Specifically:
* **web navigation** : only hashed versions of URLs are stored, and only locally on the endpoint, to allow post-incident confirmation that a previously identified site was visited
* **download / upload meta-data & security events** : given the increased risk potential, all downloads are reported and URLs and filenames are not hashed
* **web application use** : only sites with authentication mechanisms are reported (since they represent a risk of shadow IT) and only at a high level (number of interactions per day) in order to prevent function creep
* **device control status** : only the control status is reported, not the detail of which process or which file caused issues
* **account security** : only insecure accounts are reported, in a high-level manner, and only for protected web application *and* when using internal accounts

Since malware and Data Loss risks are not restricted to one profile or one browser, IT policies apply to endpoints and not browser policies. Citadel is expected to be run on all browsers, and all profiles installed on an endpoint, including those used for personal use.

Most of the risks created by the storage of the security events should be covered by existing security measures implemented for the SIEM / XDR, such as IAM, data retention and encryption policies and controls. However, in spite of the extensive Data Limitation measures, some of the security events generated by Citadel remain potentially sensitive in nature. For example, if end-users visit websites related to religion, ethnicity, or sexual orientation, these may accidentally be included in the reporting of sensitive operations such as uploads or downloads files, or in the reporting about daily interactions (since if the sites use authentication it is considered an application). So far no credible Data Limitation solution has been identified that would not significantly reduce the security guarantees provided by Citadel, but suggestions can be created submitted as a bugreport.

As a result, supplementary access restrictions should be considered to ensure that Citadel security events are only accessible by staff on a strict Need to Know basis. If possible, a data access audit trail should be kept, and regularly checked.

## Deployment Checklist
Given the above, ensure that the following points have been covered during your deployment.

|   | Action                                                                                                                                               |
|:-:|------------------------------------------------------------------------------------------------------------------------------------------------------|
| ☐ | "Security policy verifications & web security event logging" has been added to the Record Of Processing Activities (ROPA)                            |
| ☐ | An authorisation and retention policy has been defined regarding the generated security events                                                       |
| ☐ | End-users have been notified of the use of Citadel (and this is documented)                                                                          |
| ☐ | End-users have been informed of their right to be informed, to access, to rectify, and to erase the data that concerns them (and this is documented) |
| ☐ | Deviations from the default configuration and best practices have been documented                                                                    |