# Wave 7 — CRM leads + attribution (PII isolation)

Villa Glory first. Form and WhatsApp adapters are **stubs**: they accept an inbound fixture payload, seal contact fields in a process-local vault, and persist only an opaque `pii_ref` plus campaign / UTM attribution.

## Gates

| Control | This PR |
|---------|---------|
| `WAVE_7_CRM` | Enabled |
| `live_publish_allowed` | **false** |
| `live_ads_allowed` | **false** |
| Real WhatsApp / form webhooks | Not implemented |
| Real customer PII in CI | Forbidden |

Do not put raw email, phone, name, or WhatsApp ids into prompts, agent logs, audit metadata, or global memory. Operators see `pii_ref` and campaign join data only.

## Ingest → attribute

1. Build a campaign pack for the active `brand_id` (optional but required for a campaign join).
2. Panel **Load Villa Glory fixtures** (`POST /api/leads/ingest-fixtures`) with optional `campaign_id`.
3. Form stub + WhatsApp stub tokenize inbound contact fields (`vault:vg_form_enquiry_01`, `vault:vg_whatsapp_enquiry_01`).
4. Ops store writes `leads`, `lead_events`, optional `opportunities`, a PII-safe A12 agent run, and audit `LEAD_INGESTED` / `LEAD_ATTRIBUTED`.
5. `GET /api/leads` and `GET /api/leads/attribution` join leads to campaigns for that brand only.

LOTIN cannot list or attribute Villa Glory leads. Ingesting fixtures for any brand other than Villa Glory returns 400.

## Isolation

Every lead, event, and opportunity carries `brand_id`. The sealed vault is not part of the file/memory ops snapshot. Agent-facing summaries use `AgentLeadSummary` (`pii_ref` + redacted classification placeholders only).

## Out of scope

Live WhatsApp/form webhooks with real customer data, enabling live ads/publish. Scheduled digests are Wave 8 — see [`AUTOMATION.md`](./AUTOMATION.md).
