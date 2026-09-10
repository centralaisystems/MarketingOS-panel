# PII and data classification policy (Phase 1)

## Classifications

| Class | Examples | Model context | Logs | Global memory |
|-------|----------|---------------|------|---------------|
| PUBLIC | Published URLs, brand display names | Allowed | Allowed | Allowed if verified |
| INTERNAL | Draft strategy, internal metrics | Allowed | Allowed | Brand scope preferred |
| CONFIDENTIAL | Unreleased offers, partner terms | Restricted | Redact | Forbidden |
| PII | Names, phones, emails, WhatsApp IDs | **Forbidden** | **Forbidden** | **Forbidden** |

## Phase 1 / Wave 7 rules

- Do not store real lead/contact data. Villa Glory fixtures use synthetic inbound values only to prove tokenization.
- Persist opaque `pii_ref` / vault references on leads, events, and opportunities — never raw email, phone, name, or WhatsApp ids.
- Do not put PII into prompts, agent logs, audit metadata, or global memory.
- Agent-facing summaries may include `pii_ref` plus `ClassifiedField` redacted placeholders (`value_present`, no values).
- Wave 8 automation digests and the executive dashboard use lead **counts** only. Do not copy raw email/phone into digest payload, copy, audit metadata, or dashboard JSON.
- `EXPORT_PII` capability is denied to all Phase 1 agents.
