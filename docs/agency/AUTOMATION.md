# Wave 8 — scheduled automation digests + executive dashboard

Villa Glory first. Operators run a **daily or weekly digest** from the CLI or the dedicated panel. The digest is a Today summary of counts only: campaign drafts, pending approvals, pending owner reviews, dry-run social / staged ads outbox, attributed lead counts, a Wave 4 analytics fixture stub, and a costs placeholder.

## Gates

| Control | This PR |
|---------|---------|
| `WAVE_8_AUTOMATION_DASHBOARD` | Enabled |
| `live_publish_allowed` | **false** |
| `live_ads_allowed` | **false** |
| `MOS_EMAIL_MODE` | Defaults **dry_run** (Owner Review / Resend adapter) |
| Production cron | **Not shipped** |

Do not set `live_publish_allowed` or `live_ads_allowed` to true without an explicit operator decision. Digests never publish or spend.

## Kill switch

| Flag | Where | Effect |
|------|--------|--------|
| `automation_enabled` | Registry entry (default `false`) | Per-brand kill switch. Villa Glory fixture is `true`. LOTIN / NOX FORM / NOX TECH stay `false` in the committed registry — enable with `REGISTRY.local.json` or `--enable-automation` (use `@example.test`). When false, `runAutomationDigest` records `DIGEST_BLOCKED` and **does not write email outbox**. |
| `owner_email_enabled` | Registry entry | Required **only when emailing**. Dashboard still loads. |
| `WAVE_8_AUTOMATION_DASHBOARD` | `PHASE_GATES.json` | Global wave gate. |

```bash
pnpm create-brand -- --id ACME --slug acme --name "Acme Co" \
  --owner-email owner@example.test --enable-owner-email --enable-automation
```

## Trigger (local / operator)

No production cron is installed. Same function is safe to call later from cron.

```bash
pnpm run-digest -- --brand VILLA_GLORY --period daily
pnpm run-digest -- --brand VILLA_GLORY --period weekly
# LOTIN / NOX FORM / NOX TECH are blocked until automation_enabled + owner_email_enabled
# are opted in locally via REGISTRY.local.json (@example.test)
# pnpm run-digest -- --brand LOTIN --period daily
# pnpm run-digest -- --brand NOX_FORM --period daily
# pnpm run-digest -- --brand NOX_TECH --period daily
```

Panel:

- `GET /api/dashboard?brand_id=VILLA_GLORY` — Today / Campaigns / Approvals / Leads / Analytics / Costs
- `POST /api/digests` `{ "brand_id":"VILLA_GLORY", "period":"daily" }`
- `GET /api/digests?brand_id=VILLA_GLORY`
- `GET /api/email-outbox?brand_id=VILLA_GLORY` — `AUTOMATION_DIGEST` dry-run rows

`MOS_EMAIL_MODE=dry_run` (default) writes the ops outbox + audit. `MOS_EMAIL_MODE=resend` uses the existing Owner Review Resend adapter. Live send is not required for `pnpm test`.

## PII

Digest **content** (payload, text, HTML, dashboard, digest records, audit metadata) uses lead **counts** and opaque `pii_ref` only. Raw email / phone must not appear there. The email envelope `to` / `cc` may hold the registry owner fixture address (`@example.test`) — that is the Owner Review contact, not a CRM lead.

## Isolation

Every digest record and outbox row carries `brand_id`. LOTIN / NOX FORM / NOX TECH cannot list or read Villa Glory digests or outbox rows. Building a digest never loads another brand's ops rows.

## Out of scope

Production cron infrastructure, enabling live publish/ads, NOX TECH admin embed, live GA4/ads cost ingestion.
