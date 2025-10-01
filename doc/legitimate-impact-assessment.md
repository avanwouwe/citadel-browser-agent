# Legitimate Interests Assessment (LIA)

> [!NOTE]  
> This LIA is a template/example. Adapt to each deployment’s data flows, policies, and local law with legal / DP expertise as required.

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
- Satisfy legal, regulatory, and contractual cybersecurity obligations

### 1.2 Expected Benefits

| Benefit | Description |
| :---- | :---- |
| Security improvement | Real-time detection and prevention of policy breaches and malware |
| Compliance enhancement | Supports compliance with normative, lawful and contractual frameworks |
| DFIR readiness | Maintains evidence needed for incident response and forensic analysis |
| Cost reduction | Identifies unused SaaS licences, reducing wasted spend |
| User safety | Detects and prevents risky user behaviour or inadvertent data leakage |

### 1.3 Third-party and Public Benefits

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
| Compliance | Inability to meet regulatory or contractual obligations |
| Operations | Greater severity / cost of incidents, more complex forensics |
| User Trust | Erosion of employee / evidence trust, post-incident damage |

### 1.6 Legal Framework Compliance

Citadel:

- Aligns with GDPR (Art. 6(1)(f)), with “legitimate interest” as basis
- Supports local data protection and logging requirements (e.g., CNIL guidelines)
- Integrates with SIEM / XDR adhering to international and local standards

### 1.7 Codes of Practice and Ethics

- Privacy by design: data minimisation and privacy-preserving defaults
- No behavioural profiling or marketing data use
- Transparency with users; monitoring is justified, documented, and proportionate

---

## 2\. Necessity Test

### 2.1 Link Between Processing and Purpose

| Purpose | Processing Activity | Necessary? |
| :---- | :---- | :---- |
| Security event detection | Log events (downloads, compliance, suspicious activity) | Yes |
| Incident response / forensics | Store endpoint/application events | Yes |
| Policy/contract enforcement | Monitor password/MFA use, block listed sites/apps | Yes |

### 2.2 Proportionality and Alternatives

| Purpose | Proportionate? | Less Intrusive Alternatives (if any) | Outcome |
| :---- | :---- | :---- | :---- |
| Security / DFIR | Yes | Omit local navigation logs | Heavily reduced usefulness for DFIR |
| Security / DFIR | Yes | Omit URL / filename in download / upload metadata | Heavily reduced usefulness for DFIR |
| Security / DFIR | Yes | Log security incidents only for protected perimeter | Heavily reduced usefulness for DFIR |

Privacy-preserving technical controls:

- Hashing URLs for non-critical / forensic events
- Local-only storage for most non-incident data

### 2.3 Data Minimisation

| Data Type | Retained? | Minimisation Steps |
| :---- | :---- | :---- |
| Navigation URLs | Yes | Hashed and stored locally |
| Download / upload metadata | Yes | Metadata (no file content); only significant |
| App / account usage stats | Yes | Only for authenticated apps, and only as daily summary |
| Passwords | No | Only local hashes and quality indicators |
| Endpoint status | Yes | Only pass / fail or aggregated control state |

---

## 3\. Balancing Test

### 3.1 Nature of Personal Data Processed

| Data Category | Description / Sensitivity | Special Category? |
| :---- | :---- | :---- |
| Identifiers | Username, application accounts | No, unless used for special (e.g. union) accounts |
| Passwords | High sensitivity, but stored locally and hashed | No |
| App usage | Number of app interactions and account, per day | No |
| Security events | Download / upload / print, browser error events | Some could be sensitive |
| Browser navigation | High sensitivity, but stored locally and hashed | No |
| Endpoint compliance | Pass / fail state, app/extension status | No |

**Special Category:** Never processed intentionally. Possible risk of accidental capture if the user visits sensitive (e.g. health, religious) sites.

### 3.2 Reasonable Expectations

| Factor | Comment |
| :---- | :---- |
| Relationship | Users are employees/agents. Monitoring is disclosed and expected in enterprise. |
| Transparency | End-users notified (“transparency statement”, deployment briefings) |
| Usage context | Security/IT monitoring is standard in managed environments |
| Collection | Data generated by device-user activity only; direct collection only |
| Innovation/novelty | Aligned with best practice, SIEM / XDR standards, and privacy by design |

### 3.3 Likely Impact on Individuals

| Impact Area | Assessment | Safeguards |
| :---- | :---- | :---- |
| Privacy | Limited; only for security/forensic uses | Data minimisation, local hashing, SIEM access controls |
| Objection / Control | Employee discomfort possible | Opt-out / configuration options, internal helpdesk process.  |
| Intrusiveness | Low: only application/security, not full browsing tracked | No content; usage only for authenticated apps |
| Misuse | Strict RBAC for SIEM / forensic data | Role-based access, limited audit trail |

**Opt-out available:**  
Yes, via configuration or organisational process in special situations.

---

## 4\. Decision and Action

| Assessment Area | Result | Comment |
| :---- | :---- | :---- |
| Legitimate Interest | Yes | Organisation, user and public protection. Compliance, risk mitigation, and required investigation. |
| Processing necessary | Yes | Less intrusive means would impair security, detection or compliance. |
| Balancing outcome | Acceptable | Minimisation, hashing, transparency, and "need to know" controls address risks. |
| Lawful basis | Art. 6(1)(f) GDPR – Legitimate Interest | Users are informed; DPIA / LIA documented and actively maintained. |

---

## 5\. Next Steps

- **Filing:** Store this LIA and review annually, or on major technical or legal change.
- **Transparency:** Summarise processing and legal basis in user privacy notices (see [statement](/doc/transparency.md)).
- **DPIA:** Complete full DPIA where required by law, risk, or scale. (see [template](/doc/privacy-impact-assessment.md))
- **Review:** Monitor for regulatory/technical updates; revise document as needed.
