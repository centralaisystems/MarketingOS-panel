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
| `generated/` | Pipeline outputs (Figma arrange + Higgsfield stills; video later) | `DRAFT` |

`APPROVED` here is **folder-contract metadata only**. It is not a `VERIFIED` commercial claim. `knowledge_status` stays `UNVERIFIED` unless a later evidence decision promotes a fact.

Unknown top-level folders are recorded; files outside a contract role are skipped. Ingest is fail-closed when a required folder is missing.

## Sequence

```
Drive ingest (done) → Figma arrange (done) → Higgsfield fill-gaps (this step) → video (CapCut / Adobe, later) → human approve → publish/ads (gated)
```

### Drive → catalog

1. Operator stores one `asset_drive_folder_url` / `asset_drive_folder_id` on the brand registry entry.
2. `DriveAssetSource` lists that folder (fixture by default; optional live Google Drive behind `MOS_DRIVE_SOURCE=google_drive`).
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

Out of scope here: CapCut/Adobe video, live publish, inventing brand claims, NOX TECH admin embed.

## Commands

```bash
pnpm sync-brand-assets -- --brand VILLA_GLORY
pnpm arrange-figma -- --brand VILLA_GLORY --sync
pnpm fill-higgsfield-gaps -- --brand VILLA_GLORY --sync
# fixture mode is default — no live credentials required
```

Panel: `pnpm panel` → Drive asset pipeline → Arrange in Figma → Fill gaps (Higgsfield).

## Isolation and gates

- Every ingested or generated row carries `brand_id`. LOTIN cannot read Villa Glory Drive assets, Figma jobs, or Higgsfield jobs.
- Binaries stay out of Git (`mos://drive/...`, `mos://figma/...`, `mos://higgsfield/...` pointers only).
- `WAVE_4B_ASSET_PIPELINE` is enabled alongside Wave 4. `WAVE_5` / `WAVE_6` and `live_publish_allowed` / `live_ads_allowed` stay off.
