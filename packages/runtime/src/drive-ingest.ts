import { createHash } from "node:crypto";
import {
  AssetRecordSchema,
  DriveAssetSyncResultSchema,
  DriveSyncStatusSchema,
  type AssetApprovalStatus,
  type AssetKind,
  type AssetRecord,
  type BrandId,
  type DriveAssetSyncResult,
  type DriveFolderRole,
  type DriveListedFile,
  type DriveSyncStatus,
} from "@marketing-os/contracts";
import {
  assertRegisteredBrandId,
  brandsRootOpt,
  getBrandEntry,
} from "./brand-registry.js";
import { assertWaveEnabled } from "./phase-gates.js";
import type { AssetCatalog } from "./assets.js";
import {
  createDriveAssetSource,
  folderRoleFromPath,
  parseDriveFolderId,
  type DriveAssetSource,
} from "./drive-source.js";

const DRIVE_ASSET_NS = Buffer.from("a1b2c3d4e5f67890abcdef1234567890", "hex");

export function driveAssetId(brand_id: BrandId, drive_file_id: string): string {
  const name = Buffer.from(`drive:${brand_id}:${drive_file_id}`, "utf8");
  const hash = createHash("sha1").update(DRIVE_ASSET_NS).update(name).digest();
  hash[6] = (hash[6]! & 0x0f) | 0x50;
  hash[8] = (hash[8]! & 0x3f) | 0x80;
  const h = hash.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

function envDriveOverride(brand_id: BrandId): {
  folder_id?: string;
  folder_url?: string;
} {
  const url = process.env[`MOS_DRIVE_FOLDER_URL_${brand_id}`]?.trim();
  const id = process.env[`MOS_DRIVE_FOLDER_ID_${brand_id}`]?.trim();
  return {
    ...(url ? { folder_url: url } : {}),
    ...(id ? { folder_id: id } : {}),
  };
}

export function resolveBrandDriveFolder(
  brand_id: BrandId,
  opts?: { brandsRoot?: string },
): { folder_id: string; folder_url: string | null } | null {
  const entry = getBrandEntry(brand_id, brandsRootOpt(opts?.brandsRoot));
  const env = envDriveOverride(brand_id);
  const url = env.folder_url ?? entry.asset_drive_folder_url;
  const fromUrl = url ? parseDriveFolderId(url) : null;
  const folder_id = env.folder_id ?? entry.asset_drive_folder_id ?? fromUrl;
  if (!folder_id) return null;
  return {
    folder_id,
    folder_url: url ?? `https://drive.google.com/drive/folders/${folder_id}`,
  };
}

export function approvalStatusForFolderRole(role: DriveFolderRole): AssetApprovalStatus {
  if (role === "approved-stills" || role === "approved-video") return "APPROVED";
  return "DRAFT";
}

export function kindFromMime(mime_type: string): AssetKind {
  if (mime_type.startsWith("image/")) return "IMAGE";
  if (mime_type.startsWith("video/")) return "VIDEO";
  if (mime_type.startsWith("audio/")) return "AUDIO";
  if (
    mime_type.includes("pdf") ||
    mime_type.includes("document") ||
    mime_type.startsWith("text/")
  ) {
    return "DOCUMENT";
  }
  return "OTHER";
}

export function listedFileToAssetRecord(
  brand_id: BrandId,
  file: DriveListedFile,
  opts: { source_mode: "fixture" | "google_drive"; now: string },
): AssetRecord {
  const role = file.folder_role;
  const record: AssetRecord = {
    asset_id: driveAssetId(brand_id, file.drive_file_id),
    brand_id,
    title: file.name,
    kind: kindFromMime(file.mime_type),
    mime_type: file.mime_type,
    storage_uri: `mos://drive/${brand_id}/${file.drive_file_id}`,
    in_git: false,
    usage_tags: [role],
    platform_suitability: [],
    approval_status: approvalStatusForFolderRole(role),
    knowledge_status: "UNVERIFIED",
    source: "drive",
    folder_role: role,
    drive_file_id: file.drive_file_id,
    drive_path: file.path,
    metadata: {
      ingest: "read_only",
      source_mode: opts.source_mode,
      folder_role: role,
      drive_file_id: file.drive_file_id,
      drive_path: file.path,
      knowledge_note:
        "Folder-contract APPROVED metadata is not a VERIFIED commercial claim.",
      ...(file.drive_md5 ? { drive_md5: file.drive_md5 } : {}),
    },
    created_at: file.modified_at ?? opts.now,
    updated_at: opts.now,
  };
  if (file.checksum_sha256) {
    record.checksum_sha256 = file.checksum_sha256;
  }
  return AssetRecordSchema.parse(record);
}

export function listDriveIngestedAssets(
  catalog: AssetCatalog,
  brand_id: BrandId,
): AssetRecord[] {
  return catalog
    .listMetadata(brand_id)
    .filter((a) => a.source === "drive" || Boolean(a.drive_file_id));
}

export async function readDriveSyncStatus(input: {
  brand_id: string;
  catalog: AssetCatalog;
  source?: DriveAssetSource;
  brandsRoot?: string;
}): Promise<DriveSyncStatus> {
  assertWaveEnabled("WAVE_4B_ASSET_PIPELINE", brandsRootOpt(input.brandsRoot));
  const brand_id = assertRegisteredBrandId(
    input.brand_id,
    brandsRootOpt(input.brandsRoot),
  );
  const source = input.source ?? createDriveAssetSource();
  const binding = resolveBrandDriveFolder(brand_id, brandsRootOpt(input.brandsRoot));
  const ingested = listDriveIngestedAssets(input.catalog, brand_id);
  const last = ingested[0]?.updated_at ?? null;

  if (!binding) {
    return DriveSyncStatusSchema.parse({
      brand_id,
      configured: false,
      read_only: true,
      source: source.mode,
      folder_id: null,
      folder_url: null,
      contract: {
        valid: false,
        required: [
          "brand-kit",
          "approved-stills",
          "approved-video",
          "raw-inbox",
          "generated",
        ],
        present: [],
        missing: [
          "brand-kit",
          "approved-stills",
          "approved-video",
          "raw-inbox",
          "generated",
        ],
        unknown: [],
      },
      ingested_count: ingested.length,
      assets: ingested,
      last_synced_at: last,
      live_publish: false,
      live_ads: false,
      stores_binaries_in_git: false,
      message: `No Drive folder configured for ${brand_id}. Add asset_drive_folder_url or asset_drive_folder_id on the registry.`,
    });
  }

  const contract = await source.listFolderContract(brand_id, binding.folder_id);
  return DriveSyncStatusSchema.parse({
    brand_id,
    configured: true,
    read_only: true,
    source: source.mode,
    folder_id: binding.folder_id,
    folder_url: binding.folder_url,
    contract,
    ingested_count: ingested.length,
    assets: ingested,
    last_synced_at: last,
    live_publish: false,
    live_ads: false,
    stores_binaries_in_git: false,
    message: contract.valid
      ? `Drive folder contract OK for ${brand_id} (${source.mode}). ${ingested.length} ingested metadata rows.`
      : `Drive folder contract incomplete for ${brand_id}. Missing: ${contract.missing.join(", ")}.`,
  });
}

export async function syncBrandAssets(input: {
  brand_id: string;
  catalog: AssetCatalog;
  source?: DriveAssetSource;
  brandsRoot?: string;
  now?: string;
}): Promise<DriveAssetSyncResult> {
  assertWaveEnabled("WAVE_4B_ASSET_PIPELINE", brandsRootOpt(input.brandsRoot));
  const brand_id = assertRegisteredBrandId(
    input.brand_id,
    brandsRootOpt(input.brandsRoot),
  );
  const source = input.source ?? createDriveAssetSource();
  const now = input.now ?? new Date().toISOString();
  const binding = resolveBrandDriveFolder(brand_id, brandsRootOpt(input.brandsRoot));

  if (!binding) {
    return DriveAssetSyncResultSchema.parse({
      brand_id,
      configured: false,
      read_only: true,
      source: source.mode,
      folder_id: null,
      folder_url: null,
      contract: {
        valid: false,
        required: [
          "brand-kit",
          "approved-stills",
          "approved-video",
          "raw-inbox",
          "generated",
        ],
        present: [],
        missing: [
          "brand-kit",
          "approved-stills",
          "approved-video",
          "raw-inbox",
          "generated",
        ],
        unknown: [],
      },
      ingested: 0,
      skipped: 0,
      assets: [],
      synced_at: now,
      message: `No Drive folder configured for ${brand_id}. Add asset_drive_folder_url or asset_drive_folder_id on the registry.`,
      live_publish: false,
      live_ads: false,
      stores_binaries_in_git: false,
    });
  }

  const contract = await source.listFolderContract(brand_id, binding.folder_id);
  if (!contract.valid) {
    return DriveAssetSyncResultSchema.parse({
      brand_id,
      configured: true,
      read_only: true,
      source: source.mode,
      folder_id: binding.folder_id,
      folder_url: binding.folder_url,
      contract,
      ingested: 0,
      skipped: 0,
      assets: [],
      synced_at: now,
      message: `Drive folder contract invalid for ${brand_id}. Missing: ${contract.missing.join(", ")}. Ingest skipped.`,
      live_publish: false,
      live_ads: false,
      stores_binaries_in_git: false,
    });
  }

  const listed = await source.listFiles(brand_id, binding.folder_id);
  const ingested: AssetRecord[] = [];
  let skipped = 0;
  for (const file of listed) {
    const role = folderRoleFromPath(file.path);
    if (!role || role !== file.folder_role) {
      skipped += 1;
      continue;
    }
    const record = listedFileToAssetRecord(brand_id, file, {
      source_mode: source.mode,
      now,
    });
    ingested.push(input.catalog.putMetadata(brand_id, record));
  }

  return DriveAssetSyncResultSchema.parse({
    brand_id,
    configured: true,
    read_only: true,
    source: source.mode,
    folder_id: binding.folder_id,
    folder_url: binding.folder_url,
    contract,
    ingested: ingested.length,
    skipped,
    assets: ingested,
    synced_at: now,
    message: `Ingested ${ingested.length} Drive metadata rows for ${brand_id} (${source.mode}). Binaries stay out of Git.`,
    live_publish: false,
    live_ads: false,
    stores_binaries_in_git: false,
  });
}
