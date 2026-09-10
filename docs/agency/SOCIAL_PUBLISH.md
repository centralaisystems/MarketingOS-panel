# Wave 5 — gated social publish (dry-run)

Villa Glory first. Instagram is the only wired channel. Default path is **dry-run**: record the intended post payload and audit, with no Graph API call and no credentials.

## Gates

| Control | This PR |
|---------|---------|
| `WAVE_5_SOCIAL_PUBLISH` | Enabled (planning / dry-run) |
| `live_publish_allowed` | **false** |
| `MOS_LIVE_PUBLISH` | Defaults **false** |
| Level 2 approval | Required before any live path |
| Instagram API | Not implemented |

Do not set `live_publish_allowed` to true without an explicit operator decision. The env flag is a second fail-closed switch and also defaults false.

## Dry-run schedule

1. Build a campaign pack for the active `brand_id`.
2. Guardian must pass (`approvable=true`).
3. Operator approves the Level 1 inbox item → campaign `INTERNAL_APPROVED`.
4. Panel **Approve & schedule (dry-run)** (or `POST /api/publish/dry-run`) with actor + rationale.
5. Runtime attaches **APPROVED** Instagram-suitable assets (auto-picks an unused fixture still when omitted).
6. Adapter writes `social_outbox` status `DRY_RUN_RECORDED` and audit `SOCIAL_PUBLISH_DRY_RUN`.
7. `live_publish` / `external_side_effects` stay false.

Live fire (`POST /api/publish`, `POST /api/live-publish`) returns **403**, writes `SOCIAL_PUBLISH_LIVE_BLOCKED`, and never calls Instagram.

## Isolation

Every outbox row carries `brand_id`. LOTIN cannot list or schedule Villa Glory posts.

## Out of scope

Real Instagram Graph posting, other channels, ads (Wave 6), enabling `live_publish_allowed=true`.
