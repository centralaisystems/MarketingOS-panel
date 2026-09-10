import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createAssetCatalog,
  handlePanelApi,
  MemoryOpsStore,
  WAVE4_ASSET_IDS,
  type PanelApiContext,
} from "@marketing-os/runtime";

function ctx(store = new MemoryOpsStore()): PanelApiContext {
  const reportRoot = mkdtempSync(join(tmpdir(), "mos-panel-reports-"));
  return {
    store,
    assets: createAssetCatalog({ seedFixtures: true }),
    writeReport: false,
    reportRoot,
  };
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
    expect(body.gates.enabled_waves).toContain("WAVE_4_ANALYTICS_ASSETS");
    expect(body.gates.enabled_waves).toContain("WAVE_4B_ASSET_PIPELINE");
    expect(body.gates.enabled_waves).toContain("WAVE_5_SOCIAL_PUBLISH");
    expect(body.gates.enabled_waves).toContain("WAVE_6_PAID_ADS");
    expect(body.gates.enabled_waves).toContain("WAVE_7_CRM");
    expect(body.gates.enabled_waves).toContain("WAVE_8_AUTOMATION_DASHBOARD");
    expect(body.gates.live_publish_allowed).toBe(false);
    rmSync(c.reportRoot ?? "", { recursive: true, force: true });
  });

  it("lists asset metadata and analytics/AI visibility without write side effects", async () => {
    const c = ctx();
    const assets = await api(c, "GET", "/api/assets", {
      query: {
        brand_id: "VILLA_GLORY",
        usage_tag: "living-room",
        unused_only: "true",
        approval_status: "APPROVED",
        platform: "instagram",
      },
    });
    expect(assets.status).toBe(200);
    const assetBody = assets.body as {
      brand_id: string;
      write_scopes: unknown[];
      stores_binaries_in_git: boolean;
      assets: Array<{ asset_id: string; brand_id: string }>;
    };
    expect(assetBody.brand_id).toBe("VILLA_GLORY");
    expect(assetBody.write_scopes).toEqual([]);
    expect(assetBody.stores_binaries_in_git).toBe(false);
    expect(assetBody.assets.every((a) => a.brand_id === "VILLA_GLORY")).toBe(true);
    expect(assetBody.assets.map((a) => a.asset_id)).toEqual(
      expect.arrayContaining([
        WAVE4_ASSET_IDS.VG_LIVING_UNUSED_A,
        WAVE4_ASSET_IDS.VG_LIVING_UNUSED_B,
      ]),
    );
    expect(assetBody.assets.map((a) => a.asset_id)).not.toContain(
      WAVE4_ASSET_IDS.VG_LIVING_USED,
    );

    const lotinAssets = await api(c, "GET", "/api/assets", {
      query: { brand_id: "LOTIN" },
    });
    expect(
      (lotinAssets.body as { assets: Array<{ brand_id: string; asset_id: string }> })
        .assets
        .every((a) => a.brand_id === "LOTIN"),
    ).toBe(true);
    expect(
      (lotinAssets.body as { assets: Array<{ asset_id: string }> }).assets.some(
        (a) => a.asset_id === WAVE4_ASSET_IDS.VG_LIVING_UNUSED_A,
      ),
    ).toBe(false);

    const crossAsset = await api(
      c,
      "GET",
      `/api/assets/${WAVE4_ASSET_IDS.VG_LIVING_UNUSED_A}`,
      { query: { brand_id: "LOTIN" } },
    );
    expect(crossAsset.status).toBe(404);

    const analytics = await api(c, "GET", "/api/analytics", {
      query: { brand_id: "VILLA_GLORY" },
    });
    expect(analytics.status).toBe(200);
    const snap = analytics.body as {
      brand_id: string;
      write_scopes: unknown[];
      live_keys_used: boolean;
      providers: Array<{ rows: Array<{ brand_id: string }> }>;
    };
    expect(snap.brand_id).toBe("VILLA_GLORY");
    expect(snap.write_scopes).toEqual([]);
    expect(snap.live_keys_used).toBe(false);
    expect(
      snap.providers.every((p) => p.rows.every((r) => r.brand_id === "VILLA_GLORY")),
    ).toBe(true);

    const visibility = await api(c, "GET", "/api/ai-visibility", {
      query: { brand_id: "VILLA_GLORY" },
    });
    expect(visibility.status).toBe(200);
    const vis = visibility.body as {
      brand_id: string;
      invented_verified_claims: boolean;
      live_probe: boolean;
      write_scopes: unknown[];
    };
    expect(vis.brand_id).toBe("VILLA_GLORY");
    expect(vis.invented_verified_claims).toBe(false);
    expect(vis.live_probe).toBe(false);
    expect(vis.write_scopes).toEqual([]);

    const writeAnalytics = await api(c, "POST", "/api/analytics/write", {
      body: { brand_id: "VILLA_GLORY", event: "purchase" },
    });
    expect(writeAnalytics.status).toBe(403);
    expect((writeAnalytics.body as { write_scopes: unknown[] }).write_scopes).toEqual(
      [],
    );

    const writeAssets = await api(c, "POST", "/api/assets", {
      body: { brand_id: "VILLA_GLORY", bytes: "nope" },
    });
    expect(writeAssets.status).toBe(403);

    const liveProbe = await api(c, "POST", "/api/ai-visibility/probe", {
      body: { brand_id: "VILLA_GLORY", question: "What is Villa Glory?" },
    });
    expect(liveProbe.status).toBe(403);

    rmSync(c.reportRoot ?? "", { recursive: true, force: true });
  });
});
