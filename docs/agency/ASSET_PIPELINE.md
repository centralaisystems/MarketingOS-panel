# Brand asset pipeline (Wave 4b)

Villa Glory first. One registered Drive folder per brand — Marketing OS does not browse the rest of Drive.

## Folder contract

Each brand Drive root must contain exactly these top-level folders (names are the contract):

| Folder | Role | Ingest approval metadata |
|--------|------|--------------------------|
| `brand-kit/` | Logos, colors, type, still guidelines | `DRAFT` |
| `approved-stills/` | Operator-approved stills | `APPROVED` |
| `approved-video/` | Operator-approved video | `APPROVED` |
| `raw-inbox/` | Unreviewed drops | `DRAFT` |
| `generated/` | Later pipeline outputs (Figma / Higgsfield / video) | `DRAFT` |

`APPROVED` here is **folder-contract metadata only**. It is not a `VERIFIED` commercial claim. `knowledge_status` stays `UNVERIFIED` unless a later evidence decision promotes a fact.

Unknown top-level folders are recorded; files outside a contract role are skipped. Ingest is fail-closed when a required folder is missing.

## Sequence (later waves)

```
Drive (this PR) → Figma arrange → Higgsfield generate → video (CapCut / Adobe) → human approve → publish/ads (gated)
```

Wave 4b implements **Drive → asset catalog** only:

1. Operator stores one `asset_drive_folder_url` / `asset_drive_folder_id` on the brand registry entry.
2. `DriveAssetSource` lists that folder (fixture by default; optional live Google Drive behind `MOS_DRIVE_SOURCE=google_drive`).
3. Runtime validates the folder contract and indexes **metadata** (type, path, Drive file id, hash if available, folder role) into the Wave 4 catalog.
4. Panel lists Drive sync status + ingested rows for the **active brand only**.

Out of scope here: Figma arrange, Higgsfield generate, CapCut/Adobe, live publish, inventing brand claims, NOX TECH admin embed.

## Commands

```bash
pnpm sync-brand-assets -- --brand VILLA_GLORY
# fixture mode is default — no live credentials required
```

Panel: `pnpm panel` → Drive asset pipeline section → Sync brand assets.

## Isolation and gates

- Every ingested row carries `brand_id`. LOTIN cannot read Villa Glory Drive assets.
- Binaries stay out of Git (`mos://drive/...` pointers only).
- `WAVE_4B_ASSET_PIPELINE` is enabled alongside Wave 4. `WAVE_5` / `WAVE_6` and `live_publish_allowed` / `live_ads_allowed` stay off.
