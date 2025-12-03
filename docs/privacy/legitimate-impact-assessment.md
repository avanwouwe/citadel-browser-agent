# Legitimate Interests Assessment (LIA)

> [!NOTE] This is the Legitimate Impact Assessment performed by the developer of Citadel, as part of the development of Citadel. It can be used as a **template** to be used by a CISO / CIO during the Citadel deployment. The template should however be carefully analysed, verified for compliance, and adapted to the specifics of the organisation, for example with respect to data retention, local laws or use of external SIEM / SOAR solutions.

*Citadel Browser Agent*

Version: XX.XX  
Prepared by: \[Your Organisation Name\]  
Date completed: \[YYYY-MM-DD\]

---

## 1\. Purpose Test

### 1.1 Reason for Processing Data

Citadel processes personal and technical data in order to:

- Enable CISOs and CIOs to protect sensitive endpoints and web applications from threats
- Detect and prevent policy breaches, malware, and shadow IT
- Facilitate rapid and effective Digital Forensics and Incident Response (DFIR)
- Provide proof needed for potential legal proceedings
- Satisfy legal, regulatory, and contractual cybersecurity obligations

### 1.2 Expected Benefits

| Benefit | Description |
| :---- | :---- |
| Security improvement and Risk Reduction | Real-time detection and prevention of policy breaches and malware |
| Compliance enhancement | Enables compliance with cyber security requirements, such as IT policy enforcement, incident prevention, detection, analysis and resolution, in normative, lawful and contractual frameworks, such as [ISO 27001](https://en.wikipedia.org/wiki/ISO/IEC_27001), [SOC 2](https://en.wikipedia.org/wiki/System_and_Organization_Controls), [NIS2 and DORA](https://en.wikipedia.org/wiki/Cyber-security_regulation) |
| DFIR readiness | Maintains evidence needed for incident response and forensic analysis |
| Cost reduction | Identifies unused SaaS licences, reducing wasted spend |
| User safety | Detects and prevents risky user behaviour or inadvertent data leakage |

### 1.3 Third-party and Public Benefits

The expected benefits for third parties and the wider public:

- Organisation users / clients benefit from increased security.
- Organisation and its shareholders or stakeholders benefit from decreased risk.
- Third parties (such as incident response / forensic providers) may benefit post-incident.
- Broader reduction of data loss and harm to data subjects and the public sector.

### 1.4 Importance of the Benefits

Protecting enterprise and employee data is critical to business continuity, normative and regulatory compliance, and reputational trust. Failure to process this data would increase cyberattack exposure, risk of breaches, and legal liability.

### 1.5 Impact if Processing is Not Performed

| Area | Potential Impact |
| :---- | :---- |
| Cybersecurity | Increased threat exposure, higher risk of undetected incidents |
| Compliance | Inability to meet contractual or [regulatory obligations](https://en.wikipedia.org/wiki/Cyber-security_regulation), regarding IT policy enforcement, incident prevention, detection, analysis and resolution. |
| Operations | Greater severity / cost of incidents, more complex forensics |
| User Trust | Erosion of user / evidence trust, post-incident damage |

### 

### 1.6 Legal Framework Compliance

To the best of our knowledge, Citadel complies (or facilitates the compliance of organisations) with the following relevant legal and normative rules.

#### 1\. GDPR (General Data Protection Regulation)

- **Article 6(1)(f)** — Legitimate interest as lawful basis for processing
- **Article 25** — Data protection by design and by default
- **Article 32** — Security of processing
- **Articles 33 & 34** — Notification of personal data breaches
- **Article 5(1)(c)** — Data minimization
- **Article 5(1)(f)** — Integrity and confidentiality

#### 2\. ISO/IEC 27001:2022 (Information Security Management Systems)

- **A.5.10** — Acceptable use of information and assets
- **A.5.20** — Management of technical vulnerabilities
- **A.5.23** — Information security for use of cloud services (logging, monitoring)
- **A.5.32** — Information security event logging
- **A.8.3.1 / A.8.3.2** — Management and improvement of information security events
- **A.8.7** — Monitoring activities (user activities, security exceptions, events)

#### 3\. DORA (Digital Operational Resilience Act — Regulation (EU) 2022/2554)

- **Article 9** — ICT risk management measures (monitoring & logging)
- **Article 13** — ICT-related incident detection, handling, reporting
- **Article 15** — Classification and documentation of ICT-related incidents
- **Article 21** — Information sharing (incident evidence, logs) between entities and authorities

#### 4\. NIS2 Directive (EU Directive 2022/2555)

- **Article 18** — Handling of security incidents
- **Article 21** — Cybersecurity risk management measures, controls
- **Article 23** — Incident notification to competent authorities
- **Article 24** — Notification content/timelines, evidence preservation
- **Annex I-II** — Security requirements for essential/important entities

#### 5\. French CNIL Recommendations

- **Délibération n° 2021-122 du 14 octobre 2021**  
  *Logging of security events (journalisation) — data minimization, proportionality*

- **Draft "Web Filtering" Recommendations (July 2025\)**  
  *Web filtering transparency, proportionality, and privacy controls*

#### 6\. NIST SP 800-53 Rev. 5 (for US-based or multinational organizations)

- **AU-2** — Event Logging
- **IR-4** — Incident Handling
- **SI-4** — Information System Monitoring

### 1.7 Codes of Practice and Ethics

We consider that Citadel implements (or facilitates the implementation by organisations) of the following relevant industry guidelines and codes of practise.

- **Privacy by design**: data minimisation and privacy-preserving defaults
- **Transparency with users**; monitoring is justified, documented, and proportionate
- No behavioural profiling or marketing data use

Like all monitoring technology, Citadel poses an ethical dilemma: how to combine the need for information security with the right to privacy of the individual. At every step our design choices have been informed by the GDPR key principles of purpose limitation, storage limitation, confidentiality, and transparency.

---

## 2\. Necessity Test

### 2.1 Link Between Processing and Purpose

The data processed by Citadel helps to achieve the following purposes.

| Purpose | Processing Activity | Necessary? |
| :---- | :---- | :---- |
| Security event prevention | Raise policy infractions to IT staff | Yes, experience has shown that training alone is not enough. |
| Security event detection | Log events (downloads, compliance, suspicious activity) | Yes, the absence of early detection means increased dwell time for attackers and increased risks. |
| Incident response / forensics | Store endpoint / application events | Yes, logs are required to understand and resolve incidents. |

### 2.2 Proportionality and Alternatives

The following alternatives have been evaluated, to establish their impact on the efficacy and a proportionality has been established.


| Purpose | Less Intrusive Alternatives (if any) | Outcome | Proportionate? |
| :---- | :---- | :---- | :---- |
| Security / DFIR | Omit (hashed) local navigation logs | Inability to verify incident timelines and events. | Yes |
| Security / DFIR | Omit URL / filename in download / upload metadata | Significantly reduced usefulness for DFIR | Yes |
| Security / DFIR | Log security incidents only for protected perimeter | Significantly reduced usefulness for DFIR | Yes |

As a result the following privacy-preserving technical controls have been implemented:

- URL masking: only events related to protected systems, or that have a direct and urgent security impact (e.g. virus detected, page blocked, possible phishing) are logged un-masked
- Transparency dashboard: users can view which events are transmitted to the SIEM in real-time
- Secret masking: passwords, API keys and credit cards that are masked when they appear by accident in the log events
- Hashing URLs for non-critical / forensic events
- Local-only storage for most non-incident data

### 2.3 Data Minimisation

Additionally, the following minimisations have been identified and implemented, so as to achieve the same goal with a minimum of data that is retained.

| Data Type                                              | Retained?  | Minimisation Steps                                                                                                                                            |
|:-------------------------------------------------------|:-----------|:--------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Navigation URLs                                        | Partial    | Hashed and stored locally; only logged to server for protected systems or urgent security events                                                              |
| Browser errors / warnings                              | Partial    | Only logged for protected systems or urgent security events                                                                                                   |
| Download / upload metadata                             | Partial    | Metadata only (no file content); logged only for protected systems or urgent security events; URLs hashed for non-protected systems                           |
| App / account usage stats                              | Local only | Stored locally only to detect minimum usage threshold; never transmitted to server                                                                            |
| Passwords or other secrets (credit card, API key, etc) | No         | Only local hashes and quality indicators retained regarding passwords entered in password fields, passwords entered elsewhere by mistake are masked from logs |
| Endpoint status                                        | Yes        | Only pass / fail or aggregated control state                                                                                                                  |

---

## 3\. Balancing Test

### 3.1 Nature of Personal Data Processed

An evaluation was performed of the type of data that is processed.

| Data Category        | Description / Sensitivity                                                                                                | Special Category? |
|:---------------------|:-------------------------------------------------------------------------------------------------------------------------| :---- |
| Identifiers          | Username, application accounts                                                                                           | No, unless used for special (e.g. union) accounts |
| Passwords  & secrets | High sensitivity, hashed when stored locally when entered in a password field, masked from logs if it appears by mistake | No |
| App usage            | Local-only tracking to detect minimum usage threshold, but reports Yes / No indicator                                    | No |
| Security events      | Download / upload / print, browser error events - only for protected systems or urgent security events                   | Some could be sensitive |
| Browser navigation   | High sensitivity, stored locally and hashed                                                                              | No |
| Endpoint compliance  | Pass / fail state, app/extension status                                                                                  | No |

**The main remaining issue is the "Special Category".** This data is never processed intentionally, and extensive efforts have been made to exclude this data where possible. There remains however a residual risk of accidental capture if the user visits sensitive (e.g. health, religious) sites that are within the protected perimeter or trigger urgent security events, such as a virus, or a phishing attack.

Further analysis and measures are required if Citadel is deployed in contexts where it will process on a regular basis the personal data of children or other vulnerable people.

### 3.2 Reasonable Expectations

The expectations of data subjects have been evaluated as follows.

| Factor | Comment                                                                                                                                                          |
| :---- |:-----------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Relationship | Users are employees / agents of the organisation that is deploying Citadel. Security-related monitoring is disclosed and expected in a professional environment. |
| Transparency | End-users notified ("transparency statement", deployment briefings); real-time transparency dashboard allows users to view which events are transmitted to SIEM |
| Usage context | Security / IT monitoring is standard in managed environments                                                                                                     |
| Collection | Data generated by device-user activity only; direct collection only; masking limits collection to protected systems and urgent security events                   |
| Innovation / novelty | Aligned with best practice, SIEM / XDR standards, and privacy by design                                                                                          |

### 3.3 Likely Impact on Individuals

| Impact Area | Assessment                                                                                                                     | Safeguards                                                                                                      |
| :---- |:-------------------------------------------------------------------------------------------------------------------------------|:----------------------------------------------------------------------------------------------------------------|
| Privacy | Minimal; URL masking ensures only security-relevant data for protected systems or critical security events is logged           | Data minimisation, transparency dashboard, local hashing, masking of URLs and secrets, SIEM access controls     |
| Objection / Control | Employee discomfort possible                                                                                                   | Opt-out / configuration options, internal helpdesk process.                                                     |
| Intrusiveness | Very low: URL masking prevents logging of non-protected systems; no content captured; masking of passwords and secrets in logs | Only protected systems monitored; usage is logged as Yes / No                                                   |
| Misuse | Strict RBAC for SIEM / forensic data                                                                                           | Role-based access, limited audit trail                                                                          |

**Opt-out available:**  
Yes, via configuration or organisational process in special situations.

---

## 4\. Decision and Action

| Assessment Area | Result | Comment                                                                                                                                              |
| :---- | :---- |:-----------------------------------------------------------------------------------------------------------------------------------------------------|
| Legitimate Interest | Yes | Organisation, user and public protection. Compliance, risk mitigation, and required investigation.                                                   |
| Processing necessary | Yes | Less intrusive means would impair security, detection or compliance.                                                                                 |
| Balancing outcome | Acceptable | Secret and URL masking mechanism, no detailed usage stats, minimisation, hashing, transparency, and "need to know" controls address risks.           |
| Lawful basis | Art. 6(1)(f) GDPR – Legitimate Interest | Users are informed; DPIA / LIA documented and actively maintained.                                                                                   |

---

## 5\. Next Steps

- **Filing:** Store this LIA and review annually, or on major technical or legal change.
- **Transparency:** Summarise processing and legal basis in user privacy notices (see [statement](http:///doc/transparency.md)).
- **DPIA:** Complete full DPIA where required by law, risk, or scale. (see [template](http:///doc/privacy-impact-assessment.md))
- **Review:** Monitor for regulatory/technical updates; revise document as needed.