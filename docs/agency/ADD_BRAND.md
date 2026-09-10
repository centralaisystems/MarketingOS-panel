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

## Operator panel (Wave 3 thin UI)

```bash
pnpm install
pnpm panel
# open http://127.0.0.1:8787
```

Live publish/ads remain blocked by `reports/agency/PHASE_GATES.json` until you set `live_publish_allowed` / `live_ads_allowed` after explicit approval.
