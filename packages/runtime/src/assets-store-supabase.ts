/**
 * Optional Supabase adapter for the Wave 4 / 4b asset catalog.
 *
 * Production panel used MOS_OPS_STORE=supabase for campaigns/approvals, but
 * Drive ingest lived in FileAssetCatalog (ephemeral Railway disk). This
 * adapter maps AssetRecord / AssetUsageRecord onto supabase/migrations
 * `assets` + `asset_usage` so ingested Drive metadata survives redeploy.
 *
 * CI and `pnpm test` stay on file/memory unless a test injects OpsRemoteClient.
 */
import {
  AssetRecordSchema,
  AssetUsageRecordSchema,
  type AssetRecord,
  type AssetUsageRecord,
  type BrandId,
} from "@marketing-os/contracts";
import { MemoryAssetCatalog } from "./assets.js";
import {
  brandRowForOps,
  type OpsRemoteClient,
} from "./ops-store-supabase.js";

function iso(value: unknown, fallback?: string): string {
  if (typeof value === "string" && value.trim()) {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return fallback ?? new Date().toISOString();
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

function omitNull<T extends Record<string, unknown>>(row: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (v !== null && v !== undefined) out[k] = v;
  }
  return out as T;
}

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

export function assetToRow(record: AssetRecord): Record<string, unknown> {
  return omitNull({
    asset_id: record.asset_id,
    brand_id: record.brand_id,
    title: record.title,
    mime_type: record.mime_type,
    storage_uri: record.storage_uri,
    metadata: {
      ...record.metadata,
      ...(record.provenance ? { provenance: record.provenance } : {}),
    },
    kind: record.kind,
    approval_status: record.approval_status,
    usage_tags: record.usage_tags ?? [],
    platform_suitability: record.platform_suitability ?? [],
    knowledge_status: record.knowledge_status ?? "UNVERIFIED",
    in_git: false,
    checksum_sha256: record.checksum_sha256 ?? null,
    source: record.source ?? "catalog",
    folder_role: record.folder_role ?? null,
    drive_file_id: record.drive_file_id ?? null,
    drive_path: record.drive_path ?? null,
    created_at: record.created_at,
    updated_at: record.updated_at,
  });
}

export function assetFromRow(row: Record<string, unknown>): AssetRecord {
  const metadata = asRecord(row.metadata);
  const provenance = optionalText(metadata.provenance);
  return AssetRecordSchema.parse({
    asset_id: row.asset_id,
    brand_id: row.brand_id,
    title: row.title,
    kind: row.kind ?? "OTHER",
    mime_type: row.mime_type ?? "application/octet-stream",
    storage_uri: row.storage_uri,
    in_git: false,
    ...(optionalText(row.checksum_sha256)
      ? { checksum_sha256: optionalText(row.checksum_sha256) }
      : {}),
    usage_tags: asStringArray(row.usage_tags),
    platform_suitability: asStringArray(row.platform_suitability),
    approval_status: row.approval_status ?? "DRAFT",
    knowledge_status: row.knowledge_status ?? "UNVERIFIED",
    ...(provenance === "CATALOG" || provenance === "INGESTED" || provenance === "GENERATED"
      ? { provenance }
      : {}),
    ...(optionalText(row.source) ? { source: row.source } : {}),
    ...(optionalText(row.folder_role) ? { folder_role: row.folder_role } : {}),
    ...(optionalText(row.drive_file_id) ? { drive_file_id: row.drive_file_id } : {}),
    ...(optionalText(row.drive_path) ? { drive_path: row.drive_path } : {}),
    metadata,
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at, iso(row.created_at)),
  });
}

export function usageToRow(record: AssetUsageRecord): Record<string, unknown> {
  return omitNull({
    usage_id: record.usage_id,
    brand_id: record.brand_id,
    asset_id: record.asset_id,
    used_at: record.used_at,
    channel: record.channel ?? null,
    campaign_id: record.campaign_id ?? null,
    note: record.note ?? null,
  });
}

export function usageFromRow(row: Record<string, unknown>): AssetUsageRecord {
  return AssetUsageRecordSchema.parse({
    usage_id: row.usage_id,
    brand_id: row.brand_id,
    asset_id: row.asset_id,
    used_at: iso(row.used_at),
    ...(optionalText(row.channel) ? { channel: row.channel } : {}),
    ...(optionalText(row.campaign_id) ? { campaign_id: row.campaign_id } : {}),
    ...(optionalText(row.note) ? { note: row.note } : {}),
  });
}

/**
 * Write-through catalog: memory replica for sync reads + queued Supabase upserts.
 * Call `flush()` after a request (panel does this automatically).
 *
 * Brand rows are upserted first so `assets.brand_id → brands` stays valid.
 */
export class SupabaseAssetCatalog extends MemoryAssetCatalog {
  private pending: Promise<void>[] = [];

  constructor(private readonly remote: OpsRemoteClient) {
    super();
  }

  static async connect(remote: OpsRemoteClient): Promise<SupabaseAssetCatalog> {
    const catalog = new SupabaseAssetCatalog(remote);
    await catalog.hydrate();
    return catalog;
  }

  private enqueue(op: () => Promise<void>): void {
    const prev = this.pending[this.pending.length - 1] ?? Promise.resolve();
    this.pending.push(prev.then(op));
  }

  private ensureBrand(brand_id: BrandId): void {
    const row = brandRowForOps(brand_id);
    this.enqueue(() => this.remote.upsert("brands", row, "brand_id"));
  }

  override async flush(): Promise<void> {
    const batch = this.pending;
    this.pending = [];
    if (batch.length === 0) return;
    await batch[batch.length - 1];
  }

  async hydrate(): Promise<void> {
    const [assetRows, usageRows] = await Promise.all([
      this.remote.select("assets"),
      this.remote.select("asset_usage"),
    ]);
    this.assets = assetRows.map(assetFromRow);
    this.usage = usageRows.map(usageFromRow);
  }

  override putMetadata(brand_id: BrandId, record: AssetRecord): AssetRecord {
    const row = super.putMetadata(brand_id, record);
    this.ensureBrand(row.brand_id);
    this.enqueue(() => this.remote.upsert("assets", assetToRow(row), "asset_id"));
    return row;
  }

  override recordUsage(brand_id: BrandId, usage: AssetUsageRecord): AssetUsageRecord {
    const row = super.recordUsage(brand_id, usage);
    this.ensureBrand(row.brand_id);
    this.enqueue(() => this.remote.upsert("asset_usage", usageToRow(row), "usage_id"));
    return row;
  }
}
