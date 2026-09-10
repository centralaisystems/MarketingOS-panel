import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  CampaignPackSchema,
  type OpsCampaignRecord,
} from "@marketing-os/contracts";
import {
  MemoryOpsRemoteClient,
  SupabaseOpsStore,
  campaignFromRow,
  campaignToRow,
  createOpsStore,
  createOpsStoreAsync,
  createSupabaseOpsRemoteFromEnv,
  resolveOpsStoreBackend,
  supabaseOpsEnvError,
} from "@marketing-os/runtime";

function stubPack(brand_id: "LOTIN" | "VILLA_GLORY") {
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

function stubCampaign(brand_id: "LOTIN" | "VILLA_GLORY"): OpsCampaignRecord {
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

describe("ops store backend selection", () => {
  const prevStore = process.env.MOS_OPS_STORE;
  const prevBackend = process.env.MOS_OPS_BACKEND;
  afterEach(() => {
    if (prevStore === undefined) delete process.env.MOS_OPS_STORE;
    else process.env.MOS_OPS_STORE = prevStore;
    if (prevBackend === undefined) delete process.env.MOS_OPS_BACKEND;
    else process.env.MOS_OPS_BACKEND = prevBackend;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  it("defaults to file and never requires live Supabase for createOpsStore", () => {
    delete process.env.MOS_OPS_STORE;
    delete process.env.MOS_OPS_BACKEND;
    expect(resolveOpsStoreBackend()).toBe("file");
    expect(() => createOpsStore({ backend: "memory" })).not.toThrow();
    expect(() => createOpsStore({ backend: "supabase" })).toThrow(
      /createOpsStoreAsync/,
    );
  });

  it("refuses supabase without env vars", () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(supabaseOpsEnvError().message).toMatch(/SUPABASE_URL/);
    expect(() => createSupabaseOpsRemoteFromEnv()).toThrow(/SUPABASE_URL/);
  });

  it("honors MOS_OPS_STORE over MOS_OPS_BACKEND", () => {
    process.env.MOS_OPS_BACKEND = "memory";
    process.env.MOS_OPS_STORE = "file";
    expect(resolveOpsStoreBackend()).toBe("file");
  });
});

describe("SupabaseOpsStore mapping (injected remote, no network)", () => {
  it("write-through + hydrate keeps brand isolation", async () => {
    const remote = new MemoryOpsRemoteClient();
    const store = await createOpsStoreAsync({ backend: "supabase", remote });
    const villa = stubCampaign("VILLA_GLORY");
    const lotin = stubCampaign("LOTIN");
    store.insertCampaign("VILLA_GLORY", villa);
    store.insertCampaign("LOTIN", lotin);
    await store.flush();

    expect(store.listCampaigns("LOTIN")).toHaveLength(1);
    expect(store.listCampaigns("VILLA_GLORY")).toHaveLength(1);
    expect(store.getCampaign("LOTIN", villa.campaign_id)).toBeNull();

    const brands = await remote.select("brands");
    expect(brands.map((b) => b.brand_id).sort()).toEqual(["LOTIN", "VILLA_GLORY"]);
    const rows = await remote.select("campaigns");
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.live_publish !== true)).toBe(true);

    const reloaded = await SupabaseOpsStore.connect(remote);
    expect(reloaded.listCampaigns("VILLA_GLORY")[0]?.campaign_id).toBe(
      villa.campaign_id,
    );
    expect(reloaded.getCampaign("LOTIN", villa.campaign_id)).toBeNull();
  });

  it("round-trips a campaign row through the SQL mapper", () => {
    const campaign = stubCampaign("VILLA_GLORY");
    const row = campaignToRow(campaign);
    expect(row.brand_id).toBe("VILLA_GLORY");
    expect(campaignFromRow(row).pack_id).toBe(campaign.pack_id);
    expect(campaignFromRow(row).live_publish).toBeUndefined();
  });
});
