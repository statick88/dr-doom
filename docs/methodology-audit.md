# Pentest methodology audit

This project uses an original, compact adaptation of workflow ideas from [statick88/pentest-methodology](https://github.com/statick88/pentest-methodology), inspected at commit [`6756367cf79bcd9f1e9afff45f70bc5437cb5123`](https://github.com/statick88/pentest-methodology/tree/6756367cf79bcd9f1e9afff45f70bc5437cb5123). The pin, rather than the repository's recent commit date, is the reviewable source boundary. The upstream repository was inspected as documentation only; its scripts were not executed and their efficacy was not tested.

## Adaptation boundary

The local guidance is original behavioral text, not an imported framework, templates, or scripts. It does not claim to fix upstream content. This matters because the upstream README indicates GPL, its API reports `NOASSERTION`, and supplied skill metadata is Apache-2.0; the license signals are ambiguous. The adaptation keeps no copied prose.

Local policy remains the enforcement layer. The methodology does not add a pentest validator, durable storage, multi-agent runtime, automatic authorization, target traffic, downloads, scanners, or execution chains.

## Versioned reference findings

These are bounded reference observations, not a claim that a standard or technique catalog remains the latest. Check the linked primary source and applicable edition when using this guidance.

| Source | Inspection finding | Local treatment |
| --- | --- | --- |
| Upstream README | Its 2025 labels map XSS/SQLi to A03, SSRF to A10, and cryptography to A02—an older category ordering. | Do not use these labels as current automatic mappings. |
| [OWASP Top 10 2025](https://top10.owasp.org/2025/) | Injection is A05; cryptographic failures A04; A02 is Security Misconfiguration; A03 is Software Supply Chain Failures; A10 is Mishandling of Exceptional Conditions. | Map only in context; category names are not equivalence claims. |
| [MITRE ATT&CK versions](https://attack.mitre.org/resources/versions/) | Upstream README cites v18; consult the linked official release history for the version applicable to your assessment. | Treat upstream technique references as potentially stale. |
| [CVSS v4 specification](https://www.first.org/cvss/v4.0/specification-document) | Upstream template is CVSS 3.1 while FIRST documents v4. | CVSS 3.1 remains usable when a customer requires it; it is not invalid. |
| [OWASP API Security Top 10 2023](https://api-security.owasp.org/editions/2023/en/0x11-t10/) | The 2023 edition remains the referenced current API Top 10. | Use the versioned source for API categorization. |
| [NIST SP 800-115](https://csrc.nist.gov/pubs/sp/800/115/final) | Published in 2008. | Use as methodology background, not as a freshness signal or source of AC/SC controls. |
| [OWASP WSTG](https://wstg.owasp.org/) | Test scenarios are versioned. | Cite the applicable scenario version when reporting. |

The source pin and versioned authorities define the reference boundary; this document does not certify ongoing currency or vulnerability validity.
