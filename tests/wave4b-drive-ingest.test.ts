import { describe, expect, it } from "vitest";
import {
  BrandRegistryEntrySchema,
  DriveAssetSyncResultSchema,
} from "@marketing-os/contracts";
import {
  FixtureDriveAssetSource,
  GoogleDriveCredentialsMissingError,
  MemoryAssetCatalog,
  WAVE4_ASSET_IDS,
  approvalStatusForFolderRole,
  createAssetCatalog,
  createDriveAssetSource,
  driveAssetId,
  handlePanelApi,
  MemoryOpsStore,
  parseDriveFolderId,
  syncBrandAssets,
  validateDriveFolderContract,
  VILLA_GLORY_FIXTURE_DRIVE_FOLDER_ID,
  VILLA_GLORY_FIXTURE_DRIVE_TREE,
  type DriveFixtureTree,
  type PanelApiContext,
} from "@marketing-os/runtime";

function panelCtx(catalog = createAssetCatalog({ seedFixtures: true })): PanelApiContext {
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

describe("Wave 4b Drive folder contract", () => {
  it("parses a Drive folder URL and validates the required roles", () => {
    expect(
      parseDriveFolderId(
        "https://drive.google.com/drive/folders/fixture-villa-glory-root",
      ),
    ).toBe("fixture-villa-glory-root");
    const ok = validateDriveFolderContract([
      "brand-kit",
      "approved-stills",
      "approved-video",
      "raw-inbox",
      "generated",
      "notes-extra",
    ]);
    expect(ok.valid).toBe(true);
    expect(ok.unknown).toEqual(["notes-extra"]);
    const bad = validateDriveFolderContract(["brand-kit", "raw-inbox"]);
    expect(bad.valid).toBe(false);
    expect(bad.missing).toEqual([
      "approved-stills",
      "approved-video",
      "generated",
    ]);
  });

  it("maps approved-* folders to APPROVED metadata only", () => {
    expect(approvalStatusForFolderRole("approved-stills")).toBe("APPROVED");
    expect(approvalStatusForFolderRole("approved-video")).toBe("APPROVED");
    expect(approvalStatusForFolderRole("raw-inbox")).toBe("DRAFT");
    expect(approvalStatusForFolderRole("brand-kit")).toBe("DRAFT");
    expect(approvalStatusForFolderRole("generated")).toBe("DRAFT");
  });
});

describe("Wave 4b Villa Glory fixture ingest", () => {
  it("ingests the fixture tree with folder roles and provenance", async () => {
    const catalog = new MemoryAssetCatalog();
    const result = await syncBrandAssets({
      brand_id: "VILLA_GLORY",
      catalog,
      source: createDriveAssetSource({ mode: "fixture" }),
    });
    expect(result.configured).toBe(true);
    expect(result.read_only).toBe(true);
    expect(result.source).toBe("fixture");
    expect(result.contract.valid).toBe(true);
    expect(result.folder_id).toBe(VILLA_GLORY_FIXTURE_DRIVE_FOLDER_ID);
    expect(result.ingested).toBe(VILLA_GLORY_FIXTURE_DRIVE_TREE.files.length);
    expect(result.skipped).toBe(0);
    expect(result.live_publish).toBe(false);
    expect(result.live_ads).toBe(false);
    expect(result.stores_binaries_in_git).toBe(false);
    DriveAssetSyncResultSchema.parse(result);

    const rows = catalog.listMetadata("VILLA_GLORY", { source: "drive" });
    expect(rows).toHaveLength(6);
    expect(rows.every((r) => r.brand_id === "VILLA_GLORY")).toBe(true);
    expect(rows.every((r) => r.in_git === false)).toBe(true);
    expect(rows.every((r) => r.knowledge_status === "UNVERIFIED")).toBe(true);
    expect(rows.every((r) => r.source === "drive")).toBe(true);
    expect(rows.every((r) => r.storage_uri.startsWith("mos://drive/VILLA_GLORY/"))).toBe(
      true,
    );

    const stills = rows.filter((r) => r.folder_role === "approved-stills");
    expect(stills).toHaveLength(2);
    expect(stills.every((r) => r.approval_status === "APPROVED")).toBe(true);
    expect(stills.every((r) => r.kind === "IMAGE")).toBe(true);

    const video = rows.find((r) => r.folder_role === "approved-video");
    expect(video?.approval_status).toBe("APPROVED");
    expect(video?.kind).toBe("VIDEO");

    const inbox = rows.find((r) => r.folder_role === "raw-inbox");
    expect(inbox?.approval_status).toBe("DRAFT");
    expect(inbox?.drive_path).toBe("raw-inbox/photographer-drop-unreviewed.jpg");
    expect(inbox?.drive_file_id).toBe("vg-inbox-drop");
    expect(inbox?.asset_id).toBe(driveAssetId("VILLA_GLORY", "vg-inbox-drop"));

    const kit = rows.filter((r) => r.folder_role === "brand-kit");
    expect(kit).toHaveLength(2);
    expect(kit.every((r) => r.approval_status === "DRAFT")).toBe(true);
    expect(rows.some((r) => r.folder_role === "generated")).toBe(false);
  });

  it("does not let LOTIN see Villa Glory Drive assets", async () => {
    const catalog = new MemoryAssetCatalog();
    await syncBrandAssets({
      brand_id: "VILLA_GLORY",
      catalog,
      source: createDriveAssetSource({ mode: "fixture" }),
    });
    expect(catalog.listMetadata("LOTIN")).toEqual([]);
    expect(
      catalog.getMetadata(
        "LOTIN",
        driveAssetId("VILLA_GLORY", "vg-still-living-a"),
      ),
    ).toBeNull();

    const lotin = await syncBrandAssets({
      brand_id: "LOTIN",
      catalog,
      source: createDriveAssetSource({ mode: "fixture" }),
    });
    expect(lotin.configured).toBe(false);
    expect(lotin.ingested).toBe(0);
    expect(catalog.listMetadata("LOTIN")).toEqual([]);
    expect(catalog.listMetadata("VILLA_GLORY", { source: "drive" })).toHaveLength(6);
  });

  it("skips ingest when the folder contract is incomplete", async () => {
    const broken: DriveFixtureTree = {
      ...VILLA_GLORY_FIXTURE_DRIVE_TREE,
      folders: ["brand-kit", "raw-inbox"],
    };
    const source = new FixtureDriveAssetSource({ VILLA_GLORY: broken });
    const catalog = new MemoryAssetCatalog();
    const result = await syncBrandAssets({
      brand_id: "VILLA_GLORY",
      catalog,
      source,
    });
    expect(result.contract.valid).toBe(false);
    expect(result.ingested).toBe(0);
    expect(catalog.listMetadata("VILLA_GLORY")).toEqual([]);
  });

  it("does not require live Google Drive credentials in fixture mode", () => {
    const source = createDriveAssetSource({ mode: "fixture" });
    expect(source.mode).toBe("fixture");
    expect(source.read_only).toBe(true);
    expect(() => createDriveAssetSource({ mode: "google_drive", accessToken: "" })).toThrow(
      GoogleDriveCredentialsMissingError,
    );
  });

  it("accepts optional Drive fields on a registry entry", () => {
    const entry = BrandRegistryEntrySchema.parse({
      brand_id: "VILLA_GLORY",
      slug: "villa-glory",
      display_name: "Villa Glory",
      asset_drive_folder_id: VILLA_GLORY_FIXTURE_DRIVE_FOLDER_ID,
      asset_drive_folder_url:
        "https://drive.google.com/drive/folders/fixture-villa-glory-root",
    });
    expect(entry.asset_drive_folder_id).toBe(VILLA_GLORY_FIXTURE_DRIVE_FOLDER_ID);
  });
});

describe("Wave 4b panel Drive sync", () => {
  it("syncs Villa Glory and denies LOTIN the ingested rows", async () => {
    const catalog = createAssetCatalog({ seedFixtures: true });
    const ctx = panelCtx(catalog);

    const sync = await api(ctx, "POST", "/api/drive-sync", {
      body: { brand_id: "VILLA_GLORY" },
    });
    expect(sync.status).toBe(200);
    const body = sync.body as { brand_id: string; ingested: number; read_only: boolean };
    expect(body.brand_id).toBe("VILLA_GLORY");
    expect(body.ingested).toBe(6);
    expect(body.read_only).toBe(true);

    const status = await api(ctx, "GET", "/api/drive-sync", {
      query: { brand_id: "VILLA_GLORY" },
    });
    expect(status.status).toBe(200);
    expect((status.body as { ingested_count: number }).ingested_count).toBe(6);

    const driveAssets = await api(ctx, "GET", "/api/assets", {
      query: { brand_id: "VILLA_GLORY", source: "drive" },
    });
    const vg = (
      driveAssets.body as { assets: Array<{ brand_id: string; asset_id: string }> }
    ).assets;
    expect(vg.every((a) => a.brand_id === "VILLA_GLORY")).toBe(true);
    expect(vg).toHaveLength(6);

    const lotinDrive = await api(ctx, "GET", "/api/assets", {
      query: { brand_id: "LOTIN", source: "drive" },
    });
    expect((lotinDrive.body as { assets: unknown[] }).assets).toEqual([]);

    const lotinAll = await api(ctx, "GET", "/api/assets", {
      query: { brand_id: "LOTIN" },
    });
    const lotinRows = (
      lotinAll.body as { assets: Array<{ asset_id: string; brand_id: string }> }
    ).assets;
    expect(lotinRows.every((a) => a.brand_id === "LOTIN")).toBe(true);
    expect(lotinRows.some((a) => a.asset_id === WAVE4_ASSET_IDS.VG_LIVING_UNUSED_A)).toBe(
      false,
    );
    expect(
      lotinRows.some((a) => a.asset_id === driveAssetId("VILLA_GLORY", "vg-still-living-a")),
    ).toBe(false);

    const cross = await api(
      ctx,
      "GET",
      `/api/assets/${driveAssetId("VILLA_GLORY", "vg-still-living-a")}`,
      { query: { brand_id: "LOTIN" } },
    );
    expect(cross.status).toBe(404);

    const mismatch = await api(ctx, "POST", "/api/drive-sync", {
      query: { brand_id: "LOTIN" },
      body: { brand_id: "VILLA_GLORY" },
    });
    expect(mismatch.status).toBe(403);
    expect((mismatch.body as { error: string }).error).toBe("CROSS_BRAND_DENIED");

    const binaryWrite = await api(ctx, "POST", "/api/assets", {
      body: { brand_id: "VILLA_GLORY", bytes: "nope" },
    });
    expect(binaryWrite.status).toBe(403);
  });
});
