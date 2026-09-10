import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { AssetRecordSchema } from "@marketing-os/contracts";
import {
  CrossBrandDeniedError,
  FileAssetCatalog,
  MemoryAssetCatalog,
  createAssetCatalog,
  listApprovedUnusedAssets,
  rejectBinaryInGit,
  WAVE4_ASSET_IDS,
} from "@marketing-os/runtime";

describe("Wave 4 asset metadata catalog", () => {
  it("lists unused approved Villa Glory living-room assets for instagram", () => {
    const catalog = createAssetCatalog({ seedFixtures: true });
    const rows = listApprovedUnusedAssets(catalog, "VILLA_GLORY", {
      usage_tags: ["living-room"],
      platform: "instagram",
    });
    expect(rows.map((r) => r.asset_id).sort()).toEqual(
      [WAVE4_ASSET_IDS.VG_LIVING_UNUSED_A, WAVE4_ASSET_IDS.VG_LIVING_UNUSED_B].sort(),
    );
    expect(rows.every((r) => r.brand_id === "VILLA_GLORY")).toBe(true);
    expect(rows.every((r) => r.in_git === false)).toBe(true);
    expect(rows.every((r) => r.approval_status === "APPROVED")).toBe(true);
  });

  it("never leaks another brand's metadata", () => {
    const catalog = createAssetCatalog({ seedFixtures: true });
    const lotin = catalog.listMetadata("LOTIN");
    expect(lotin.every((r) => r.brand_id === "LOTIN")).toBe(true);
    expect(lotin.some((r) => r.asset_id === WAVE4_ASSET_IDS.VG_LIVING_UNUSED_A)).toBe(
      false,
    );
    const noxForm = catalog.listMetadata("NOX_FORM");
    expect(noxForm.every((r) => r.brand_id === "NOX_FORM")).toBe(true);
    expect(noxForm.some((r) => r.asset_id === WAVE4_ASSET_IDS.NOX_FORM_UNUSED)).toBe(true);
    expect(noxForm.some((r) => r.asset_id === WAVE4_ASSET_IDS.VG_LIVING_UNUSED_A)).toBe(
      false,
    );
    const noxTech = catalog.listMetadata("NOX_TECH");
    expect(noxTech.every((r) => r.brand_id === "NOX_TECH")).toBe(true);
    expect(noxTech.some((r) => r.asset_id === WAVE4_ASSET_IDS.NOX_TECH_UNUSED)).toBe(true);
    expect(noxTech.some((r) => r.asset_id === WAVE4_ASSET_IDS.NOX_FORM_UNUSED)).toBe(
      false,
    );
    expect(
      catalog.getMetadata("LOTIN", WAVE4_ASSET_IDS.VG_LIVING_UNUSED_A),
    ).toBeNull();
    expect(catalog.resolvePointer("LOTIN", WAVE4_ASSET_IDS.VG_LIVING_UNUSED_A)).toBeNull();
  });

  it("rejects Git storage URIs and binary-in-git writes", () => {
    const catalog = new MemoryAssetCatalog();
    expect(catalog.stores_binaries_in_git).toBe(false);
    expect(() =>
      catalog.putMetadata(
        "VILLA_GLORY",
        AssetRecordSchema.parse({
          asset_id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeee01",
          brand_id: "VILLA_GLORY",
          title: "illegal git binary",
          kind: "IMAGE",
          mime_type: "image/jpeg",
          storage_uri: "brands/villa-glory/photo.jpg",
          in_git: false,
          usage_tags: [],
          platform_suitability: [],
          approval_status: "DRAFT",
          knowledge_status: "UNVERIFIED",
          metadata: {},
          created_at: "2026-09-10T08:00:00.000Z",
          updated_at: "2026-09-10T08:00:00.000Z",
        }),
      ),
    ).toThrow(/object storage|Git/);
    expect(() => rejectBinaryInGit()).toThrow(/must not be stored in Git/);
  });

  it("rejects inserting metadata under a different brand_id", () => {
    const catalog = createAssetCatalog({ seedFixtures: true });
    const villa = catalog.getMetadata(
      "VILLA_GLORY",
      WAVE4_ASSET_IDS.VG_LIVING_UNUSED_A,
    );
    expect(villa).toBeTruthy();
    expect(() => catalog.putMetadata("LOTIN", villa!)).toThrow(CrossBrandDeniedError);
  });

  it("file catalog round-trips one brand without leaking another", () => {
    const dir = mkdtempSync(join(tmpdir(), "mos-assets-"));
    try {
      const catalog = new FileAssetCatalog(dir);
      const seeded = createAssetCatalog({ backend: "memory", seedFixtures: true });
      for (const row of seeded.listMetadata("LOTIN")) {
        catalog.putMetadata("LOTIN", row);
      }
      const reloaded = new FileAssetCatalog(dir);
      expect(reloaded.listMetadata("LOTIN")).toHaveLength(1);
      expect(reloaded.listMetadata("VILLA_GLORY")).toHaveLength(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
