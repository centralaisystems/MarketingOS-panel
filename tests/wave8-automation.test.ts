import { afterEach, describe, expect, it } from "vitest";
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
  buildDailyDigest,
  buildExecutiveDashboard,
  clearBrandRegistryCache,
  containsRawPii,
  createEmailAdapter,
  handlePanelApi,
  ingestVillaGloryFixtureLeads,
  loadPhaseGates,
  MemoryOpsStore,
  runAutomationDigest,
  WAVE7_VILLA_GLORY_FORM_FIXTURE,
  WAVE8_DIGEST_SECTIONS,
  wave7RawPiiSamples,
  type PanelApiContext,
} from "@marketing-os/runtime";

const REPO_BRANDS = join(process.cwd(), "brands");

function ctx(store = new MemoryOpsStore()): PanelApiContext & { reportRoot: string } {
  const reportRoot = mkdtempSync(join(tmpdir(), "mos-wave8-"));
  return {
    store,
    writeReport: false,
    reportRoot,
    email: createEmailAdapter({ mode: "dry_run" }),
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

function assertNoRawPii(value: unknown, label: string): void {
  expect(containsRawPii(value), `${label} must not contain raw PII`).toBe(false);
  const blob = JSON.stringify(value);
  for (const sample of wave7RawPiiSamples()) {
    expect(blob, `${label} leaked ${sample}`).not.toContain(sample);
  }
}

describe("Wave 8 automation digests + executive dashboard", () => {
  const temps: string[] = [];
  afterEach(() => {
    clearBrandRegistryCache();
    for (const dir of temps) {
      rmSync(dir, { recursive: true, force: true });
    }
    temps.length = 0;
  });

  it("enables WAVE_8 while live publish/ads stay off", () => {
    const gates = loadPhaseGates();
    expect(gates.enabled_waves).toContain("WAVE_8_AUTOMATION_DASHBOARD");
    expect(gates.enabled_waves).toContain("WAVE_7_CRM");
    expect(gates.live_publish_allowed).toBe(false);
    expect(gates.live_ads_allowed).toBe(false);
    expect(WAVE8_DIGEST_SECTIONS).toEqual([
      "today",
      "campaigns",
      "approvals",
      "leads",
      "analytics",
      "costs",
    ]);
  });

  it("dry-runs a Villa Glory daily digest to outbox without raw email/phone", async () => {
    const c = ctx();
    temps.push(c.reportRoot);
    const pack = await api(c, "POST", "/api/campaign-packs", {
      body: {
        brand_id: "VILLA_GLORY",
        objective: "Draft social plan for qualified enquiries",
      },
    });
    expect(pack.status).toBe(200);
    const campaign_id = (pack.body as { campaign_id: string }).campaign_id;
    ingestVillaGloryFixtureLeads({
      store: c.store,
      brand_id: "VILLA_GLORY",
      campaign_id,
    });

    const ran = await api(c, "POST", "/api/digests", {
      body: { brand_id: "VILLA_GLORY", period: "daily" },
    });
    expect(ran.status).toBe(200);
    const body = ran.body as {
      brand_id: string;
      status: string;
      digest: {
        brand_id: string;
        counts: { lead_count: number; attributed_lead_count: number };
        payload: Record<string, unknown>;
      };
      record: { summary: Record<string, unknown> };
      email_outbox_id?: string;
      live_publish: boolean;
      live_ads: boolean;
    };
    expect(body.brand_id).toBe("VILLA_GLORY");
    expect(body.status).toBe("RECORDED");
    expect(body.digest.counts.lead_count).toBe(2);
    expect(body.digest.counts.attributed_lead_count).toBe(2);
    expect(body.live_publish).toBe(false);
    expect(body.live_ads).toBe(false);
    expect(body.email_outbox_id).toBeTruthy();
    assertNoRawPii(body.digest, "digest");
    assertNoRawPii(body.digest.payload, "digest payload");
    assertNoRawPii(body.record.summary, "digest summary");

    const outbox = await api(c, "GET", "/api/email-outbox", {
      query: { brand_id: "VILLA_GLORY" },
    });
    expect(outbox.status).toBe(200);
    const items = (outbox.body as { items: Array<{
      template: string;
      brand_id: string;
      text_body: string;
      html_body: string;
      payload: Record<string, unknown>;
    }> }).items;
    const digestMail = items.find((row) => row.template === "AUTOMATION_DIGEST");
    expect(digestMail).toBeTruthy();
    expect(digestMail?.brand_id).toBe("VILLA_GLORY");
    assertNoRawPii(
      {
        text_body: digestMail?.text_body,
        html_body: digestMail?.html_body,
        payload: digestMail?.payload,
      },
      "digest outbox content",
    );
    expect(digestMail?.text_body).toMatch(/Leads \(count only\)/);
    expect(digestMail?.text_body).not.toContain(
      WAVE7_VILLA_GLORY_FORM_FIXTURE.inbound.email,
    );

    const lotinOutbox = await api(c, "GET", "/api/email-outbox", {
      query: { brand_id: "LOTIN" },
    });
    expect(lotinOutbox.status).toBe(200);
    const lotinItems = (lotinOutbox.body as { items: Array<{ brand_id: string }> })
      .items;
    expect(lotinItems.every((row) => row.brand_id === "LOTIN")).toBe(true);
    expect(lotinItems.some((row) => JSON.stringify(row).includes("VILLA_GLORY"))).toBe(
      false,
    );

    const lotinDigests = await api(c, "GET", "/api/digests", {
      query: { brand_id: "LOTIN" },
    });
    expect(lotinDigests.status).toBe(200);
    expect((lotinDigests.body as { items: unknown[] }).items).toEqual([]);
  });

  it("blocks send when the per-brand automation kill switch is off", async () => {
    const c = ctx();
    temps.push(c.reportRoot);
    const lotin = await api(c, "POST", "/api/digests", {
      body: { brand_id: "LOTIN", period: "daily" },
    });
    expect(lotin.status).toBe(403);
    expect((lotin.body as { error: string }).error).toMatch(/AUTOMATION_DISABLED/);
    const lotinOutbox = await api(c, "GET", "/api/email-outbox", {
      query: { brand_id: "LOTIN" },
    });
    expect((lotinOutbox.body as { items: unknown[] }).items).toEqual([]);

    const listed = await api(c, "GET", "/api/digests", {
      query: { brand_id: "LOTIN" },
    });
    const records = (listed.body as { items: Array<{ status: string; blocked_reason?: string }> })
      .items;
    expect(records[0]?.status).toBe("BLOCKED");
    expect(records[0]?.blocked_reason).toBe("AUTOMATION_DISABLED");
  });

  it("blocks Villa Glory send when automation_enabled is flipped off", async () => {
    const root = mkdtempSync(join(tmpdir(), "mos-wave8-reg-"));
    temps.push(root);
    cpSync(REPO_BRANDS, root, { recursive: true });
    const regPath = join(root, "_shared", "REGISTRY.json");
    const reg = JSON.parse(readFileSync(regPath, "utf8")) as {
      brands: Array<Record<string, unknown>>;
    };
    const vg = reg.brands.find((b) => b.brand_id === "VILLA_GLORY");
    expect(vg).toBeTruthy();
    vg!.automation_enabled = false;
    writeFileSync(regPath, JSON.stringify(reg, null, 2));
    clearBrandRegistryCache();

    const store = new MemoryOpsStore();
    const result = await runAutomationDigest({
      brand_id: "VILLA_GLORY",
      store,
      period: "weekly",
      brandsRoot: root,
    });
    expect(result.status).toBe("BLOCKED");
    expect(result.blocked_reason).toBe("AUTOMATION_DISABLED");
    expect(result.email_outbox_id).toBeUndefined();
    expect(store.listOutbox("VILLA_GLORY")).toEqual([]);
    expect(store.listAutomationDigests("VILLA_GLORY")[0]?.status).toBe("BLOCKED");
  });

  it("serves a brand-scoped executive dashboard and rejects cross-brand reads", async () => {
    const c = ctx();
    temps.push(c.reportRoot);
    await api(c, "POST", "/api/campaign-packs", {
      body: {
        brand_id: "VILLA_GLORY",
        objective: "Draft social plan for qualified enquiries",
      },
    });
    const dash = await api(c, "GET", "/api/dashboard", {
      query: { brand_id: "VILLA_GLORY" },
    });
    expect(dash.status).toBe(200);
    const body = dash.body as {
      brand_id: string;
      today: { campaign_count: number };
      campaigns: { total: number };
      approvals: { pending: number };
      leads: { total: number };
      analytics: { status: string; live_keys_used: boolean };
      costs: { status: string; live_spend: boolean };
      live_publish: boolean;
      live_ads: boolean;
    };
    expect(body.brand_id).toBe("VILLA_GLORY");
    expect(body.today.campaign_count).toBeGreaterThanOrEqual(1);
    expect(body.campaigns.total).toBeGreaterThanOrEqual(1);
    expect(body.analytics.status).toBe("FIXTURE");
    expect(body.analytics.live_keys_used).toBe(false);
    expect(body.costs.status).toBe("PLACEHOLDER");
    expect(body.costs.live_spend).toBe(false);
    expect(body.live_publish).toBe(false);
    expect(body.live_ads).toBe(false);
    assertNoRawPii(body, "dashboard");

    const lotinDash = await api(c, "GET", "/api/dashboard", {
      query: { brand_id: "LOTIN" },
    });
    expect(lotinDash.status).toBe(200);
    const lotin = lotinDash.body as { brand_id: string; today: { campaign_count: number } };
    expect(lotin.brand_id).toBe("LOTIN");
    expect(lotin.today.campaign_count).toBe(0);

    const mismatch = await api(c, "POST", "/api/digests", {
      query: { brand_id: "LOTIN" },
      body: { brand_id: "VILLA_GLORY", period: "daily" },
    });
    expect(mismatch.status).toBe(403);
    expect((mismatch.body as { error: string }).error).toBe("CROSS_BRAND_DENIED");
  });

  it("builds a daily digest helper for one brand only", () => {
    const store = new MemoryOpsStore();
    const digest = buildDailyDigest({ brand_id: "VILLA_GLORY", store });
    expect(digest.brand_id).toBe("VILLA_GLORY");
    expect(digest.period).toBe("daily");
    expect(digest.items.every((item) => item.brand_id === "VILLA_GLORY")).toBe(true);
    const dash = buildExecutiveDashboard({ brand_id: "LOTIN", store });
    expect(dash.brand_id).toBe("LOTIN");
    expect(dash.automation_enabled).toBe(false);
    expect(dash.today.campaign_count).toBe(0);
  });
});
