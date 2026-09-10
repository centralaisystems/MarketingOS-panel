import { describe, expect, it } from "vitest";
import { DEFAULT_DRIVE_FIXTURE_TREES, listBrandIds } from "@marketing-os/runtime";
import { listSmokeBrandIds, SMOKE_PACK_OBJECTIVE } from "../scripts/smoke-brands.ts";

describe("all-brands fixture smoke coverage", () => {
  it("covers every ACTIVE registry brand_id (not a closed four-brand enum)", () => {
    const active = listBrandIds();
    const smoke = listSmokeBrandIds();
    expect(smoke).toEqual(active);
    expect(smoke).toEqual(
      expect.arrayContaining(["LOTIN", "VILLA_GLORY", "NOX_FORM", "NOX_TECH"]),
    );
    expect(new Set(smoke).size).toBe(smoke.length);
    for (const id of smoke) {
      expect(
        DEFAULT_DRIVE_FIXTURE_TREES[id],
        `ACTIVE brand ${id} needs a fixture Drive tree for pnpm smoke:brands`,
      ).toBeTruthy();
    }
  });

  it("uses a short generic objective that does not invent VERIFIED claims", () => {
    expect(SMOKE_PACK_OBJECTIVE).toMatch(/No commercial claims/i);
    expect(SMOKE_PACK_OBJECTIVE).not.toMatch(/VERIFIED|ROI|award|SKU/i);
  });
});
