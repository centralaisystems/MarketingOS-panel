import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  CampaignPackSchema,
  type OpsCampaignRecord,
  type OpsTaskRecord,
} from "@marketing-os/contracts";
import {
  MemoryOpsRemoteClient,
  SupabaseOpsStore,
  campaignFromRow,
  campaignToRow,
  createOpsStore,
  createOpsStoreAsync,
  createSupabaseOpsRemoteFromEnv,
  persistCampaignPack,
  resolveOpsStoreBackend,
  supabaseOpsEnvError,
  type OpsRemoteTable,
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

/**
 * PostgREST stand-in that enforces the production FKs and makes parent rows
 * slower than children. Concurrent flush() therefore reproduces
 * `agent_runs_task_id_fkey`; sequential enqueue does not.
 */
class FkEnforcingOpsRemote extends MemoryOpsRemoteClient {
  readonly writeOrder: OpsRemoteTable[] = [];

  override async upsert(
    table: OpsRemoteTable,
    row: Record<string, unknown>,
    onConflict: string,
  ): Promise<void> {
    const child = table === "agent_runs" || table === "approvals";
    await new Promise((resolve) => setTimeout(resolve, child ? 0 : 15));
    this.assertForeignKeys(table, row);
    this.writeOrder.push(table);
    return super.upsert(table, row, onConflict);
  }

  private assertForeignKeys(
    table: OpsRemoteTable,
    row: Record<string, unknown>,
  ): void {
    if (table !== "brands" && typeof row.brand_id === "string") {
      const brands = this.tables.get("brands") ?? [];
      if (!brands.some((b) => b.brand_id === row.brand_id)) {
        throw new Error(
          `insert or update on table "${table}" violates foreign key constraint "${table}_brand_id_fkey"`,
        );
      }
    }
    if (table === "agent_runs" && typeof row.task_id === "string") {
      const tasks = this.tables.get("tasks") ?? [];
      if (!tasks.some((t) => t.task_id === row.task_id)) {
        throw new Error(
          `Supabase REST POST agent_runs?on_conflict=run_id failed (409): insert or update on table "agent_runs" violates foreign key constraint "agent_runs_task_id_fkey" — Key (task_id)=(${row.task_id}) is not present in table "tasks".`,
        );
      }
    }
    if (table === "approvals") {
      if (typeof row.task_id === "string") {
        const tasks = this.tables.get("tasks") ?? [];
        if (!tasks.some((t) => t.task_id === row.task_id)) {
          throw new Error(
            `insert or update on table "approvals" violates foreign key constraint "approvals_task_id_fkey"`,
          );
        }
      }
      if (typeof row.campaign_id === "string") {
        const campaigns = this.tables.get("campaigns") ?? [];
        if (!campaigns.some((c) => c.campaign_id === row.campaign_id)) {
          throw new Error(
            `insert or update on table "approvals" violates foreign key constraint "approvals_campaign_id_fkey"`,
          );
        }
      }
    }
  }
}

function stubTask(brand_id: "VILLA_GLORY"): OpsTaskRecord {
  const now = new Date().toISOString();
  return {
    task_id: randomUUID(),
    brand_id,
    objective: "Draft a short qualified-enquiry plan",
    requested_by: "panel-operator",
    assigned_agent: "A01_MARKETING_DIRECTOR",
    input: {},
    expected_output: "Level-1 campaign pack draft",
    dependencies: [],
    priority: "HIGH",
    approval_level: "LEVEL_1",
    status: "COMPLETED",
    workflow_state: "AWAITING_APPROVAL",
    required_capabilities: ["PRODUCE_INTERNAL_ANALYSIS"],
    created_at: now,
  };
}

describe("SupabaseOpsStore FK write order", () => {
  it("writes the parent tasks row before agent_runs (campaign-pack path)", async () => {
    const remote = new FkEnforcingOpsRemote();
    const store = await createOpsStoreAsync({ backend: "supabase", remote });
    const pack = CampaignPackSchema.parse({
      ...stubPack("VILLA_GLORY"),
      research: { summary: "UNVERIFIED local evidence draft" },
      content_drafts: [{ summary: "Draft enquiry caption — no prices or awards" }],
      live_publish: false,
      live_ads: false,
    });

    const persisted = persistCampaignPack(store, pack, {
      requested_by: "panel-operator",
    });
    await store.flush();

    const taskIdx = remote.writeOrder.indexOf("tasks");
    const runIdx = remote.writeOrder.indexOf("agent_runs");
    const approvalIdx = remote.writeOrder.indexOf("approvals");
    expect(taskIdx).toBeGreaterThanOrEqual(0);
    expect(runIdx).toBeGreaterThan(taskIdx);
    expect(approvalIdx).toBeGreaterThan(taskIdx);
    expect(approvalIdx).toBeGreaterThan(remote.writeOrder.indexOf("campaigns"));

    const tasks = await remote.select("tasks");
    const runs = await remote.select("agent_runs");
    expect(tasks).toHaveLength(1);
    expect(runs.length).toBeGreaterThanOrEqual(2);
    expect(runs.every((r) => r.task_id === persisted.task.task_id)).toBe(true);
    expect(persisted.campaign.pack.live_publish).toBe(false);
    expect(persisted.campaign.pack.live_ads).toBe(false);
  });

  it("insertTask then insertAgentRun survives a mocked agent_runs_task_id_fkey", async () => {
    const remote = new FkEnforcingOpsRemote();
    const store = await createOpsStoreAsync({ backend: "supabase", remote });
    const task = stubTask("VILLA_GLORY");
    store.insertTask("VILLA_GLORY", task);
    store.insertAgentRun("VILLA_GLORY", {
      run_id: randomUUID(),
      brand_id: "VILLA_GLORY",
      task_id: task.task_id,
      agent: "A03_RESEARCH_INTELLIGENCE",
      result: { agent: "A03_RESEARCH_INTELLIGENCE", summary: "UNVERIFIED draft" },
      created_at: task.created_at,
    });
    await store.flush();

    expect(remote.writeOrder.indexOf("tasks")).toBeLessThan(
      remote.writeOrder.indexOf("agent_runs"),
    );
    const runs = await remote.select("agent_runs");
    expect(runs[0]?.task_id).toBe(task.task_id);
  });
});
