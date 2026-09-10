import { afterEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  applyRegistryEnvOverlay,
  applyRegistryLocalOverlay,
  clearBrandRegistryCache,
  loadBrandRegistry,
  resolveBrandDriveFolder,
} from "@marketing-os/runtime";
import { BrandRegistryEntrySchema } from "@marketing-os/contracts";

const REPO = process.cwd();

describe("create-brand registry hygiene", () => {
  const temps: string[] = [];
  afterEach(() => {
    clearBrandRegistryCache();
    for (const dir of temps) {
      rmSync(dir, { recursive: true, force: true });
    }
    temps.length = 0;
  });

  it("always writes owner_email_enabled and automation_enabled (default false)", () => {
    const root = mkdtempSync(join(tmpdir(), "mos-create-brand-"));
    temps.push(root);
    cpSync(join(REPO, "brands", "_shared"), join(root, "_shared"), {
      recursive: true,
    });
    execFileSync(
      "pnpm",
      [
        "exec",
        "tsx",
        join(REPO, "scripts", "create-brand.ts"),
        "--id",
        "ACME_TEST",
        "--slug",
        "acme-test",
        "--name",
        "Acme Test",
        "--brands-root",
        root,
      ],
      { cwd: REPO, encoding: "utf8" },
    );
    clearBrandRegistryCache();
    const entry = loadBrandRegistry({ brandsRoot: root, forceReload: true }).brands.find(
      (b) => b.brand_id === "ACME_TEST",
    );
    expect(entry).toBeTruthy();
    expect(entry?.owner_email_enabled).toBe(false);
    expect(entry?.automation_enabled).toBe(false);
    const raw = JSON.parse(
      readFileSync(join(root, "_shared", "REGISTRY.json"), "utf8"),
    ) as { brands: Array<Record<string, unknown>> };
    const written = raw.brands.find((b) => b.brand_id === "ACME_TEST");
    expect(written).toMatchObject({
      owner_email_enabled: false,
      automation_enabled: false,
    });
    BrandRegistryEntrySchema.parse(written);
  });

  it("opts in owner email + automation when flags are passed", () => {
    const root = mkdtempSync(join(tmpdir(), "mos-create-brand-on-"));
    temps.push(root);
    cpSync(join(REPO, "brands", "_shared"), join(root, "_shared"), {
      recursive: true,
    });
    execFileSync(
      "pnpm",
      [
        "exec",
        "tsx",
        join(REPO, "scripts", "create-brand.ts"),
        "--id",
        "ACME_ON",
        "--slug",
        "acme-on",
        "--name",
        "Acme On",
        "--owner-email",
        "owner@example.test",
        "--enable-owner-email",
        "--enable-automation",
        "--brands-root",
        root,
      ],
      { cwd: REPO, encoding: "utf8" },
    );
    clearBrandRegistryCache();
    const entry = loadBrandRegistry({ brandsRoot: root, forceReload: true }).brands.find(
      (b) => b.brand_id === "ACME_ON",
    );
    expect(entry?.owner_email).toBe("owner@example.test");
    expect(entry?.owner_email_enabled).toBe(true);
    expect(entry?.automation_enabled).toBe(true);
  });
});

describe("registry local overlay", () => {
  const temps: string[] = [];
  afterEach(() => {
    clearBrandRegistryCache();
    for (const dir of temps) {
      rmSync(dir, { recursive: true, force: true });
    }
    temps.length = 0;
    delete process.env.MOS_DRIVE_FOLDER_URL_VILLA_GLORY;
    delete process.env.MOS_DRIVE_FOLDER_ID_VILLA_GLORY;
    delete process.env.MOS_OWNER_EMAIL_VILLA_GLORY;
    delete process.env.MOS_OWNER_CC_VILLA_GLORY;
    delete process.env.MOS_REGISTRY_LOCAL_JSON;
  });

  it("patches an existing brand only and cannot add a foreign brand", () => {
    const base = loadBrandRegistry({ forceReload: true });
    const merged = applyRegistryLocalOverlay(base, {
      brands: [
        {
          brand_id: "VILLA_GLORY",
          asset_drive_folder_id: "operator-local-folder",
          asset_drive_folder_url:
            "https://drive.google.com/drive/folders/operator-local-folder",
        },
        {
          brand_id: "NOT_A_CLIENT",
          slug: "not-a-client",
          display_name: "Leak",
        },
      ],
    });
    expect(merged.brands.some((b) => b.brand_id === "NOT_A_CLIENT")).toBe(false);
    const villa = merged.brands.find((b) => b.brand_id === "VILLA_GLORY");
    expect(villa?.asset_drive_folder_id).toBe("operator-local-folder");
    expect(villa?.display_name).toBe("Villa Glory");
  });

  it("loads REGISTRY.local.json from the brands root", () => {
    const root = mkdtempSync(join(tmpdir(), "mos-reg-local-"));
    temps.push(root);
    cpSync(join(REPO, "brands"), root, { recursive: true });
    writeFileSync(
      join(root, "_shared", "REGISTRY.local.json"),
      JSON.stringify({
        brands: [
          {
            brand_id: "VILLA_GLORY",
            asset_drive_folder_id: "local-only-id",
          },
        ],
      }),
    );
    clearBrandRegistryCache();
    const villa = loadBrandRegistry({
      brandsRoot: root,
      forceReload: true,
    }).brands.find((b) => b.brand_id === "VILLA_GLORY");
    expect(villa?.asset_drive_folder_id).toBe("local-only-id");
  });

  it("lets MOS_DRIVE_FOLDER_* override the committed Villa Glory fixture folder", () => {
    process.env.MOS_DRIVE_FOLDER_ID_VILLA_GLORY = "env-only-folder";
    process.env.MOS_DRIVE_FOLDER_URL_VILLA_GLORY =
      "https://drive.google.com/drive/folders/env-only-folder";
    const resolved = resolveBrandDriveFolder("VILLA_GLORY");
    expect(resolved?.folder_id).toBe("env-only-folder");
    expect(resolved?.folder_url).toContain("env-only-folder");
  });

  it("overlays Villa Glory owner and Drive fields from a fake env map", () => {
    const base = loadBrandRegistry({ forceReload: true });
    const merged = applyRegistryEnvOverlay(base, {
      MOS_OWNER_EMAIL_VILLA_GLORY: "villa-glory-ops@example.test",
      MOS_OWNER_CC_VILLA_GLORY:
        "villa-glory-cc-a@example.test, villa-glory-cc-b@example.test",
      MOS_DRIVE_FOLDER_ID_VILLA_GLORY: "env-registry-folder",
      MOS_DRIVE_FOLDER_URL_VILLA_GLORY:
        "https://drive.google.com/drive/folders/env-registry-folder",
    });
    const villa = merged.brands.find((b) => b.brand_id === "VILLA_GLORY");
    expect(villa?.owner_email).toBe("villa-glory-ops@example.test");
    expect(villa?.owner_cc).toEqual([
      "villa-glory-cc-a@example.test",
      "villa-glory-cc-b@example.test",
    ]);
    expect(villa?.asset_drive_folder_id).toBe("env-registry-folder");
    expect(villa?.asset_drive_folder_url).toBe(
      "https://drive.google.com/drive/folders/env-registry-folder",
    );
    expect(villa?.owner_email_enabled).toBe(true);
    const lotin = merged.brands.find((b) => b.brand_id === "LOTIN");
    expect(lotin?.owner_email).toBeUndefined();
    expect(lotin?.asset_drive_folder_id).toBe("fixture-lotin-root");
  });

  it("lets MOS_REGISTRY_LOCAL_JSON win over per-brand convenience vars", () => {
    const base = loadBrandRegistry({ forceReload: true });
    const merged = applyRegistryEnvOverlay(base, {
      MOS_OWNER_EMAIL_VILLA_GLORY: "convenience@example.test",
      MOS_DRIVE_FOLDER_ID_VILLA_GLORY: "convenience-folder",
      MOS_REGISTRY_LOCAL_JSON: JSON.stringify({
        brands: [
          {
            brand_id: "VILLA_GLORY",
            owner_email: "json-overlay@example.test",
            owner_cc: ["json-cc@example.test"],
            asset_drive_folder_id: "json-folder",
            asset_drive_folder_url:
              "https://drive.google.com/drive/folders/json-folder",
          },
        ],
      }),
    });
    const villa = merged.brands.find((b) => b.brand_id === "VILLA_GLORY");
    expect(villa?.owner_email).toBe("json-overlay@example.test");
    expect(villa?.owner_cc).toEqual(["json-cc@example.test"]);
    expect(villa?.asset_drive_folder_id).toBe("json-folder");
  });

  it("applies MOS_REGISTRY_LOCAL_JSON when loading the registry (Railway path)", () => {
    process.env.MOS_REGISTRY_LOCAL_JSON = JSON.stringify({
      brands: [
        {
          brand_id: "VILLA_GLORY",
          owner_email: "villa-glory-railway@example.test",
          owner_cc: ["villa-glory-railway-cc@example.test"],
          asset_drive_folder_id: "railway-folder",
          asset_drive_folder_url:
            "https://drive.google.com/drive/folders/railway-folder",
        },
      ],
    });
    const villa = loadBrandRegistry({ forceReload: true }).brands.find(
      (b) => b.brand_id === "VILLA_GLORY",
    );
    expect(villa?.owner_email).toBe("villa-glory-railway@example.test");
    expect(villa?.owner_cc).toEqual(["villa-glory-railway-cc@example.test"]);
    expect(villa?.asset_drive_folder_id).toBe("railway-folder");
    expect(villa?.asset_drive_folder_url).toContain("railway-folder");
  });

  it("lets env overlay win over REGISTRY.local.json", () => {
    const root = mkdtempSync(join(tmpdir(), "mos-reg-env-"));
    temps.push(root);
    cpSync(join(REPO, "brands"), root, { recursive: true });
    writeFileSync(
      join(root, "_shared", "REGISTRY.local.json"),
      JSON.stringify({
        brands: [
          {
            brand_id: "VILLA_GLORY",
            owner_email: "file-overlay@example.test",
            asset_drive_folder_id: "file-only-id",
          },
        ],
      }),
    );
    process.env.MOS_OWNER_EMAIL_VILLA_GLORY = "env-wins@example.test";
    process.env.MOS_DRIVE_FOLDER_ID_VILLA_GLORY = "env-wins-folder";
    const villa = loadBrandRegistry({
      brandsRoot: root,
      forceReload: true,
    }).brands.find((b) => b.brand_id === "VILLA_GLORY");
    expect(villa?.owner_email).toBe("env-wins@example.test");
    expect(villa?.asset_drive_folder_id).toBe("env-wins-folder");
  });

  it("rejects invalid MOS_REGISTRY_LOCAL_JSON", () => {
    expect(() =>
      applyRegistryEnvOverlay(loadBrandRegistry({ forceReload: true }), {
        MOS_REGISTRY_LOCAL_JSON: "{not-json",
      }),
    ).toThrow(/MOS_REGISTRY_LOCAL_JSON is not valid JSON/);
  });
});
