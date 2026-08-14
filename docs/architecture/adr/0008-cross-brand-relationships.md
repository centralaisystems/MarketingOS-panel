# ADR 0008 — Cross-brand relationships do not merge memory

## Status

Accepted

## Decision

Relationships between brands are explicit records in `brands/_shared/RELATIONSHIPS.json`.

Loading a brand pack never loads related brand packs. Usage of another brand's assets requires `SHARED_ASSET_WITH_PERMISSION` and `usage_permission: true`, plus regeneration in the target brand voice.

## Consequences

Villa Glory and NOX FORM may be related without contaminating Brand Brains.
