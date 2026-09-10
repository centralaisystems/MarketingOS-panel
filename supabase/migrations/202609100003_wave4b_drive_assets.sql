-- Marketing OS Wave 4b — Drive folder-contract provenance on asset metadata
-- Apply after 202609100002_wave4_analytics_assets.sql when a Supabase project is provisioned.
-- Local/CI uses File/Memory catalogs + FixtureDriveAssetSource. No binaries in Git.

alter table if exists assets
  add column if not exists source text
    check (source in ('catalog', 'drive')),
  add column if not exists folder_role text
    check (folder_role in (
      'brand-kit',
      'approved-stills',
      'approved-video',
      'raw-inbox',
      'generated'
    )),
  add column if not exists drive_file_id text,
  add column if not exists drive_path text;

create index if not exists assets_brand_drive_idx
  on assets (brand_id, source, folder_role);

comment on column assets.folder_role is
  'Wave 4b Drive folder-contract role. APPROVED stills/video are path-contract metadata only — not VERIFIED commercial claims.';
comment on column assets.drive_file_id is
  'Read-only Drive file id. Ingest never stores file bytes in Git.';
