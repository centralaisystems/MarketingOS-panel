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
| `generated/` | Pipeline outputs (Figma arrange now; Higgsfield / video later) | `DRAFT` |

`APPROVED` here is **folder-contract metadata only**. It is not a `VERIFIED` commercial claim. `knowledge_status` stays `UNVERIFIED` unless a later evidence decision promotes a fact.

Unknown top-level folders are recorded; files outside a contract role are skipped. Ingest is fail-closed when a required folder is missing.

## Sequence

```
Drive ingest (done) → Figma arrange (this step) → Higgsfield generate (later) → video (CapCut / Adobe, later) → human approve → publish/ads (gated)
```

### Drive → catalog

1. Operator stores one `asset_drive_folder_url` / `asset_drive_folder_id` on the brand registry entry.
2. `DriveAssetSource` lists that folder (fixture by default; optional live Google Drive behind `MOS_DRIVE_SOURCE=google_drive`).
3. Runtime validates the folder contract and indexes **metadata** into the Wave 4 catalog.

### Figma arrange

`FigmaArrangeJob` takes `brand_id`, selected approved still ids, and a layout brief (operator text and/or campaign-pack objective). `FigmaArrangeAdapter` places stills on a brand-kit template:

- **Fixture mode (default / CI)** — deterministic Villa Glory file/node URLs. No Figma token.
- **Optional live** — `MOS_FIGMA_SOURCE=figma_api` + `MOS_FIGMA_ACCESS_TOKEN` + `MOS_FIGMA_FILE_KEY`. Not required for `pnpm test`.

Outputs are written back to the catalog under `folder_role=generated`, `source=figma`, `provenance=GENERATED`, `knowledge_status=UNVERIFIED`, `approval_status=DRAFT`. Brand Guardian (plus a brand-kit presence check) must pass before the job is `READY_FOR_OWNER_REVIEW`. Owner Review can later attach those generated asset ids / Figma URLs; existing review flows stay intact.

Out of scope here: Higgsfield generate, CapCut/Adobe, live publish, inventing brand claims, NOX TECH admin embed.

## Commands

```bash
pnpm sync-brand-assets -- --brand VILLA_GLORY
pnpm arrange-figma -- --brand VILLA_GLORY --sync
# fixture mode is default — no live credentials required
```

Panel: `pnpm panel` → Drive asset pipeline → Sync brand assets → Arrange in Figma.

## Isolation and gates

- Every ingested or generated row carries `brand_id`. LOTIN cannot read Villa Glory Drive assets or Figma jobs.
- Binaries stay out of Git (`mos://drive/...` and `mos://figma/...` pointers only).
- `WAVE_4B_ASSET_PIPELINE` is enabled alongside Wave 4. `WAVE_5` / `WAVE_6` and `live_publish_allowed` / `live_ads_allowed` stay off.
