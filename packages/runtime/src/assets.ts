import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import {
  AssetCatalogSnapshotSchema,
  AssetRecordSchema,
  AssetStoragePointerSchema,
  AssetUsageRecordSchema,
  assertExternalStorageUri,
  type AssetApprovalStatus,
  type AssetCatalogSnapshot,
  type AssetKind,
  type AssetRecord,
  type AssetStoragePointer,
  type AssetUsageRecord,
  type BrandId,
} from "@marketing-os/contracts";
import { CrossBrandDeniedError } from "./ops-store.js";
import { seedWave4AssetFixtures } from "./fixtures/wave4-assets.js";

export class AssetBinaryInGitError extends Error {
  constructor(message = "Asset binaries must not be stored in Git") {
    super(message);
    this.name = "AssetBinaryInGitError";
  }
}

export type AssetListFilter = {
  approval_status?: AssetApprovalStatus;
  kind?: AssetKind;
  usage_tags?: string[];
  platform?: string;
  unused_only?: boolean;
};

/**
 * Metadata catalog + object-storage pointer resolver.
 * Binaries stay out of Git; this interface never accepts file bytes.
 */
export interface AssetStorageAdapter {
  readonly stores_binaries_in_git: false;
  resolvePointer(
    brand_id: BrandId,
    asset_id: string,
  ): AssetStoragePointer | null;
}

export interface AssetCatalog extends AssetStorageAdapter {
  putMetadata(brand_id: BrandId, record: AssetRecord): AssetRecord;
  getMetadata(brand_id: BrandId, asset_id: string): AssetRecord | null;
  listMetadata(brand_id: BrandId, filter?: AssetListFilter): AssetRecord[];
  recordUsage(brand_id: BrandId, usage: AssetUsageRecord): AssetUsageRecord;
  listUsage(brand_id: BrandId, asset_id?: string): AssetUsageRecord[];
}

function assertSameBrand(active: BrandId, recordBrand: BrandId): void {
  if (active !== recordBrand) {
    throw new CrossBrandDeniedError(active, recordBrand);
  }
}

function newestFirst<T extends { created_at?: string; used_at?: string }>(
  rows: T[],
): T[] {
  return [...rows].sort((a, b) => {
    const aKey = a.created_at ?? a.used_at ?? "";
    const bKey = b.created_at ?? b.used_at ?? "";
    return aKey < bKey ? 1 : -1;
  });
}

export function rejectBinaryInGit(): never {
  throw new AssetBinaryInGitError();
}

export class MemoryAssetCatalog implements AssetCatalog {
  readonly stores_binaries_in_git = false as const;
  protected assets: AssetRecord[] = [];
  protected usage: AssetUsageRecord[] = [];

  putMetadata(brand_id: BrandId, record: AssetRecord): AssetRecord {
    const parsed = AssetRecordSchema.parse(record);
    assertSameBrand(brand_id, parsed.brand_id);
    assertExternalStorageUri(parsed.storage_uri);
    if (parsed.in_git) {
      rejectBinaryInGit();
    }
    this.assets = this.assets.filter((a) => a.asset_id !== parsed.asset_id);
    this.assets.push(parsed);
    return parsed;
  }

  getMetadata(brand_id: BrandId, asset_id: string): AssetRecord | null {
    const found = this.assets.find((a) => a.asset_id === asset_id);
    if (!found || found.brand_id !== brand_id) return null;
    return found;
  }

  listMetadata(brand_id: BrandId, filter?: AssetListFilter): AssetRecord[] {
    const usedIds = new Set(
      this.usage.filter((u) => u.brand_id === brand_id).map((u) => u.asset_id),
    );
    return newestFirst(
      this.assets.filter((a) => {
        if (a.brand_id !== brand_id) return false;
        if (filter?.approval_status && a.approval_status !== filter.approval_status) {
          return false;
        }
        if (filter?.kind && a.kind !== filter.kind) return false;
        if (
          filter?.usage_tags?.length &&
          !filter.usage_tags.every((tag) => a.usage_tags.includes(tag))
        ) {
          return false;
        }
        if (
          filter?.platform &&
          !a.platform_suitability.includes(filter.platform)
        ) {
          return false;
        }
        if (filter?.unused_only && usedIds.has(a.asset_id)) return false;
        return true;
      }),
    );
  }

  recordUsage(brand_id: BrandId, usage: AssetUsageRecord): AssetUsageRecord {
    const parsed = AssetUsageRecordSchema.parse(usage);
    assertSameBrand(brand_id, parsed.brand_id);
    const asset = this.getMetadata(brand_id, parsed.asset_id);
    if (!asset) {
      throw new Error(`Asset ${parsed.asset_id} not found for ${brand_id}`);
    }
    this.usage.push(parsed);
    return parsed;
  }

  listUsage(brand_id: BrandId, asset_id?: string): AssetUsageRecord[] {
    return newestFirst(
      this.usage.filter((u) => {
        if (u.brand_id !== brand_id) return false;
        if (asset_id && u.asset_id !== asset_id) return false;
        return true;
      }),
    );
  }

  resolvePointer(
    brand_id: BrandId,
    asset_id: string,
  ): AssetStoragePointer | null {
    const asset = this.getMetadata(brand_id, asset_id);
    if (!asset) return null;
    return AssetStoragePointerSchema.parse({
      brand_id,
      asset_id,
      storage_uri: asset.storage_uri,
      in_git: false,
      stores_binaries_in_git: false,
    });
  }

  exportSnapshot(): AssetCatalogSnapshot {
    return AssetCatalogSnapshotSchema.parse({
      assets: this.assets,
      usage: this.usage,
    });
  }
}

export class FileAssetCatalog extends MemoryAssetCatalog {
  private readonly filePath: string;

  constructor(dir: string) {
    super();
    mkdirSync(dir, { recursive: true });
    this.filePath = join(dir, "catalog.json");
    this.load();
  }

  private load(): void {
    if (!existsSync(this.filePath)) {
      this.persist();
      return;
    }
    const raw = JSON.parse(readFileSync(this.filePath, "utf8")) as unknown;
    const snap = AssetCatalogSnapshotSchema.parse(raw);
    this.assets = snap.assets;
    this.usage = snap.usage;
  }

  private persist(): void {
    const snap = this.exportSnapshot();
    const tmp = `${this.filePath}.tmp`;
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(tmp, JSON.stringify(snap, null, 2) + "\n");
    renameSync(tmp, this.filePath);
  }

  override putMetadata(brand_id: BrandId, record: AssetRecord): AssetRecord {
    const row = super.putMetadata(brand_id, record);
    this.persist();
    return row;
  }

  override recordUsage(brand_id: BrandId, usage: AssetUsageRecord): AssetUsageRecord {
    const row = super.recordUsage(brand_id, usage);
    this.persist();
    return row;
  }
}

export type AssetCatalogBackend = "memory" | "file";

export function createAssetCatalog(opts?: {
  backend?: AssetCatalogBackend;
  dir?: string;
  seedFixtures?: boolean;
}): AssetCatalog {
  const backend = opts?.backend ?? "memory";
  const catalog =
    backend === "file"
      ? new FileAssetCatalog(opts?.dir ?? join(process.cwd(), "data", "assets"))
      : new MemoryAssetCatalog();
  if (opts?.seedFixtures && catalog.listMetadata("VILLA_GLORY").length === 0) {
    seedWave4AssetFixtures(catalog);
  }
  return catalog;
}

export function listApprovedUnusedAssets(
  catalog: AssetCatalog,
  brand_id: BrandId,
  filter?: Omit<AssetListFilter, "approval_status" | "unused_only">,
): AssetRecord[] {
  return catalog.listMetadata(brand_id, {
    ...filter,
    approval_status: "APPROVED",
    unused_only: true,
  });
}
