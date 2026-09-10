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
   Fixture mode is the default. Then arrange approved stills in Figma (fixture default):
   ```bash
   pnpm arrange-figma -- --brand ACME --sync
   ```
   See [`ASSET_PIPELINE.md`](./ASSET_PIPELINE.md).
7. Optional owner review (templated Resend / dry-run outbox). Villa Glory uses a fixture `@example.test` address. See [`OWNER_REVIEW.md`](./OWNER_REVIEW.md):
   ```bash
   pnpm create-brand -- --id ACME --slug acme --name "Acme Co" \
     --owner-email owner@example.test --enable-owner-email
   ```

## Operator panel (Wave 3–4 usable thin UI)

The panel is a **dedicated Marketing OS app** (`pnpm panel` → http://127.0.0.1:8787). It is not embedded in NOX TECH admin.

It reads the registry for the brand switcher, then loads **only** the active `brand_id` for readiness, drafts, inbox, audit, asset metadata, Drive sync status, Figma arrange jobs, analytics snapshots, and AI search visibility. Cross-brand query/body mismatches return `403 CROSS_BRAND_DENIED`; another brand's campaign/asset id returns `404`.

Local/CI persistence is the file/memory ops store (`data/ops/store.json` by default). A live Supabase project is optional; apply `supabase/migrations/202609100001_phase4a_ops.sql` when one exists. `MOS_OPS_BACKEND=supabase` is not wired yet.

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
curl -s -X POST http://127.0.0.1:8787/api/campaign-packs \
  -H 'content-type: application/json' \
  -d '{"brand_id":"VILLA_GLORY","objective":"Draft social plan for qualified enquiries"}'
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
# LOTIN must not see Villa Glory Drive rows
curl -s "http://127.0.0.1:8787/api/assets?brand_id=LOTIN&source=drive"
curl -s -X POST http://127.0.0.1:8787/api/figma-arrange \
  -H 'content-type: application/json' \
  -d '{"brand_id":"VILLA_GLORY","source_asset_ids":["'"$STILL_ID"'"],"layout_brief":"Instagram grid from approved stills. No commercial claims."}'
curl -s "http://127.0.0.1:8787/api/figma-arrange?brand_id=VILLA_GLORY"
# LOTIN must not see Villa Glory Figma jobs
curl -s "http://127.0.0.1:8787/api/figma-arrange?brand_id=LOTIN"
curl -s -X POST http://127.0.0.1:8787/api/campaigns/$CAMPAIGN_ID/owner-review \
  -H 'content-type: application/json' -d '{"brand_id":"VILLA_GLORY"}'
curl -s "http://127.0.0.1:8787/api/email-outbox?brand_id=VILLA_GLORY"
# LOTIN must not see Villa Glory outbox
curl -s "http://127.0.0.1:8787/api/email-outbox?brand_id=LOTIN"
# Wave 4 writes and live endpoints must stay 403
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://127.0.0.1:8787/api/publish \
  -H 'content-type: application/json' -d '{"brand_id":"VILLA_GLORY"}'
```

Live publish/ads remain blocked by `reports/agency/PHASE_GATES.json` (`live_publish_allowed` / `live_ads_allowed` false). Do not enable WAVE_5+ without an explicit gate decision. Never invent VERIFIED brand facts from the panel.
