import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  CrossBrandDeniedError,
  FileOpsStore,
  MemoryOpsStore,
} from "@marketing-os/runtime";
import type { OpsCampaignRecord } from "@marketing-os/contracts";
import { CampaignPackSchema } from "@marketing-os/contracts";

function stubPack(brand_id: "LOTIN" | "VILLA_GLORY"): OpsCampaignRecord["pack"] {
  return CampaignPackSchema.parse({
    pack_id: randomUUID(),
    brand_id,
    objective: "Draft social plan for qualified enquiries",
    generated_at: new Date().toISOString(),
    approval_level_cap: "LEVEL_1",
    guardian: { passed: true, reasons: [], reviewed: ["content"] },
    approvable: true,
    live_publish: false,
    live_ads: false,
  });
}

function stubCampaign(
  brand_id: "LOTIN" | "VILLA_GLORY",
): OpsCampaignRecord {
  const pack = stubPack(brand_id);
  const now = new Date().toISOString();
  return {
    campaign_id: randomUUID(),
    brand_id,
    pack_id: pack.pack_id,
    objective: pack.objective,
    status: "DRAFT",
    pack,
    guardian_passed: true,
    approvable: true,
    created_at: now,
    updated_at: now,
  };
}

describe("ops store brand isolation", () => {
  it("never lists or returns another brand's campaigns", () => {
    const store = new MemoryOpsStore();
    const villa = stubCampaign("VILLA_GLORY");
    store.insertCampaign("VILLA_GLORY", villa);

    expect(store.listCampaigns("LOTIN")).toEqual([]);
    expect(store.getCampaign("LOTIN", villa.campaign_id)).toBeNull();
    expect(store.getCampaign("VILLA_GLORY", villa.campaign_id)?.brand_id).toBe(
      "VILLA_GLORY",
    );
  });

  it("rejects inserting a record under a different brand_id", () => {
    const store = new MemoryOpsStore();
    const villa = stubCampaign("VILLA_GLORY");
    expect(() => store.insertCampaign("LOTIN", villa)).toThrow(
      CrossBrandDeniedError,
    );
  });

  it("keeps approval inbox Level ≤1 and scoped to brand", () => {
    const store = new MemoryOpsStore();
    const now = new Date().toISOString();
    store.insertApproval("VILLA_GLORY", {
      approval_id: randomUUID(),
      brand_id: "VILLA_GLORY",
      level: "LEVEL_1",
      decision: "PENDING",
      created_at: now,
      updated_at: now,
    });
    store.insertApproval("LOTIN", {
      approval_id: randomUUID(),
      brand_id: "LOTIN",
      level: "LEVEL_1",
      decision: "PENDING",
      created_at: now,
      updated_at: now,
    });
    const inbox = store.listApprovals("VILLA_GLORY");
    expect(inbox).toHaveLength(1);
    expect(inbox[0]?.brand_id).toBe("VILLA_GLORY");
  });

  it("file store round-trips one brand without leaking another", () => {
    const dir = mkdtempSync(join(tmpdir(), "mos-ops-"));
    try {
      const store = new FileOpsStore(dir);
      store.insertCampaign("LOTIN", stubCampaign("LOTIN"));
      const reloaded = new FileOpsStore(dir);
      expect(reloaded.listCampaigns("LOTIN")).toHaveLength(1);
      expect(reloaded.listCampaigns("VILLA_GLORY")).toHaveLength(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
