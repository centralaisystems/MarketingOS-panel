import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  handlePanelApi,
  MemoryOpsStore,
  type PanelApiContext,
} from "@marketing-os/runtime";

function ctx(store = new MemoryOpsStore()): PanelApiContext {
  const reportRoot = mkdtempSync(join(tmpdir(), "mos-panel-reports-"));
  return { store, writeReport: false, reportRoot };
}

async function api(
  ctx: PanelApiContext,
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
    ctx,
  );
}

describe("Wave 3 panel API", () => {
  it("builds a Villa Glory draft pack and records guardian/approvable status", async () => {
    const c = ctx();
    const created = await api(c, "POST", "/api/campaign-packs", {
      body: {
        brand_id: "VILLA_GLORY",
        objective: "Draft social plan for qualified enquiries",
      },
    });
    expect(created.status).toBe(200);
    const body = created.body as {
      brand_id: string;
      pack_id: string;
      campaign_id: string;
      guardian: { passed: boolean; reasons: string[] };
      approvable: boolean;
      live_publish: boolean;
      live_ads: boolean;
      approval_id: string | null;
    };
    expect(body.brand_id).toBe("VILLA_GLORY");
    expect(body.live_publish).toBe(false);
    expect(body.live_ads).toBe(false);
    expect(body.pack_id).toMatch(
      /^[0-9a-f-]{36}$/i,
    );
    if (body.guardian.passed) {
      expect(body.approvable).toBe(true);
      expect(body.approval_id).toBeTruthy();
    } else {
      expect(body.approvable).toBe(false);
      expect(body.guardian.reasons.length).toBeGreaterThan(0);
    }

    const listed = await api(c, "GET", "/api/campaigns", {
      query: { brand_id: "VILLA_GLORY" },
    });
    expect(listed.status).toBe(200);
    const campaigns = (listed.body as { campaigns: Array<{ brand_id: string }> })
      .campaigns;
    expect(campaigns.length).toBe(1);
    expect(campaigns.every((row) => row.brand_id === "VILLA_GLORY")).toBe(true);

    rmSync(c.reportRoot ?? "", { recursive: true, force: true });
  });

  it("denies cross-brand campaign and approval reads", async () => {
    const c = ctx();
    const created = await api(c, "POST", "/api/campaign-packs", {
      body: {
        brand_id: "VILLA_GLORY",
        objective: "Draft social plan for qualified enquiries",
      },
    });
    expect(created.status).toBe(200);
    const { campaign_id } = created.body as { campaign_id: string };

    const lotinList = await api(c, "GET", "/api/campaigns", {
      query: { brand_id: "LOTIN" },
    });
    expect(lotinList.status).toBe(200);
    expect(
      (lotinList.body as { campaigns: unknown[] }).campaigns,
    ).toEqual([]);

    const crossGet = await api(c, "GET", `/api/campaigns/${campaign_id}`, {
      query: { brand_id: "LOTIN" },
    });
    expect(crossGet.status).toBe(404);

    const villaGet = await api(c, "GET", `/api/campaigns/${campaign_id}`, {
      query: { brand_id: "VILLA_GLORY" },
    });
    expect(villaGet.status).toBe(200);
    expect((villaGet.body as { brand_id: string }).brand_id).toBe(
      "VILLA_GLORY",
    );

    const lotinInbox = await api(c, "GET", "/api/approvals", {
      query: { brand_id: "LOTIN" },
    });
    expect(
      (lotinInbox.body as { approvals: unknown[] }).approvals,
    ).toEqual([]);

    const lotinAudit = await api(c, "GET", "/api/audit", {
      query: { brand_id: "LOTIN" },
    });
    expect((lotinAudit.body as { events: unknown[] }).events).toEqual([]);

    rmSync(c.reportRoot ?? "", { recursive: true, force: true });
  });

  it("requires brand_id and blocks live publish/ads endpoints", async () => {
    const c = ctx();
    const missing = await api(c, "GET", "/api/campaigns");
    expect(missing.status).toBe(400);
    expect((missing.body as { error: string }).error).toMatch(/brand_id/);

    const publish = await api(c, "POST", "/api/publish", {
      body: { brand_id: "VILLA_GLORY" },
    });
    expect(publish.status).toBe(403);
    expect((publish.body as { live_publish: boolean }).live_publish).toBe(
      false,
    );

    const ads = await api(c, "POST", "/api/ads/launch", {
      body: { brand_id: "LOTIN" },
    });
    expect(ads.status).toBe(403);

    const unknown = await api(c, "POST", "/api/campaign-packs", {
      body: { brand_id: "NOT_A_REAL_BRAND", objective: "Draft a plan" },
    });
    expect(unknown.status).toBe(400);

    rmSync(c.reportRoot ?? "", { recursive: true, force: true });
  });

  it("lists registry brands without mixing ops rows", async () => {
    const c = ctx();
    const res = await api(c, "GET", "/api/brands");
    expect(res.status).toBe(200);
    const body = res.body as {
      brands: Array<{ brand_id: string }>;
      gates: { enabled_waves: string[]; live_publish_allowed: boolean };
    };
    const ids = body.brands.map((b) => b.brand_id);
    expect(ids).toEqual(
      expect.arrayContaining(["LOTIN", "VILLA_GLORY", "NOX_FORM", "NOX_TECH"]),
    );
    expect(body.gates.enabled_waves).toContain("WAVE_3_DB_PANEL");
    expect(body.gates.live_publish_allowed).toBe(false);
    rmSync(c.reportRoot ?? "", { recursive: true, force: true });
  });
});
