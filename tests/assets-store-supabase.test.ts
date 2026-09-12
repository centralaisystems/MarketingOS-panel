import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import {
  FileAssetCatalog,
  MemoryOpsRemoteClient,
  SupabaseAssetCatalog,
  VILLA_GLORY_FIXTURE_DRIVE_TREE,
  assetFromRow,
  assetToRow,
  createAssetCatalog,
  createAssetCatalogAsync,
  createDriveAssetSource,
  handlePanelApi,
  MemoryOpsStore,
  rehydrateConfiguredDriveBrands,
  resolveAssetCatalogBackend,
  shouldBootSyncDrive,
  syncBrandAssets,
  type PanelApiContext,
} from "@marketing-os/runtime";

function panelCtx(catalog: FileAssetCatalog | Awaited<ReturnType<typeof createAssetCatalogAsync>>): PanelApiContext {
  return {
    store: new MemoryOpsStore(),
    assets: catalog,
    drive: createDriveAssetSource({ mode: "fixture" }),
    writeReport: false,
  };
}

async function api(
  ctx: PanelApiContext,
  method: string,
  pathname: string,
  opts?: { query?: Record<string, string>; body?: unknown },
) {
  return handlePanelApi(
    {
      method,
      pathname,
      searchParams: new URLSearchParams(opts?.query ?? {}),
      ...(opts?.body !== undefined ? { body: opts.body } : {}),
    },
    ctx,
  );
}

describe("asset catalog backend selection", () => {
  const prev = {
    MOS_ASSETS_STORE: process.env.MOS_ASSETS_STORE,
    MOS_OPS_STORE: process.env.MOS_OPS_STORE,
    MOS_OPS_BACKEND: process.env.MOS_OPS_BACKEND,
  };
  afterEach(() => {
    for (const [key, value] of Object.entries(prev)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("follows MOS_OPS_STORE=supabase unless MOS_ASSETS_STORE overrides", () => {
    delete process.env.MOS_ASSETS_STORE;
    process.env.MOS_OPS_STORE = "supabase";
    expect(resolveAssetCatalogBackend()).toBe("supabase");
    process.env.MOS_ASSETS_STORE = "file";
    expect(resolveAssetCatalogBackend()).toBe("file");
  });

  it("refuses sync createAssetCatalog for supabase", () => {
    expect(() => createAssetCatalog({ backend: "supabase" })).toThrow(
      /createAssetCatalogAsync/,
    );
  });
});

describe("Drive ingest persistence across restart", () => {
  it("keeps Villa Glory Drive rows in a file catalog after reload", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mos-assets-persist-"));
    try {
      const first = new FileAssetCatalog(dir);
      const synced = await syncBrandAssets({
        brand_id: "VILLA_GLORY",
        catalog: first,
        source: createDriveAssetSource({ mode: "fixture" }),
      });
      expect(synced.ingested).toBe(VILLA_GLORY_FIXTURE_DRIVE_TREE.files.length);

      const reloaded = new FileAssetCatalog(dir);
      const status = await api(panelCtx(reloaded), "GET", "/api/drive-sync", {
        query: { brand_id: "VILLA_GLORY" },
      });
      expect(status.status).toBe(200);
      expect((status.body as { ingested_count: number }).ingested_count).toBe(
        VILLA_GLORY_FIXTURE_DRIVE_TREE.files.length,
      );
      expect((status.body as { last_synced_at: string | null }).last_synced_at).toBeTruthy();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("write-through + hydrate keeps Drive rows on the Supabase path", async () => {
    const remote = new MemoryOpsRemoteClient();
    const first = await createAssetCatalogAsync({
      backend: "supabase",
      remote,
      seedFixtures: false,
    });
    const synced = await syncBrandAssets({
      brand_id: "VILLA_GLORY",
      catalog: first,
      source: createDriveAssetSource({ mode: "fixture" }),
    });
    await first.flush();
    expect(synced.ingested).toBe(VILLA_GLORY_FIXTURE_DRIVE_TREE.files.length);

    const stored = await remote.select("assets");
    expect(stored.every((row) => row.brand_id === "VILLA_GLORY")).toBe(true);
    expect(stored.filter((row) => row.source === "drive")).toHaveLength(
      VILLA_GLORY_FIXTURE_DRIVE_TREE.files.length,
    );
    expect(stored.every((row) => row.in_git !== true)).toBe(true);

    const brands = await remote.select("brands");
    expect(brands.some((row) => row.brand_id === "VILLA_GLORY")).toBe(true);

    const reloaded = await SupabaseAssetCatalog.connect(remote);
    const status = await api(panelCtx(reloaded), "GET", "/api/drive-sync", {
      query: { brand_id: "VILLA_GLORY" },
    });
    expect(status.status).toBe(200);
    expect((status.body as { ingested_count: number }).ingested_count).toBe(
      VILLA_GLORY_FIXTURE_DRIVE_TREE.files.length,
    );
    expect(reloaded.listMetadata("LOTIN")).toEqual([]);
  });

  it("round-trips a Drive row through the SQL mapper", async () => {
    const catalog = await createAssetCatalogAsync({ seedFixtures: false });
    await syncBrandAssets({
      brand_id: "VILLA_GLORY",
      catalog,
      source: createDriveAssetSource({ mode: "fixture" }),
    });
    const original = catalog.listMetadata("VILLA_GLORY", { source: "drive" })[0];
    expect(original).toBeTruthy();
    const row = assetToRow(original!);
    expect(row.brand_id).toBe("VILLA_GLORY");
    expect(row.source).toBe("drive");
    expect(row.in_git).toBe(false);
    expect(assetFromRow(row).asset_id).toBe(original!.asset_id);
    expect(assetFromRow(row).drive_file_id).toBe(original!.drive_file_id);
  });

  it("rehydrates configured Villa Glory Drive metadata on an empty catalog", async () => {
    const catalog = createAssetCatalog({ backend: "memory", seedFixtures: false });
    expect(catalog.listMetadata("VILLA_GLORY")).toEqual([]);
    const boot = await rehydrateConfiguredDriveBrands({
      catalog,
      source: createDriveAssetSource({ mode: "fixture" }),
      brand_ids: ["VILLA_GLORY"],
    });
    expect(boot).toHaveLength(1);
    expect(boot[0]?.ingested).toBe(VILLA_GLORY_FIXTURE_DRIVE_TREE.files.length);
    const status = await api(panelCtx(catalog), "GET", "/api/drive-sync", {
      query: { brand_id: "VILLA_GLORY" },
    });
    expect((status.body as { ingested_count: number }).ingested_count).toBe(
      VILLA_GLORY_FIXTURE_DRIVE_TREE.files.length,
    );
  });
});

describe("Drive boot-sync flags", () => {
  it("defaults on only for live Google Drive", () => {
    expect(shouldBootSyncDrive({ MOS_DRIVE_SOURCE: "fixture" })).toBe(false);
    expect(shouldBootSyncDrive({ MOS_DRIVE_SOURCE: "google_drive" })).toBe(true);
    expect(
      shouldBootSyncDrive({
        MOS_DRIVE_SOURCE: "google_drive",
        MOS_DRIVE_BOOT_SYNC: "false",
      }),
    ).toBe(false);
    expect(shouldBootSyncDrive({ MOS_DRIVE_BOOT_SYNC: "true" })).toBe(true);
  });
});

describe("Supabase asset usage isolation", () => {
  it("does not leak usage across brands", async () => {
    const remote = new MemoryOpsRemoteClient();
    const catalog = await createAssetCatalogAsync({
      backend: "supabase",
      remote,
      seedFixtures: true,
    });
    await catalog.flush();
    const usage = catalog.recordUsage("VILLA_GLORY", {
      usage_id: randomUUID(),
      brand_id: "VILLA_GLORY",
      asset_id: catalog.listMetadata("VILLA_GLORY")[0]!.asset_id,
      used_at: new Date().toISOString(),
      note: "fixture isolation",
    });
    await catalog.flush();
    expect(catalog.listUsage("LOTIN")).toEqual([]);
    expect(catalog.listUsage("VILLA_GLORY").some((row) => row.usage_id === usage.usage_id)).toBe(
      true,
    );
  });
});
