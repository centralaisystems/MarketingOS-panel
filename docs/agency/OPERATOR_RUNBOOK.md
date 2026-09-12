# Operator runbook (day 1)

Fixture / dry-run path now that **LOTIN**, **Villa Glory**, **NOX FORM**, and **NOX TECH** share Drive + pack parity. This is not a live publishing or ads system.

**Do not invent VERIFIED commercial claims. Do not enable live publish or live ads from this runbook.**

All-brands fixture smoke (Drive sync + short campaign pack, exit non-zero on failure):

```bash
pnpm smoke:brands
```

## 1. Start the panel

```bash
pnpm install
pnpm panel
# http://127.0.0.1:8787
```

Health must show live flags off:

```bash
curl -s http://127.0.0.1:8787/health
curl -s http://127.0.0.1:8787/api/health
```

Expect `ok: true`, `live_publish_allowed: false`, `live_ads_allowed: false`. Host / store details: [`PRODUCTION.md`](./PRODUCTION.md).

## 2. Switch brands

Use the sidebar **Active brand** select. Day-1 nav is Dashboard, Campaigns, Approvals, Owner review, and Assets. Studio / Publish / Leads / Insights / Automation sit under a collapsed **Advanced** group. The panel loads **only** that `brand_id`. Cross-brand query/body mismatches return `403 CROSS_BRAND_DENIED`.

CLI equivalent: pass `--brand <BRAND_ID>` on each command. Never load another brand's pack into the same task.

## 3. Build a campaign pack

Panel: paste a short objective (no invented prices, awards, ROI, or partner claims) → **Build campaign pack**.

CLI:

```bash
pnpm build-campaign-pack -- --brand VILLA_GLORY --objective "Draft a short qualified-enquiry plan. No commercial claims."
pnpm build-campaign-pack -- --brand LOTIN --objective "Draft a short qualified-enquiry plan. No commercial claims."
pnpm build-campaign-pack -- --brand NOX_FORM --objective "Draft a short qualified-enquiry plan. No commercial claims."
pnpm build-campaign-pack -- --brand NOX_TECH --objective "Draft a short qualified-enquiry plan. No commercial claims."
```

Packs are Level 1 internal drafts. Brand Guardian must pass. `live_publish` / `live_ads` on the pack stay `false`. Drafts may cite only VERIFIED pack fields; everything else stays UNVERIFIED / MISSING.

Optional fixture Drive ingest before creative work:

```bash
pnpm sync-brand-assets -- --brand VILLA_GLORY
# same for LOTIN, NOX_FORM, NOX_TECH — fixture source is the default
```

## 4. Owner review (dry-run)

Templated mail only. `MOS_EMAIL_MODE` defaults to `dry_run` (outbox + audit, no Resend call).

| Brand | Committed registry | Day-1 action |
|-------|--------------------|--------------|
| Villa Glory | `owner_email_enabled` + `@example.test` on | Campaigns → **Send for owner review** |
| LOTIN / NOX FORM / NOX TECH | owner email **off** | Overlay first (below), then the same button |

```bash
curl -s -X POST http://127.0.0.1:8787/api/campaigns/$CAMPAIGN_ID/owner-review \
  -H 'content-type: application/json' \
  -d '{"brand_id":"VILLA_GLORY"}'
curl -s "http://127.0.0.1:8787/api/email-outbox?brand_id=VILLA_GLORY"
```

Owner page: `http://127.0.0.1:8787/owner-review?token=…` → Approve or Request changes + note. See [`OWNER_REVIEW.md`](./OWNER_REVIEW.md).

## 5. Digest

Wave 8 Today digest is counts only (no raw email/phone). Kill switch: registry `automation_enabled`. Emailing also needs `owner_email_enabled`.

Villa Glory is on in git. The other three stay off until a local overlay.

Panel: **Owner review** → Send progress digest / Run daily digest / Run weekly digest.

```bash
pnpm run-digest -- --brand VILLA_GLORY --period daily
```

A brand with `automation_enabled=false` records `DIGEST_BLOCKED` and does not write the email outbox. See [`AUTOMATION.md`](./AUTOMATION.md).

## What stays blocked

| Action | Status |
|--------|--------|
| Live Instagram / social fire (`POST /api/publish`) | **403** while `live_publish_allowed` is false |
| Live Meta / Google spend (`POST /api/ads/launch`) | **403** while `live_ads_allowed` is false |
| Wave 5 / Wave 6 | Outbox + audit only (dry-run / staging) |
| Customer contact, production website edits, budget changes | Not allowed |
| `MOS_EMAIL_MODE` | `dry_run` unless you intentionally set Resend locally |
| Inventing VERIFIED facts from fixtures or the panel | Not allowed |

`reports/agency/PHASE_GATES.json` must keep `live_publish_allowed` and `live_ads_allowed` **false**. `MOS_LIVE_PUBLISH` / `MOS_LIVE_ADS` default false.

## Attach a real Drive folder (no secrets in git)

Committed registry keeps fixture folder ids (`fixture-villa-glory-root`, `fixture-lotin-root`, `fixture-nox-form-root`, `fixture-nox-tech-root`) and the Villa Glory fixture `@example.test` owner inbox. Do not commit tokens, live folder ids, or production inboxes.

1. Copy `brands/_shared/REGISTRY.local.json.example` → `brands/_shared/REGISTRY.local.json` (gitignored via `*.local.json`).
2. Patch only the brand you are attaching: `asset_drive_folder_url` / `asset_drive_folder_id`, and optionally `owner_email` / `owner_cc`.
3. On Railway (no gitignored file), set `MOS_REGISTRY_LOCAL_JSON` to that same JSON shape, or the per-brand vars `MOS_OWNER_EMAIL_<BRAND_ID>`, `MOS_OWNER_CC_<BRAND_ID>` (comma-separated), `MOS_DRIVE_FOLDER_URL_<BRAND_ID>` / `MOS_DRIVE_FOLDER_ID_<BRAND_ID>`. Env wins over the local file. `/api/brands` then shows the overlay, not the fixture ids.
4. For live listing (`MOS_DRIVE_SOURCE=google_drive`): Railway should set `MOS_DRIVE_SERVICE_ACCOUNT_JSON` to the full GCP SA JSON secret and share the folder with that `client_email` as Viewer. Locally use `MOS_DRIVE_SERVICE_ACCOUNT_FILE` or a short-lived `MOS_DRIVE_ACCESS_TOKEN`. Do not commit the JSON. This does not unlock live publish or ads.

The folder must contain `brand-kit/`, `approved-stills/`, `approved-video/`, `raw-inbox/`, `generated/`. See [`ASSET_PIPELINE.md`](./ASSET_PIPELINE.md).

LOTIN / NOX FORM / NOX TECH owner review and Wave 8 automation stay **off** in git. To dry-run locally, patch `REGISTRY.local.json` (or `MOS_REGISTRY_LOCAL_JSON`) with `@example.test` addresses from the example overlay — never a production inbox.

## Request live unlock later

Live Instagram / Meta / Google spend is **out of scope** here. Unlock later requires all of:

1. Explicit human approval
2. `live_publish_allowed` / `live_ads_allowed` flipped in `PHASE_GATES.json`
3. Matching `MOS_LIVE_*` env
4. Level 2 (publish) / Level 3 (ads) APPROVED rows

Until then, treat any 403 on `/api/publish` and `/api/ads/launch` as correct. New client brands: [`ADD_BRAND.md`](./ADD_BRAND.md). Host / env: [`PRODUCTION.md`](./PRODUCTION.md).
