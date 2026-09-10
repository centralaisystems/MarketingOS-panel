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

## Operator panel (Wave 3 usable thin UI)

The panel is a **dedicated Marketing OS app** (`pnpm panel` → http://127.0.0.1:8787). It is not embedded in NOX TECH admin.

It reads the registry for the brand switcher, then loads **only** the active `brand_id` for readiness, drafts, inbox, and audit. Cross-brand query/body mismatches return `403 CROSS_BRAND_DENIED`; another brand's campaign id returns `404`.

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
# live endpoints must stay 403
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://127.0.0.1:8787/api/publish \
  -H 'content-type: application/json' -d '{"brand_id":"VILLA_GLORY"}'
```

Live publish/ads remain blocked by `reports/agency/PHASE_GATES.json` (`live_publish_allowed` / `live_ads_allowed` false). Do not enable WAVE_5+ without an explicit gate decision. Never invent VERIFIED brand facts from the panel.
