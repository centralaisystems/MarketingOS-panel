import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  containsRawPii,
  createLeadDraft,
  FileOpsStore,
  handlePanelApi,
  ingestVillaGloryFixtureLeads,
  listCampaignAttribution,
  listLeadsWithAttribution,
  loadPhaseGates,
  MemoryOpsStore,
  SealedPiiVault,
  toAgentLeadSummary,
  WAVE7_VILLA_GLORY_FORM_FIXTURE,
  WAVE7_VILLA_GLORY_WHATSAPP_FIXTURE,
  wave7RawPiiSamples,
  type PanelApiContext,
} from "@marketing-os/runtime";
import { InMemoryMemoryStore, InMemoryAuditSink } from "@marketing-os/runtime";

function ctx(store = new MemoryOpsStore()): PanelApiContext & { reportRoot: string } {
  const reportRoot = mkdtempSync(join(tmpdir(), "mos-wave7-"));
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

async function villaCampaign(c: PanelApiContext) {
  const created = await api(c, "POST", "/api/campaign-packs", {
    body: {
      brand_id: "VILLA_GLORY",
      objective: "Draft social plan for qualified enquiries",
    },
  });
  expect(created.status).toBe(200);
  return created.body as {
    campaign_id: string;
    pack_id: string;
    objective: string;
  };
}

function assertNoRawPii(value: unknown, label: string): void {
  expect(containsRawPii(value), `${label} must not contain raw PII`).toBe(false);
  const blob = JSON.stringify(value);
  for (const sample of wave7RawPiiSamples()) {
    expect(blob, `${label} leaked ${sample}`).not.toContain(sample);
  }
}

describe("Wave 7 CRM leads + attribution", () => {
  const temps: string[] = [];
  afterEach(() => {
    for (const dir of temps) {
      rmSync(dir, { recursive: true, force: true });
    }
    temps.length = 0;
  });

  it("enables WAVE_7 while live flags stay false", () => {
    const gates = loadPhaseGates();
    expect(gates.enabled_waves).toContain("WAVE_7_CRM");
    expect(gates.live_publish_allowed).toBe(false);
    expect(gates.live_ads_allowed).toBe(false);
    expect(WAVE7_VILLA_GLORY_FORM_FIXTURE.brand_id).toBe("VILLA_GLORY");
    expect(WAVE7_VILLA_GLORY_WHATSAPP_FIXTURE.source).toBe("WHATSAPP");
  });

  it("rejects raw PII in pii_ref even when the wave is enabled", () => {
    expect(() =>
      createLeadDraft({
        brand_id: "VILLA_GLORY",
        pii_ref: "person@example.com",
        source: "FORM",
      }),
    ).toThrow(/opaque/);
    expect(() =>
      createLeadDraft({
        brand_id: "VILLA_GLORY",
        pii_ref: "+15550009999",
        source: "WHATSAPP",
      }),
    ).toThrow(/opaque/);
  });

  it("attributes Villa Glory fixture leads to a campaign without exposing email/phone", async () => {
    const c = ctx();
    temps.push(c.reportRoot);
    const vault = new SealedPiiVault();
    const pack = await villaCampaign(c);
    const ingested = ingestVillaGloryFixtureLeads({
      store: c.store,
      vault,
      brand_id: "VILLA_GLORY",
      campaign_id: pack.campaign_id,
    });

    expect(ingested.leads).toHaveLength(2);
    expect(ingested.opportunities).toHaveLength(1);
    expect(
      ingested.leads.every((row) => row.campaign_id === pack.campaign_id),
    ).toBe(true);
    expect(ingested.leads.map((row) => row.pii_ref).sort()).toEqual([
      "vault:vg_form_enquiry_01",
      "vault:vg_whatsapp_enquiry_01",
    ]);

    const rows = listLeadsWithAttribution(c.store, "VILLA_GLORY");
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.attributed)).toBe(true);
    expect(rows.every((row) => row.campaign_objective)).toBeTruthy();

    const attribution = listCampaignAttribution(c.store, "VILLA_GLORY");
    expect(attribution.unattributed_count).toBe(0);
    expect(attribution.campaigns).toHaveLength(1);
    expect(attribution.campaigns[0]?.campaign_id).toBe(pack.campaign_id);
    expect(attribution.campaigns[0]?.lead_count).toBe(2);

    for (const summary of ingested.agent_summaries) {
      const parsed = toAgentLeadSummary(
        ingested.leads.find((row) => row.lead_id === summary.lead_id)!,
        vault,
      );
      expect(parsed.pii_ref.startsWith("vault:")).toBe(true);
      assertNoRawPii(parsed, "agent summary");
    }

    const runs = c.store.listAgentRuns("VILLA_GLORY");
    const crmRuns = runs.filter(
      (row) => row.agent === "A12_CRM_LEAD_INTELLIGENCE",
    );
    expect(crmRuns.length).toBeGreaterThanOrEqual(2);
    assertNoRawPii(crmRuns, "agent runs");

    const events = c.store.listLeadEvents("VILLA_GLORY");
    expect(events.some((e) => e.kind === "INGESTED")).toBe(true);
    expect(events.some((e) => e.kind === "ATTRIBUTED")).toBe(true);
    assertNoRawPii(events, "lead events");

    const audit = c.store.listAudit("VILLA_GLORY", { limit: 100 });
    expect(audit.some((e) => e.event_type === "LEAD_INGESTED")).toBe(true);
    expect(audit.some((e) => e.event_type === "LEAD_ATTRIBUTED")).toBe(true);
    assertNoRawPii(audit, "audit");

    const memory = new InMemoryMemoryStore(new InMemoryAuditSink());
    for (const summary of ingested.agent_summaries) {
      memory.createDraft({
        brand_id: "VILLA_GLORY",
        observation: `Fixture lead ${summary.pii_ref} attributed=${summary.attributed}`,
        source: "wave7-crm-test",
        confidence: "MEDIUM",
        campaign_id: pack.campaign_id,
      });
    }
    assertNoRawPii(memory.list("VILLA_GLORY"), "brand memory");

    expect(vault.peekRawForTest("vault:vg_form_enquiry_01")?.email).toBe(
      WAVE7_VILLA_GLORY_FORM_FIXTURE.inbound.email,
    );
  });

  it("denies cross-brand reads and fixture ingest", async () => {
    const c = ctx();
    temps.push(c.reportRoot);
    const pack = await villaCampaign(c);
    const ingested = await api(c, "POST", "/api/leads/ingest-fixtures", {
      body: {
        brand_id: "VILLA_GLORY",
        campaign_id: pack.campaign_id,
      },
    });
    expect(ingested.status).toBe(200);
    const villaList = ingested.body as {
      leads: Array<{ brand_id: string; pii_ref: string }>;
      agent_summaries: unknown[];
    };
    expect(villaList.leads).toHaveLength(2);
    assertNoRawPii(ingested.body, "panel ingest response");

    const lotinList = await api(c, "GET", "/api/leads", {
      query: { brand_id: "LOTIN" },
    });
    expect(lotinList.status).toBe(200);
    expect((lotinList.body as { items: unknown[] }).items).toEqual([]);

    const lotinAttr = await api(c, "GET", "/api/leads/attribution", {
      query: { brand_id: "LOTIN" },
    });
    expect((lotinAttr.body as { campaigns: unknown[] }).campaigns).toEqual([]);

    const lotinFixtures = await api(c, "POST", "/api/leads/ingest-fixtures", {
      body: { brand_id: "LOTIN", campaign_id: pack.campaign_id },
    });
    expect(lotinFixtures.status).toBeGreaterThanOrEqual(400);
    expect((lotinFixtures.body as { error: string }).error).toMatch(
      /Villa Glory first|CROSS_BRAND|not found|denied/i,
    );

    const mismatch = await api(c, "GET", "/api/leads", {
      query: { brand_id: "LOTIN" },
    });
    expect(
      ((mismatch.body as { items: Array<{ brand_id: string }> }).items ?? []).every(
        (row) => row.brand_id !== "VILLA_GLORY",
      ),
    ).toBe(true);
  });

  it("round-trips leads in the file store without leaking another brand", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mos-wave7-ops-"));
    temps.push(dir);
    const store = new FileOpsStore(dir);
    const c = ctx(store);
    temps.push(c.reportRoot);
    const pack = await villaCampaign(c);
    ingestVillaGloryFixtureLeads({
      store,
      brand_id: "VILLA_GLORY",
      campaign_id: pack.campaign_id,
    });
    const reloaded = new FileOpsStore(dir);
    expect(reloaded.listLeads("VILLA_GLORY")).toHaveLength(2);
    expect(reloaded.listLeads("LOTIN")).toHaveLength(0);
    expect(reloaded.getLead("LOTIN", reloaded.listLeads("VILLA_GLORY")[0]!.lead_id)).toBeNull();
    assertNoRawPii(reloaded.exportSnapshot(), "file ops snapshot");
  });
});
