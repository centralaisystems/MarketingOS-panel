# Owner Review Loop

Brand owners review campaign-pack materials and request changes with a note. The system sends **templated** emails only — no freestyle agent mail.

Villa Glory is first (fixture `owner_email` on the registry). LOTIN stays off in the committed registry so dry-run mail cannot target a real inbox — opt in with a gitignored `REGISTRY.local.json` overlay using `@example.test` (see [`ADD_BRAND.md`](./ADD_BRAND.md)). Other brands opt in per entry.

## Registry (opt-in, brand-scoped)

On `brands/_shared/REGISTRY.json`:

| Field | Purpose |
|-------|---------|
| `owner_email` | To address. Repo fixtures use `@example.test` only. |
| `owner_cc` | Optional CC list. |
| `owner_email_enabled` | Per-brand kill switch. Default `false`. |

```bash
pnpm create-brand -- --id ACME --slug acme --name "Acme Co" \
  --owner-email owner@example.test --enable-owner-email
```

## Templates

1. **MATERIALS_READY** — campaign pack / creative draft summary + panel review link.
2. **PROGRESS_DIGEST** — dry-run safe counts (drafts, pending approvals, pending owner reviews).
3. **ADS_PROGRESS_STUB** — placeholder only. No Meta/Google live data. Clearly **not live spend**.
4. **AUTOMATION_DIGEST** — Wave 8 scheduled Today digest (counts only). See [`AUTOMATION.md`](./AUTOMATION.md).

Copy pulls pack/approval/digest fields only. It never invents `VERIFIED` commercial claims and does not attach binaries. When Figma arrange, Higgsfield fill-gap, or video produce jobs exist for the campaign, the review payload includes `arranged_asset_ids` / `figma_job_ids`, `generated_asset_ids` / `higgsfield_job_ids`, and `video_asset_ids` / `video_job_ids` (GENERATED / UNVERIFIED pointers — video rows are export packages, not rendered or published videos) so the owner page can deep-link later. Existing approve / request-changes behavior is unchanged.

## Modes

`MOS_EMAIL_MODE=dry_run` (default) writes the ops outbox + audit. No Resend call.

`MOS_EMAIL_MODE=resend` uses `RESEND_API_KEY` + optional `MOS_EMAIL_FROM`. Live send is not required for `pnpm test`.

## Owner actions

Tokenized page: `http://127.0.0.1:8787/owner-review?token=…`

- **Approve** — marks the Level ≤1 approval `APPROVED` (internal only).
- **Request changes** + note — creates a Level-1 revision task whose `input.owner_note` is the note, then re-runs Brand Guardian on the current pack drafts.

Live publish / live ads stay OFF.

## Operator panel

On an approvable pack: **Send for owner review**. Brand-scoped APIs:

```bash
curl -s -X POST http://127.0.0.1:8787/api/campaigns/$CAMPAIGN_ID/owner-review \
  -H 'content-type: application/json' \
  -d '{"brand_id":"VILLA_GLORY"}'
curl -s "http://127.0.0.1:8787/api/email-outbox?brand_id=VILLA_GLORY"
curl -s "http://127.0.0.1:8787/api/owner-review?token=$TOKEN"
curl -s -X POST http://127.0.0.1:8787/api/owner-review/decide \
  -H 'content-type: application/json' \
  -d '{"token":"…","decision":"CHANGES_REQUESTED","note":"Soften the caption."}'
```

LOTIN cannot read Villa Glory reviews or outbox rows. A token + mismatched `brand_id` returns `403 CROSS_BRAND_DENIED`.
