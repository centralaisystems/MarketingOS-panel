-- Allow Wave 4b studio sources on the assets catalog.
-- Drive ingest is still the durability target; figma/higgsfield/video metadata
-- may share the same table when the panel uses MOS_ASSETS_STORE=supabase.
-- Binaries stay out of Git. Live publish/ads stay gated.

alter table if exists assets
  drop constraint if exists assets_source_check;

alter table if exists assets
  add constraint assets_source_check
  check (
    source is null
    or source in ('catalog', 'drive', 'figma', 'higgsfield', 'video')
  );

comment on column assets.source is
  'Metadata origin. Drive ingest uses drive. Studio generators may persist figma/higgsfield/video pointers — never Git binaries.';
