# Production readiness (post Waves 1–8)

Honest Node deploy of the existing operator panel. This is **not** a live publishing or ads system.

Day-1 operator path (start panel, switch brands, build pack, owner-review dry-run, digest, Drive overlay, what stays blocked): [`OPERATOR_RUNBOOK.md`](./OPERATOR_RUNBOOK.md). Fixture check for every ACTIVE registry brand: `pnpm smoke:brands`.

**Do not enable live publish or live ads without an explicit operator unlock.**

`reports/agency/PHASE_GATES.json` must keep:

- `live_publish_allowed`: **false**
- `live_ads_allowed`: **false**

`MOS_LIVE_PUBLISH` and `MOS_LIVE_ADS` default false. Wave 5 writes social outbox only. Wave 6 writes ad staging only. Wave 7 stores opaque `pii_ref`. Wave 8 emails default to `MOS_EMAIL_MODE=dry_run`.

## Env checklist

Copy `.env.example` → `.env.local`. Never commit secrets.

| Variable | Required | Notes |
|----------|----------|--------|
| `PORT` / `PANEL_PORT` | Host bind | `PORT` wins (container / PaaS). Default `8787`. |
| `HOST` / `MOS_PANEL_HOST` | Host bind | Default `0.0.0.0` for a simple host. |
| `MOS_OPS_STORE` | No | `file` (default) / `memory` / `supabase`. `MOS_OPS_BACKEND` still works. |
| `MOS_ASSETS_STORE` | No | Follows `MOS_OPS_STORE` unless set. Use `supabase` with production ops so Drive ingest survives Railway redeploy. |
| `MOS_DRIVE_BOOT_SYNC` | No | Default on when `MOS_DRIVE_SOURCE=google_drive`. Re-lists configured Drive folders on panel boot. |
| `MOS_DRIVE_BOOT_SYNC_BRANDS` | No | Default `VILLA_GLORY`. Comma list or `all`. |
| `MOS_OPS_DIR` | If `file` | Default `data/ops`. |
| `SUPABASE_URL` | If `supabase` | Project URL only. |
| `SUPABASE_SERVICE_ROLE_KEY` | If `supabase` | Server-side only. Application still filters every query by `brand_id`. |
| `SUPABASE_ANON_KEY` | No | Not used by the ops adapter (RLS session `app.brand_id` is not wired). |
| `MOS_EMAIL_MODE` | No | `dry_run` (default) or `resend`. |
| `MOS_EMAIL_FROM` / `RESEND_API_KEY` | If `resend` | Names only in `.env.example`. |
| `MOS_PANEL_BASE_URL` | Recommended | Public panel URL for owner-review links. |
| `MOS_DRIVE_SOURCE` | No | `fixture` default. `google_drive` prefers a service account, else `MOS_DRIVE_ACCESS_TOKEN`. |
| `MOS_DRIVE_SERVICE_ACCOUNT_JSON` | If live Drive on Railway | Full GCP SA JSON string (secret). Do not commit. |
| `MOS_DRIVE_SERVICE_ACCOUNT_FILE` | Local live Drive | Path to the same JSON. Gitignored; prefer `**/secrets/**`. |
| `MOS_DRIVE_ACCESS_TOKEN` | Local/dev fallback | Short-lived user OAuth Bearer (~1h). Not suitable for Railway. |
| `MOS_REGISTRY_LOCAL_JSON` | Optional | JSON string, same shape as `REGISTRY.local.json`. Railway overlay for `owner_email` / `owner_cc` / Drive folder fields without a gitignored file. |
| `MOS_OWNER_EMAIL_VILLA_GLORY` | Optional | Convenience: overlay `owner_email` for Villa Glory. |
| `MOS_OWNER_CC_VILLA_GLORY` | Optional | Convenience: comma-separated `owner_cc`. |
| `MOS_DRIVE_FOLDER_URL_VILLA_GLORY` | Optional | Real Drive folder URL **without** editing committed `REGISTRY.json`. Also shown on `/api/brands`. |
| `MOS_DRIVE_FOLDER_ID_VILLA_GLORY` | Optional | Same, id only. |
| `MOS_FIGMA_SOURCE` / `MOS_HIGGSFIELD_SOURCE` / `MOS_VIDEO_SOURCE` | No | Fixture default. |
| `MOS_LIVE_PUBLISH` / `MOS_LIVE_ADS` | Must stay unset/false | Operator unlock + `PHASE_GATES` required before any live path. |
| `MARKETING_OS_ALLOW_EXTERNAL_WRITES` | Must stay false | Phase 1/2 constraint. |

`pnpm test` and `pnpm typecheck` must not require live cloud credentials. Leave `MOS_OPS_STORE` as `file` or `memory` in CI.

## Ops store

- **file** — `data/ops/store.json`. Default for local / CI / Docker.
- **memory** — process-local. Useful for ephemeral preview.
- **supabase** — optional `SupabaseOpsStore` mapped to `supabase/migrations/`. Apply those SQL files on a provisioned project, then:

```bash
export MOS_OPS_STORE=supabase
export SUPABASE_URL=https://YOUR_PROJECT.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=...   # .env.local only
pnpm panel
```

The adapter hydrates a memory replica and write-through upserts after each panel request (`flush()`). It does not set live publish/ads flags. Do not point `pnpm test` at a live project.

### Drive ingest durability

`GET /api/drive-sync` reads the **asset catalog**, not Google Drive. Before this track, `MOS_OPS_STORE=supabase` persisted campaigns/approvals while Drive metadata wrote to ephemeral `data/assets/catalog.json` — so Railway redeploys reset `ingested_count` to 0.

Production now uses the same Supabase project for asset metadata (`assets` / `asset_usage`) when `MOS_OPS_STORE=supabase` (or `MOS_ASSETS_STORE=supabase`). Apply `supabase/migrations/` including `202609120001_assets_source_roles.sql`. Manual `POST /api/drive-sync` still works. With `MOS_DRIVE_SOURCE=google_drive`, the panel also re-lists the Villa Glory folder on boot so a cold start is not stuck at 0.

Health includes `assets_store` next to `ops_store`. Expect both `supabase` on Railway. Binaries stay out of Git.

## Panel host

The panel is the existing Node HTTP app (`apps/panel`). There is no Next.js rewrite.

```bash
pnpm install
pnpm start
# or
pnpm panel
```

Binds `HOST`:`PORT` (defaults `0.0.0.0:8787`). Health:

```bash
curl -s http://127.0.0.1:8787/health
curl -s http://127.0.0.1:8787/api/health
```

Expect `ok: true`, `live_publish_allowed: false`, `live_ads_allowed: false`, `ops_store` matching `MOS_OPS_STORE`, and `assets_store` matching `MOS_ASSETS_STORE` (or the ops store when unset).

### Docker

```bash
docker build -t marketing-os-panel .
docker run --rm -p 8787:8787 marketing-os-panel
```

Pass `.env.local` as `--env-file` if you attach Supabase or Resend. Do not bake secrets into the image.

### Simple Node / PaaS

Any host that runs `pnpm start` and injects `PORT` works (Fly, Railway, a VM). Vercel serverless is not the intended target for this HTTP server.

## Drive folders (no secrets in git)

Committed registry keeps **fixture** folder ids (`fixture-villa-glory-root`, `fixture-lotin-root`, `fixture-nox-form-root`, `fixture-nox-tech-root`) and the Villa Glory fixture `@example.test` owner inbox. Attach a real folder / owner inbox without committing tokens:

1. Copy `brands/_shared/REGISTRY.local.json.example` → `brands/_shared/REGISTRY.local.json` (gitignored via `*.local.json`).
2. Set `asset_drive_folder_url` / `asset_drive_folder_id` (and optionally `owner_email` / `owner_cc`) on the brand you are attaching.
3. Or set env (Railway has no gitignored file): `MOS_REGISTRY_LOCAL_JSON` (same JSON shape) and/or `MOS_OWNER_EMAIL_<BRAND_ID>`, `MOS_OWNER_CC_<BRAND_ID>` (comma-separated), `MOS_DRIVE_FOLDER_URL_<BRAND_ID>` / `MOS_DRIVE_FOLDER_ID_<BRAND_ID>`. Env wins over the local file; the JSON blob wins over per-brand convenience vars. `/api/brands` reads the merged registry.
4. For `MOS_DRIVE_SOURCE=google_drive` on Railway, set `MOS_DRIVE_SERVICE_ACCOUNT_JSON` to the full GCP service-account JSON (secret). Locally you may use `MOS_DRIVE_SERVICE_ACCOUNT_FILE` or a short-lived `MOS_DRIVE_ACCESS_TOKEN`.
5. Share each brand folder with the service-account `client_email` as **Viewer**. Ingest is read-only (`drive.readonly`); this does not unlock live publish or ads.

LOTIN / NOX FORM / NOX TECH owner email / automation stay off in git. The example overlay shows `@example.test` flags for local digest dry-run only.

The folder must contain `brand-kit/`, `approved-stills/`, `approved-video/`, `raw-inbox/`, `generated/`. See [`ASSET_PIPELINE.md`](./ASSET_PIPELINE.md).

### Railway live Drive (read-only)

`MOS_DRIVE_ACCESS_TOKEN` expires in about an hour and is the wrong credential for a long-running panel. Use a GCP service account instead:

1. Create a service account. Enable the Google Drive API on the project. Do not grant project-wide Drive admin.
2. Download the JSON key once. Store it as the Railway secret `MOS_DRIVE_SERVICE_ACCOUNT_JSON` (the full JSON string). Never commit the file.
3. Share each brand Drive folder with the JSON `client_email` as **Viewer** (or add the SA to a Shared drive as Viewer).
4. Set `MOS_DRIVE_SOURCE=google_drive` and the per-brand folder overlay (`MOS_REGISTRY_LOCAL_JSON`, `MOS_DRIVE_FOLDER_URL_<BRAND_ID>`, or gitignored `REGISTRY.local.json`).
5. Runtime mints a short-lived Bearer with scope `https://www.googleapis.com/auth/drive.readonly`. Listing stays inside the registered folder. This does **not** enable live publish or ads.

Local override: `MOS_DRIVE_SERVICE_ACCOUNT_FILE=/path/to/sa.json` (keep the file under a gitignored `secrets/` directory) or a user OAuth `MOS_DRIVE_ACCESS_TOKEN` for a one-off laptop session.

## New brand scaffold

`pnpm create-brand` always writes `owner_email_enabled` and `automation_enabled` (default `false`). Opt in with `--enable-owner-email` and `--enable-automation`. See [`ADD_BRAND.md`](./ADD_BRAND.md).

## Operator unlock (out of scope here)

Live Instagram / Meta / Google spend is **not** enabled by this document. Unlock requires all of:

1. Explicit human approval
2. `live_publish_allowed` / `live_ads_allowed` flipped in `PHASE_GATES.json`
3. Matching `MOS_LIVE_*` env
4. Level 2 (publish) / Level 3 (ads) APPROVED rows

Until then, treat any 403 on `/api/publish` and `/api/ads/launch` as correct.
