# Brand asset pipeline (Wave 4b)

Villa Glory, LOTIN, NOX FORM, and NOX TECH have committed **fixture** Drive folders. One registered Drive folder per brand — Marketing OS does not browse the rest of Drive.

## Folder contract

Each brand Drive root must contain exactly these top-level folders (names are the contract):

| Folder | Role | Ingest approval metadata |
|--------|------|--------------------------|
| `brand-kit/` | Logos, colors, type, still guidelines | `DRAFT` |
| `approved-stills/` | Operator-approved stills | `APPROVED` |
| `approved-video/` | Operator-approved video | `APPROVED` |
| `raw-inbox/` | Unreviewed drops | `DRAFT` |
| `generated/` | Pipeline outputs (Figma arrange + Higgsfield stills + video packages) | `DRAFT` |

`APPROVED` here is **folder-contract metadata only**. It is not a `VERIFIED` commercial claim. `knowledge_status` stays `UNVERIFIED` unless a later evidence decision promotes a fact.

Unknown top-level folders are recorded; files outside a contract role are skipped. Ingest is fail-closed when a required folder is missing.

## Sequence

```
Drive ingest (done) → Figma arrange (done) → Higgsfield fill-gaps (done) → video export package (this step) → human approve → publish/ads (gated)
```

### Drive → catalog

1. Operator stores one `asset_drive_folder_url` / `asset_drive_folder_id` on the brand registry entry, **or** a gitignored `REGISTRY.local.json` patch / `MOS_DRIVE_FOLDER_URL_<BRAND_ID>` env (Villa Glory + LOTIN + NOX FORM + NOX TECH fixtures stay in the committed registry). Do not commit Drive tokens or service-account JSON.
2. `DriveAssetSource` lists that folder (fixture by default; optional live Google Drive behind `MOS_DRIVE_SOURCE=google_drive`). Live auth prefers `MOS_DRIVE_SERVICE_ACCOUNT_JSON` / `MOS_DRIVE_SERVICE_ACCOUNT_FILE` (JWT mint, `drive.readonly`); `MOS_DRIVE_ACCESS_TOKEN` remains a local/dev fallback. Share the folder with the SA `client_email` as Viewer. `pnpm test` stays on fixture and does not mint tokens.
3. Runtime validates the folder contract and indexes **metadata** into the Wave 4 catalog.

### Figma arrange

`FigmaArrangeJob` takes `brand_id`, selected approved still ids, and a layout brief. Outputs stay `folder_role=generated`, `source=figma`, `provenance=GENERATED`, `knowledge_status=UNVERIFIED`, `approval_status=DRAFT`.

### Higgsfield fill-gaps

`HiggsfieldGenerateJob` generates a **net-new still only when the gap detector says approved stills / brand-kit are insufficient** for the brief (missing `usage_tag` and/or aspect such as `9:16`). If coverage is already sufficient, the job is `SKIPPED_NO_GAP` and no catalog row is written.

- Prompt is derived from **VERIFIED** pack voice / positioning / offering category fields plus the layout brief. UNVERIFIED pack fields are labeled and must not be treated as facts. No invented ROI / SKU / partner claims.
- `HiggsfieldAdapter` is **fixture-first** (deterministic metadata, no binary, no API key). Optional live: `MOS_HIGGSFIELD_SOURCE=higgsfield_api` + `MOS_HIGGSFIELD_API_KEY`. Not required for `pnpm test`.
- Generated rows: `folder_role=generated`, `source=higgsfield`, `provenance=GENERATED`, `knowledge_status=UNVERIFIED`, `approval_status=DRAFT`.
- Brand Guardian + brand-kit presence check must pass before `READY_FOR_OWNER_REVIEW`.
- Owner Review can attach those generated asset ids / job ids alongside Figma arrange attachments.

### Video export package (CapCut / Adobe foundation)

`VideoProduceJob` assembles a **project recipe** from `APPROVED` stills and Guardian-ready generated stills (Higgsfield jobs with `READY_FOR_OWNER_REVIEW`). It does **not** render a video, control CapCut/Premiere desktop, or upload to Instagram.

- Brief comes from the operator, campaign pack / creative objective, or a default reel brief. Target format is `reel` / `story` / `feed`.
- On-screen captions use **VERIFIED** pack voice / positioning only. UNVERIFIED fields stay off-screen. No invented ROI / SKU / partner claims.
- `VideoProducerAdapter` is **fixture-first**. `MOS_VIDEO_SOURCE=capcut` or `adobe_premiere` labels the same export package (timeline JSON, asset list, captions, import hint). CI does not need CapCut or Adobe installed.
- Catalog row: `folder_role=generated`, `source=video`, `kind=DOCUMENT`, `provenance=GENERATED`, `knowledge_status=UNVERIFIED`, `approval_status=DRAFT`. Pointer `mos://video/...`.
- Owner Review can attach `video_job_ids` / `video_asset_ids`.

Out of scope here: live CapCut/Adobe desktop control, rendered MP4 binaries in Git, live publish, inventing brand claims, NOX TECH admin embed.

## Commands

```bash
pnpm sync-brand-assets -- --brand VILLA_GLORY
pnpm sync-brand-assets -- --brand LOTIN
pnpm sync-brand-assets -- --brand NOX_FORM
pnpm sync-brand-assets -- --brand NOX_TECH
pnpm arrange-figma -- --brand VILLA_GLORY --sync
pnpm fill-higgsfield-gaps -- --brand VILLA_GLORY --sync
pnpm produce-video -- --brand VILLA_GLORY --sync
# fixture mode is default — no live credentials or CapCut/Adobe install required
```

Panel: `pnpm panel` → Drive asset pipeline → Arrange in Figma → Fill gaps (Higgsfield) → Produce video package.

## Isolation and gates

- Every ingested or generated row carries `brand_id`. LOTIN / NOX FORM / NOX TECH Drive rows stay on that brand; Villa Glory cannot read them (and the reverse). Figma / Higgsfield / video packages remain Villa Glory first.
- Binaries stay out of Git (`mos://drive/...`, `mos://figma/...`, `mos://higgsfield/...`, `mos://video/...` pointers only).
- `WAVE_4B_ASSET_PIPELINE` is enabled alongside Wave 4. Wave 5 Instagram dry-run and Wave 6 paid staging are enabled; `live_publish_allowed` / `live_ads_allowed` stay off.
