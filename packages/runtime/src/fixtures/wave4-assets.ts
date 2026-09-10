import type { AssetCatalog } from "../assets.js";
import type { AssetRecord, AssetUsageRecord, BrandId } from "@marketing-os/contracts";

/** Stable fixture ids for Wave 4 asset-library queries (metadata only). */
export const WAVE4_ASSET_IDS = {
  VG_LIVING_UNUSED_A: "7a1c0b2e-4d33-4c1a-9f11-0c6d8e2a1001",
  VG_LIVING_UNUSED_B: "7a1c0b2e-4d33-4c1a-9f11-0c6d8e2a1002",
  VG_LIVING_USED: "7a1c0b2e-4d33-4c1a-9f11-0c6d8e2a1003",
  VG_BEDROOM_DRAFT: "7a1c0b2e-4d33-4c1a-9f11-0c6d8e2a1004",
  LOTIN_UNUSED: "8b2d1c3f-5e44-4d2b-8a22-1d7e9f3b2001",
  NOX_FORM_UNUSED: "8b2d1c3f-5e44-4d2b-8a22-1d7e9f3b2002",
  NOX_TECH_UNUSED: "8b2d1c3f-5e44-4d2b-8a22-1d7e9f3b2003",
} as const;

const FIXTURE_AT = "2026-09-10T08:00:00.000Z";

function fixtureAsset(
  brand_id: BrandId,
  asset_id: string,
  title: string,
  extra: Partial<AssetRecord> &
    Pick<AssetRecord, "usage_tags" | "platform_suitability" | "approval_status">,
): AssetRecord {
  return {
    asset_id,
    brand_id,
    title,
    kind: extra.kind ?? "IMAGE",
    mime_type: extra.mime_type ?? "image/jpeg",
    storage_uri: extra.storage_uri ?? `mos://assets/${brand_id}/${asset_id}`,
    in_git: false,
    usage_tags: extra.usage_tags,
    platform_suitability: extra.platform_suitability,
    approval_status: extra.approval_status,
    knowledge_status: "UNVERIFIED",
    metadata: {
      fixture: true,
      note: "Wave 4 catalog fixture — metadata only, not a VERIFIED product SKU.",
    },
    created_at: FIXTURE_AT,
    updated_at: FIXTURE_AT,
  };
}

export function seedWave4AssetFixtures(catalog: AssetCatalog): void {
  catalog.putMetadata(
    "VILLA_GLORY",
    fixtureAsset(
      "VILLA_GLORY",
      WAVE4_ASSET_IDS.VG_LIVING_UNUSED_A,
      "Living room set A — unused approved still",
      {
        usage_tags: ["living-room", "interior"],
        platform_suitability: ["instagram", "meta"],
        approval_status: "APPROVED",
      },
    ),
  );
  catalog.putMetadata(
    "VILLA_GLORY",
    fixtureAsset(
      "VILLA_GLORY",
      WAVE4_ASSET_IDS.VG_LIVING_UNUSED_B,
      "Living room set B — unused approved still",
      {
        usage_tags: ["living-room"],
        platform_suitability: ["instagram"],
        approval_status: "APPROVED",
      },
    ),
  );
  catalog.putMetadata(
    "VILLA_GLORY",
    fixtureAsset(
      "VILLA_GLORY",
      WAVE4_ASSET_IDS.VG_LIVING_USED,
      "Living room set C — already used",
      {
        usage_tags: ["living-room"],
        platform_suitability: ["instagram"],
        approval_status: "APPROVED",
      },
    ),
  );
  catalog.putMetadata(
    "VILLA_GLORY",
    fixtureAsset(
      "VILLA_GLORY",
      WAVE4_ASSET_IDS.VG_BEDROOM_DRAFT,
      "Bedroom still — draft only",
      {
        usage_tags: ["bedroom"],
        platform_suitability: ["instagram"],
        approval_status: "DRAFT",
      },
    ),
  );
  catalog.putMetadata(
    "LOTIN",
    fixtureAsset(
      "LOTIN",
      WAVE4_ASSET_IDS.LOTIN_UNUSED,
      "Lotin fixture still — unused",
      {
        usage_tags: ["brand"],
        platform_suitability: ["linkedin"],
        approval_status: "APPROVED",
      },
    ),
  );
  catalog.putMetadata(
    "NOX_FORM",
    fixtureAsset(
      "NOX_FORM",
      WAVE4_ASSET_IDS.NOX_FORM_UNUSED,
      "NOX FORM fixture still — unused",
      {
        usage_tags: ["brand"],
        platform_suitability: ["instagram"],
        approval_status: "APPROVED",
      },
    ),
  );
  catalog.putMetadata(
    "NOX_TECH",
    fixtureAsset(
      "NOX_TECH",
      WAVE4_ASSET_IDS.NOX_TECH_UNUSED,
      "NOX TECH fixture still — unused",
      {
        usage_tags: ["brand"],
        platform_suitability: ["linkedin"],
        approval_status: "APPROVED",
      },
    ),
  );

  const used: AssetUsageRecord = {
    usage_id: "9c3e2d4a-6f55-4e3c-9b33-2e8f0a4c3001",
    brand_id: "VILLA_GLORY",
    asset_id: WAVE4_ASSET_IDS.VG_LIVING_USED,
    used_at: FIXTURE_AT,
    channel: "instagram",
    note: "Fixture usage row so unused-approved queries exclude this asset.",
  };
  catalog.recordUsage("VILLA_GLORY", used);
}
