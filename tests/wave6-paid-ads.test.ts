import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import {
  createPaidAdsAdapter,
  envForResearchAgent,
  FileOpsStore,
  handlePanelApi,
  loadPhaseGates,
  MemoryOpsStore,
  researchAgentReceivedAdWriteTokens,
  stagingLaunchAd,
  WAVE6_GOOGLE_PLATFORM,
  WAVE6_META_PLATFORM,
  type PanelApiContext,
} from "@marketing-os/runtime";
import {
  AdOutboxItemSchema,
  AdStagingJobSchema,
  agentHasCapability,
} from "@marketing-os/contracts";

function ctx(store = new MemoryOpsStore()): PanelApiContext & { reportRoot: string } {
  const reportRoot = mkdtempSync(join(tmpdir(), "mos-wave6-"));
  return {
    store,
    writeReport: false,
    reportRoot,
  };
}

async function api(
  c: PanelApiContext,
  method: string,
  pathname: string,
  opts?: { query?: Record<string, string>; body?: unknown },
) {
  const searchParams = new URLSearchParams(opts?.query ?? {});
  return handlePanelApi(
    {
      method,
      pathname,
      searchParams,
      ...(opts?.body !== undefined ? { body: opts.body } : {}),
    },
    c,
  );
}

async function villaApprovedPack(c: PanelApiContext) {
  const created = await api(c, "POST", "/api/campaign-packs", {
    body: {
      brand_id: "VILLA_GLORY",
      objective: "Draft social plan for qualified enquiries",
    },
  });
  expect(created.status).toBe(200);
  const pack = created.body as {
    campaign_id: string;
    pack_id: string;
    approval_id: string | null;
    approvable: boolean;
    guardian: { passed: boolean };
  };
  expect(pack.approvable).toBe(true);
  expect(pack.approval_id).toBeTruthy();
  const decided = await api(c, "POST", `/api/approvals/${pack.approval_id}/decide`, {
    body: {
      brand_id: "VILLA_GLORY",
      decision: "APPROVED",
      rationale: "Internal Level 1 approve for paid staging test",
    },
  });
  expect(decided.status).toBe(200);
  return pack;
}

describe("Wave 6 gated paid ads", () => {
  const temps: string[] = [];
  afterEach(() => {
    for (const dir of temps) {
      rmSync(dir, { recursive: true, force: true });
    }
    temps.length = 0;
    delete process.env.MOS_LIVE_ADS;
    delete process.env.MOS_ADS_SOURCE;
  });

  it("enables WAVE_6 staging while live_ads_allowed stays false", () => {
    const gates = loadPhaseGates();
    expect(gates.enabled_waves).toContain("WAVE_6_PAID_ADS");
    expect(gates.live_ads_allowed).toBe(false);
    expect(WAVE6_META_PLATFORM.brand_id).toBe("VILLA_GLORY");
    expect(WAVE6_META_PLATFORM.platform).toBe("META");
    expect(WAVE6_META_PLATFORM.write_scopes).toEqual([]);
    expect(WAVE6_GOOGLE_PLATFORM.write_scopes).toEqual([]);
    expect(WAVE6_META_PLATFORM.live_credentials_required).toBe(false);

    const simple = stagingLaunchAd({
      brand_id: "VILLA_GLORY",
      staging: true,
      recommendation: {
        brand_id: "VILLA_GLORY",
        platform: "META",
        objective: "Qualified villa enquiries",
        audience_notes: [],
        creative_notes: [],
        budget_notes: ["Recommendation only"],
        test_plan: [],
        launch_allowed: false,
      },
    });
    expect(simple.status).toBe("STAGING_RECORDED");
    expect(() =>
      stagingLaunchAd({
        brand_id: "VILLA_GLORY",
        staging: false,
        recommendation: {
          brand_id: "VILLA_GLORY",
          platform: "META",
          objective: "Qualified villa enquiries",
          audience_notes: [],
          creative_notes: [],
          budget_notes: [],
          test_plan: [],
          launch_allowed: false,
        },
      }),
    ).toThrow(/live_ads_allowed/i);
  });

  it("records a Villa Glory Meta staging job and outbox", async () => {
    const c = ctx();
    temps.push(c.reportRoot);
    const pack = await villaApprovedPack(c);

    const recs = await api(c, "GET", "/api/ads/recommendations", {
      query: { brand_id: "VILLA_GLORY", campaign_id: pack.campaign_id },
    });
    expect(recs.status).toBe(200);
    const eligible = recs.body as {
      brand_id: string;
      live_ads_allowed: boolean;
      items: Array<{
        campaign_id: string;
        recommendations: Array<{ platform: string; launch_allowed: boolean }>;
      }>;
    };
    expect(eligible.brand_id).toBe("VILLA_GLORY");
    expect(eligible.live_ads_allowed).toBe(false);
    expect(eligible.items[0]?.recommendations.length).toBeGreaterThan(0);
    expect(eligible.items[0]?.recommendations[0]?.launch_allowed).toBe(false);

    const staged = await api(c, "POST", "/api/ads/stage", {
      body: {
        brand_id: "VILLA_GLORY",
        campaign_id: pack.campaign_id,
        platform: "META",
        actor: "panel-operator",
        rationale: "Stage Villa Glory Meta draft only",
      },
    });
    expect(staged.status).toBe(200);
    const body = staged.body as {
      brand_id: string;
      status: string;
      staging: boolean;
      would_launch: boolean;
      live_ads: boolean;
      external_side_effects: boolean;
      job: { job_id: string; status: string; platform: string };
      outbox: {
        outbox_id: string;
        platform: string;
        status: string;
        campaign_draft: { adapter: string; budget: { mutation_allowed: boolean } };
      };
    };
    expect(body.brand_id).toBe("VILLA_GLORY");
    expect(body.status).toBe("STAGING_OK");
    expect(body.staging).toBe(true);
    expect(body.would_launch).toBe(true);
    expect(body.live_ads).toBe(false);
    expect(body.external_side_effects).toBe(false);
    expect(body.job.platform).toBe("META");
    expect(body.job.status).toBe("STAGING_RECORDED");
    expect(body.outbox.status).toBe("STAGING_RECORDED");
    expect(body.outbox.campaign_draft.adapter).toBe("meta_ads_staging");
    expect(body.outbox.campaign_draft.budget.mutation_allowed).toBe(false);
    expect(AdOutboxItemSchema.parse(body.outbox).live_ads).toBe(false);
    expect(AdStagingJobSchema.parse(body.job).live_ads).toBe(false);

    const outbox = await api(c, "GET", "/api/ads/outbox", {
      query: { brand_id: "VILLA_GLORY" },
    });
    expect(outbox.status).toBe(200);
    const items = (outbox.body as { items: Array<{ outbox_id: string }> }).items;
    expect(items.some((row) => row.outbox_id === body.outbox.outbox_id)).toBe(true);

    const jobs = await api(c, "GET", "/api/ads/jobs", {
      query: { brand_id: "VILLA_GLORY" },
    });
    expect(
      (jobs.body as { items: Array<{ job_id: string }> }).items.some(
        (row) => row.job_id === body.job.job_id,
      ),
    ).toBe(true);

    const audit = await api(c, "GET", "/api/audit", {
      query: { brand_id: "VILLA_GLORY" },
    });
    expect(
      (audit.body as { events: Array<{ event_type: string }> }).events.some(
        (e) => e.event_type === "AD_STAGING_RECORDED",
      ),
    ).toBe(true);
  });

  it("stages a budget recommendation without mutating spend", async () => {
    const c = ctx();
    temps.push(c.reportRoot);
    const pack = await villaApprovedPack(c);
    const staged = await api(c, "POST", "/api/ads/stage-budget", {
      body: {
        brand_id: "VILLA_GLORY",
        campaign_id: pack.campaign_id,
        platform: "GOOGLE",
        rationale: "Recommend Google budget only",
      },
    });
    expect(staged.status).toBe(200);
    const body = staged.body as {
      action: string;
      would_launch: boolean;
      would_mutate_budget: boolean;
      outbox: { campaign_draft: { adapter: string; budget: { kind: string } } };
    };
    expect(body.action).toBe("BUDGET_MUTATION");
    expect(body.would_launch).toBe(false);
    expect(body.would_mutate_budget).toBe(false);
    expect(body.outbox.campaign_draft.adapter).toBe("google_ads_staging");
    expect(body.outbox.campaign_draft.budget.kind).toBe("RECOMMENDATION");

    const audit = await api(c, "GET", "/api/audit", {
      query: { brand_id: "VILLA_GLORY" },
    });
    expect(
      (audit.body as { events: Array<{ event_type: string }> }).events.some(
        (e) => e.event_type === "AD_BUDGET_STAGING_RECORDED",
      ),
    ).toBe(true);
  });

  it("denies cross-brand staging and hides Villa Glory outbox from LOTIN", async () => {
    const c = ctx();
    temps.push(c.reportRoot);
    const pack = await villaApprovedPack(c);
    const staged = await api(c, "POST", "/api/ads/stage", {
      body: {
        brand_id: "VILLA_GLORY",
        campaign_id: pack.campaign_id,
        rationale: "Villa Glory staging only",
      },
    });
    expect(staged.status).toBe(200);

    const lotinRecs = await api(c, "GET", "/api/ads/recommendations", {
      query: { brand_id: "LOTIN" },
    });
    expect(lotinRecs.status).toBe(200);
    expect((lotinRecs.body as { items: unknown[] }).items).toEqual([]);

    const lotinOutbox = await api(c, "GET", "/api/ads/outbox", {
      query: { brand_id: "LOTIN" },
    });
    expect((lotinOutbox.body as { items: unknown[] }).items).toEqual([]);

    const cross = await api(c, "POST", "/api/ads/stage", {
      body: {
        brand_id: "LOTIN",
        campaign_id: pack.campaign_id,
        rationale: "should be denied",
      },
    });
    expect(cross.status).toBeGreaterThanOrEqual(400);
    expect((cross.body as { error: string }).error).toMatch(
      /not found|CROSS_BRAND|denied/i,
    );
  });

  it("blocks live launch with 403 even after Level 3 approval row", async () => {
    const c = ctx();
    temps.push(c.reportRoot);
    const pack = await villaApprovedPack(c);
    c.store.insertApproval("VILLA_GLORY", {
      approval_id: randomUUID(),
      brand_id: "VILLA_GLORY",
      campaign_id: pack.campaign_id,
      level: "LEVEL_3",
      decision: "APPROVED",
      rationale: "Level 3 recorded; live still gated",
      actor: "approver",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const live = await api(c, "POST", "/api/ads/launch", {
      body: {
        brand_id: "VILLA_GLORY",
        campaign_id: pack.campaign_id,
        live: true,
      },
    });
    expect(live.status).toBe(403);
    const body = live.body as {
      live_ads: boolean;
      blocked: boolean;
      message: string;
    };
    expect(body.live_ads).toBe(false);
    expect(body.blocked).toBe(true);
    expect(body.message).toMatch(/live_ads_allowed is false/i);
    expect(body.message).toMatch(/MOS_LIVE_ADS/i);
    expect(body.message).toMatch(/Level 3/i);

    const audit = await api(c, "GET", "/api/audit", {
      query: { brand_id: "VILLA_GLORY" },
    });
    expect(
      (audit.body as { events: Array<{ event_type: string }> }).events.some(
        (e) => e.event_type === "AD_LAUNCH_LIVE_BLOCKED",
      ),
    ).toBe(true);
  });

  it("rejects packs that are not internally approved", async () => {
    const c = ctx();
    temps.push(c.reportRoot);
    const created = await api(c, "POST", "/api/campaign-packs", {
      body: {
        brand_id: "VILLA_GLORY",
        objective: "Draft social plan for qualified enquiries",
      },
    });
    expect(created.status).toBe(200);
    const pack = created.body as { campaign_id: string };

    const tooEarly = await api(c, "POST", "/api/ads/stage", {
      body: {
        brand_id: "VILLA_GLORY",
        campaign_id: pack.campaign_id,
        rationale: "should fail before Level 1 approve",
      },
    });
    expect(tooEarly.status).toBe(400);
    expect((tooEarly.body as { error: string }).error).toMatch(
      /INTERNAL_APPROVED/,
    );
  });

  it("round-trips ad outbox in the file store without leaking brands", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mos-wave6-ops-"));
    temps.push(dir);
    const store = new FileOpsStore(dir);
    const c = ctx(store);
    temps.push(c.reportRoot);
    const pack = await villaApprovedPack(c);
    const staged = await api(c, "POST", "/api/ads/stage", {
      body: {
        brand_id: "VILLA_GLORY",
        campaign_id: pack.campaign_id,
        rationale: "file store staging",
      },
    });
    expect(staged.status).toBe(200);

    const reloaded = new FileOpsStore(dir);
    expect(reloaded.listAdOutbox("VILLA_GLORY")).toHaveLength(1);
    expect(reloaded.listAdOutbox("LOTIN")).toHaveLength(0);
    expect(reloaded.listAdStagingJobs("VILLA_GLORY")).toHaveLength(1);
    expect(reloaded.listAdStagingJobs("LOTIN")).toHaveLength(0);
  });

  it("optional live-labeled source still refuses when live_ads_allowed is false", () => {
    process.env.MOS_ADS_SOURCE = "meta_api";
    const adapter = createPaidAdsAdapter({ platform: "META" });
    expect(adapter.source).toBe("meta_api");
    expect(adapter.write_scopes).toEqual([]);
    const blocked = adapter.dispatch({
      staging: false,
      action: "LAUNCH",
      draft: {
        brand_id: "VILLA_GLORY",
        platform: "META",
        environment: "non-prod",
        adapter: "meta_ads_staging",
        objective: "Qualified villa enquiries",
        audience_notes: [],
        creative_notes: [],
        test_plan: [],
        budget: {
          kind: "RECOMMENDATION",
          notes: [],
          mutation_allowed: false,
          launch_allowed: false,
        },
        campaign_id: randomUUID(),
        pack_id: randomUUID(),
        launch_allowed: false,
      },
    });
    expect(blocked.status).toBe("LIVE_BLOCKED");
    expect(blocked.would_launch).toBe(false);
  });

  it("never hands ad write tokens to the research agent", () => {
    expect(agentHasCapability("A03_RESEARCH_INTELLIGENCE", "LAUNCH_AD")).toBe(
      false,
    );
    expect(
      agentHasCapability("A03_RESEARCH_INTELLIGENCE", "CHANGE_AD_BUDGET"),
    ).toBe(false);
    const dirty = {
      FOO: "ok",
      META_ADS_ACCESS_TOKEN: "secret-should-not-reach-research",
      GOOGLE_ADS_DEVELOPER_TOKEN: "also-secret",
    };
    const clean = envForResearchAgent(dirty);
    expect(clean.FOO).toBe("ok");
    expect(clean.META_ADS_ACCESS_TOKEN).toBeUndefined();
    expect(clean.GOOGLE_ADS_DEVELOPER_TOKEN).toBeUndefined();
    expect(researchAgentReceivedAdWriteTokens(clean)).toEqual([]);
    expect(researchAgentReceivedAdWriteTokens(dirty)).toEqual([
      "META_ADS_ACCESS_TOKEN",
      "GOOGLE_ADS_DEVELOPER_TOKEN",
    ]);
  });
});
