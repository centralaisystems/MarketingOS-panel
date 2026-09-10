# Adding a new client brand

1. Scaffold + register:
   ```bash
   pnpm create-brand -- --id ACME --slug acme --name "Acme Co" --locales en,ar
   ```
2. Confirm registry entry in `brands/_shared/REGISTRY.json`.
3. Run readiness:
   ```bash
   pnpm onboard-brand -- ACME
   ```
4. Ingest evidence; promote fields via Phase 2C-style decisions — never invent VERIFIED commercial claims.
5. Keep brands isolated. Cross-brand relationships require explicit operator approval in `RELATIONSHIPS.json`.
6. Optional Wave 4b Drive folder (one URL per brand — not a full-Drive browse):
   ```bash
   pnpm create-brand -- --id ACME --slug acme --name "Acme Co" \
     --drive-folder-url https://drive.google.com/drive/folders/YOUR_FOLDER_ID
   ```
   Or set `asset_drive_folder_url` / `asset_drive_folder_id` on the registry entry. The folder must contain `brand-kit/`, `approved-stills/`, `approved-video/`, `raw-inbox/`, and `generated/`. Then:
   ```bash
   pnpm sync-brand-assets -- --brand ACME
   ```
   Fixture mode is the default. Then arrange approved stills in Figma, fill still gaps with Higgsfield only when coverage is insufficient, and assemble a video export package (fixture default — CapCut/Adobe stubs are recipes only):
   ```bash
   pnpm arrange-figma -- --brand ACME --sync
   pnpm fill-higgsfield-gaps -- --brand ACME --sync
   pnpm produce-video -- --brand ACME --sync
   ```
   See [`ASSET_PIPELINE.md`](./ASSET_PIPELINE.md).
7. Optional owner review (templated Resend / dry-run outbox). Villa Glory uses a fixture `@example.test` address. See [`OWNER_REVIEW.md`](./OWNER_REVIEW.md):
   ```bash
   pnpm create-brand -- --id ACME --slug acme --name "Acme Co" \
     --owner-email owner@example.test --enable-owner-email --enable-automation
   ```
   `create-brand` always writes `owner_email_enabled` and `automation_enabled` (both default `false` unless the enable flags are passed). `automation_enabled` is the Wave 8 digest kill switch. Emailing still requires `owner_email_enabled`. See [`AUTOMATION.md`](./AUTOMATION.md).

   All four committed registries keep **fixture** Drive folders (`fixture-villa-glory-root`, `fixture-lotin-root`, `fixture-nox-form-root`, `fixture-nox-tech-root`). Attach a real folder without committing secrets:

   1. Copy `brands/_shared/REGISTRY.local.json.example` → `brands/_shared/REGISTRY.local.json` (gitignored) and set `asset_drive_folder_url` / `asset_drive_folder_id` on the brand patch only.
   2. Or set `MOS_DRIVE_FOLDER_URL_<BRAND_ID>` / `MOS_DRIVE_FOLDER_ID_<BRAND_ID>` in `.env.local` (example: `MOS_DRIVE_FOLDER_URL_VILLA_GLORY`, `MOS_DRIVE_FOLDER_URL_LOTIN`, `MOS_DRIVE_FOLDER_URL_NOX_FORM`, `MOS_DRIVE_FOLDER_URL_NOX_TECH`).
   3. For `MOS_DRIVE_SOURCE=google_drive`, prefer `MOS_DRIVE_SERVICE_ACCOUNT_JSON` (Railway secret) or `MOS_DRIVE_SERVICE_ACCOUNT_FILE` (local). Share the folder with the SA `client_email` as Viewer. `MOS_DRIVE_ACCESS_TOKEN` is a short-lived local fallback only.

   LOTIN, NOX FORM, and NOX TECH owner review / Wave 8 automation stay **off** in the committed registry (no real inbox). To opt in locally or in tests, patch `REGISTRY.local.json` with `@example.test` addresses (see `REGISTRY.local.json.example`):

   ```json
   {
     "brand_id": "NOX_FORM",
     "owner_email": "nox-form-owner@example.test",
     "owner_cc": ["nox-form-cc@example.test"],
     "owner_email_enabled": true,
     "automation_enabled": true
   }
   ```

   Then `pnpm run-digest -- --brand NOX_FORM --period daily` dry-runs like Villa Glory. Same overlay pattern for LOTIN and NOX TECH. Do not commit a production owner address.

   **Multi-brand parity:** Villa Glory is the full fixture operator path. LOTIN, NOX FORM, and NOX TECH share the thinner path: committed fixture Drive → `pnpm sync-brand-assets` → Wave 2 packs from VERIFIED `extractPackDraftSignals` fields only → digest dry-run via local overlay. Live publish/ads stay false. NOX TECH packs must not treat rejected seed modules or ROI strings as VERIFIED commercial claims.

   Day-1 operator path for the four fixture brands: [`OPERATOR_RUNBOOK.md`](./OPERATOR_RUNBOOK.md). All-brands fixture smoke (ACTIVE registry list): `pnpm smoke:brands`.

   See [`PRODUCTION.md`](./PRODUCTION.md).

## Operator panel (Wave 3–4 usable thin UI)

Day-1 steps (switch brand, pack, owner review, digest, blocked live paths): [`OPERATOR_RUNBOOK.md`](./OPERATOR_RUNBOOK.md).

The panel is a **dedicated Marketing OS app** (`pnpm panel` → http://127.0.0.1:8787). It is not embedded in NOX TECH admin.

It reads the registry for the brand switcher, then loads **only** the active `brand_id` for the executive dashboard (Today / Campaigns / Approvals / Leads / Analytics / Costs), readiness, drafts, inbox, audit, asset metadata, Drive sync status, Figma arrange jobs, Higgsfield fill-gap jobs, video export packages, analytics snapshots, AI search visibility, and automation digests. Cross-brand query/body mismatches return `403 CROSS_BRAND_DENIED`; another brand's campaign/asset id returns `404`.

Local/CI persistence is the file/memory ops store (`data/ops/store.json` by default). `MOS_OPS_STORE=file|memory|supabase` (`MOS_OPS_BACKEND` still accepted). Supabase is optional: apply `supabase/migrations/` and set `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`. `pnpm test` must stay on file/memory. See [`PRODUCTION.md`](./PRODUCTION.md).

```bash
pnpm install
pnpm panel
# open http://127.0.0.1:8787
```

Verify (dry-run only):

```bash
curl -s http://127.0.0.1:8787/api/health
curl -s http://127.0.0.1:8787/api/brands
curl -s "http://127.0.0.1:8787/api/readiness?brand_id=VILLA_GLORY"
curl -s "http://127.0.0.1:8787/api/readiness?brand_id=LOTIN"
curl -s "http://127.0.0.1:8787/api/readiness?brand_id=NOX_FORM"
curl -s "http://127.0.0.1:8787/api/readiness?brand_id=NOX_TECH"
curl -s -X POST http://127.0.0.1:8787/api/campaign-packs \
  -H 'content-type: application/json' \
  -d '{"brand_id":"VILLA_GLORY","objective":"Draft social plan for qualified enquiries"}'
curl -s -X POST http://127.0.0.1:8787/api/campaign-packs \
  -H 'content-type: application/json' \
  -d '{"brand_id":"LOTIN","objective":"Draft a qualified-enquiry plan for UAE property consultations"}'
curl -s -X POST http://127.0.0.1:8787/api/campaign-packs \
  -H 'content-type: application/json' \
  -d '{"brand_id":"NOX_FORM","objective":"Draft a qualified project-enquiry plan for private villa interiors"}'
curl -s -X POST http://127.0.0.1:8787/api/campaign-packs \
  -H 'content-type: application/json' \
  -d '{"brand_id":"NOX_TECH","objective":"Draft a qualified discovery plan for B2B implementation conversations"}'
curl -s "http://127.0.0.1:8787/api/campaigns?brand_id=VILLA_GLORY"
curl -s "http://127.0.0.1:8787/api/approvals?brand_id=VILLA_GLORY"
curl -s "http://127.0.0.1:8787/api/audit?brand_id=VILLA_GLORY"
curl -s "http://127.0.0.1:8787/api/assets?brand_id=VILLA_GLORY&usage_tag=living-room&unused_only=true&approval_status=APPROVED"
curl -s "http://127.0.0.1:8787/api/analytics?brand_id=VILLA_GLORY"
curl -s "http://127.0.0.1:8787/api/ai-visibility?brand_id=VILLA_GLORY"
curl -s -X POST http://127.0.0.1:8787/api/drive-sync \
  -H 'content-type: application/json' -d '{"brand_id":"VILLA_GLORY"}'
curl -s "http://127.0.0.1:8787/api/drive-sync?brand_id=VILLA_GLORY"
curl -s "http://127.0.0.1:8787/api/assets?brand_id=VILLA_GLORY&source=drive"
curl -s -X POST http://127.0.0.1:8787/api/drive-sync \
  -H 'content-type: application/json' -d '{"brand_id":"LOTIN"}'
curl -s "http://127.0.0.1:8787/api/assets?brand_id=LOTIN&source=drive"
curl -s -X POST http://127.0.0.1:8787/api/drive-sync \
  -H 'content-type: application/json' -d '{"brand_id":"NOX_FORM"}'
curl -s "http://127.0.0.1:8787/api/assets?brand_id=NOX_FORM&source=drive"
curl -s -X POST http://127.0.0.1:8787/api/drive-sync \
  -H 'content-type: application/json' -d '{"brand_id":"NOX_TECH"}'
curl -s "http://127.0.0.1:8787/api/assets?brand_id=NOX_TECH&source=drive"
# Drive rows must not appear under another brand
curl -s "http://127.0.0.1:8787/api/assets?brand_id=VILLA_GLORY&source=drive"
curl -s "http://127.0.0.1:8787/api/assets?brand_id=NOX_TECH&source=drive"
curl -s -X POST http://127.0.0.1:8787/api/figma-arrange \
  -H 'content-type: application/json' \
  -d '{"brand_id":"VILLA_GLORY","source_asset_ids":["'"$STILL_ID"'"],"layout_brief":"Instagram grid from approved stills. No commercial claims."}'
curl -s "http://127.0.0.1:8787/api/figma-arrange?brand_id=VILLA_GLORY"
# LOTIN must not see Villa Glory Figma jobs
curl -s "http://127.0.0.1:8787/api/figma-arrange?brand_id=LOTIN"
curl -s -X POST http://127.0.0.1:8787/api/higgsfield-gaps \
  -H 'content-type: application/json' \
  -d '{"brand_id":"VILLA_GLORY","layout_brief":"Story still 9:16. No commercial claims."}'
curl -s "http://127.0.0.1:8787/api/higgsfield-gaps?brand_id=VILLA_GLORY"
# LOTIN must not see Villa Glory Higgsfield jobs
curl -s "http://127.0.0.1:8787/api/higgsfield-gaps?brand_id=LOTIN"
curl -s -X POST http://127.0.0.1:8787/api/video-packages \
  -H 'content-type: application/json' \
  -d '{"brand_id":"VILLA_GLORY","brief":"Reel from approved stills. No commercial claims.","target_format":"reel"}'
curl -s "http://127.0.0.1:8787/api/video-packages?brand_id=VILLA_GLORY"
# LOTIN must not see Villa Glory video packages
curl -s "http://127.0.0.1:8787/api/video-packages?brand_id=LOTIN"
curl -s -X POST http://127.0.0.1:8787/api/campaigns/$CAMPAIGN_ID/owner-review \
  -H 'content-type: application/json' -d '{"brand_id":"VILLA_GLORY"}'
curl -s "http://127.0.0.1:8787/api/email-outbox?brand_id=VILLA_GLORY"
# LOTIN must not see Villa Glory outbox
curl -s "http://127.0.0.1:8787/api/email-outbox?brand_id=LOTIN"
# Wave 5 Instagram dry-run (requires INTERNAL_APPROVED pack + APPROVED asset)
curl -s "http://127.0.0.1:8787/api/publish/calendar?brand_id=VILLA_GLORY"
curl -s -X POST http://127.0.0.1:8787/api/publish/dry-run \
  -H 'content-type: application/json' \
  -d '{"brand_id":"VILLA_GLORY","campaign_id":"'"$CAMPAIGN_ID"'","calendar_item_key":"Mon","rationale":"Dry-run schedule only"}'
curl -s "http://127.0.0.1:8787/api/publish/outbox?brand_id=VILLA_GLORY"
# LOTIN must not see Villa Glory social outbox
curl -s "http://127.0.0.1:8787/api/publish/outbox?brand_id=LOTIN"
# Live endpoints must stay 403 while live_publish_allowed is false
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://127.0.0.1:8787/api/publish \
  -H 'content-type: application/json' -d '{"brand_id":"VILLA_GLORY"}'
# Wave 6 paid staging (requires INTERNAL_APPROVED pack)
curl -s "http://127.0.0.1:8787/api/ads/recommendations?brand_id=VILLA_GLORY"
curl -s -X POST http://127.0.0.1:8787/api/ads/stage \
  -H 'content-type: application/json' \
  -d '{"brand_id":"VILLA_GLORY","campaign_id":"'"$CAMPAIGN_ID"'","platform":"META","rationale":"Stage Meta draft only"}'
curl -s "http://127.0.0.1:8787/api/ads/outbox?brand_id=VILLA_GLORY"
# LOTIN must not see Villa Glory ad outbox
curl -s "http://127.0.0.1:8787/api/ads/outbox?brand_id=LOTIN"
# Live ads must stay 403 while live_ads_allowed is false
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://127.0.0.1:8787/api/ads/launch \
  -H 'content-type: application/json' -d '{"brand_id":"VILLA_GLORY"}'
# Wave 7 CRM fixtures (optional campaign_id attributes both stub leads)
curl -s -X POST http://127.0.0.1:8787/api/leads/ingest-fixtures \
  -H 'content-type: application/json' \
  -d '{"brand_id":"VILLA_GLORY","campaign_id":"'"$CAMPAIGN_ID"'"}'
curl -s "http://127.0.0.1:8787/api/leads?brand_id=VILLA_GLORY"
curl -s "http://127.0.0.1:8787/api/leads/attribution?brand_id=VILLA_GLORY"
# LOTIN must not see Villa Glory leads
curl -s "http://127.0.0.1:8787/api/leads?brand_id=LOTIN"
# Wave 8 daily digest (dry-run outbox; Villa Glory automation_enabled)
curl -s "http://127.0.0.1:8787/api/dashboard?brand_id=VILLA_GLORY"
curl -s -X POST http://127.0.0.1:8787/api/digests \
  -H 'content-type: application/json' \
  -d '{"brand_id":"VILLA_GLORY","period":"daily"}'
curl -s "http://127.0.0.1:8787/api/digests?brand_id=VILLA_GLORY"
curl -s "http://127.0.0.1:8787/api/email-outbox?brand_id=VILLA_GLORY"
# LOTIN / NOX FORM / NOX TECH must not see Villa Glory digests
curl -s "http://127.0.0.1:8787/api/digests?brand_id=LOTIN"
curl -s "http://127.0.0.1:8787/api/digests?brand_id=NOX_FORM"
curl -s "http://127.0.0.1:8787/api/digests?brand_id=NOX_TECH"
curl -s "http://127.0.0.1:8787/api/email-outbox?brand_id=LOTIN"
```

Live publish/ads remain blocked by `reports/agency/PHASE_GATES.json` (`live_publish_allowed` / `live_ads_allowed` false), `MOS_LIVE_PUBLISH`, and `MOS_LIVE_ADS` (both default false). Wave 5 dry-run does not post to Instagram. Wave 6 staging does not spend on Meta/Google. Wave 7 CRM never puts raw email/phone in panel or agent summaries. Wave 8 digests use counts only. Never invent VERIFIED brand facts from the panel.
