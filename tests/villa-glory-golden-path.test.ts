/**
 * Villa Glory golden path (fixture mode) — Waves 4b–8 in one file.
 * Drive sync → campaign pack → optional Figma / Higgsfield → owner-review
 * dry-run → social dry-run → ads stage → CRM fixtures on dashboard/digest.
 * Asserts brand isolation and live publish/ads stay off.
 */
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createAssetCatalog,
  createDriveAssetSource,
  createEmailAdapter,
  createFigmaArrangeAdapter,
  createFigmaArrangeJobStore,
  createHiggsfieldAdapter,
  createHiggsfieldGenerateJobStore,
  handlePanelApi,
  loadPhaseGates,
  MemoryOpsStore,
  type PanelApiContext,
} from "@marketing-os/runtime";

function ctx(): PanelApiContext & { reportRoot: string } {
  const reportRoot = mkdtempSync(join(tmpdir(), "mos-vg-golden-"));
  return {
    store: new MemoryOpsStore(),
    assets: createAssetCatalog({ seedFixtures: false }),
    drive: createDriveAssetSource({ mode: "fixture" }),
    figma: createFigmaArrangeAdapter({ mode: "fixture" }),
    figmaJobs: createFigmaArrangeJobStore({ backend: "memory" }),
    higgsfield: createHiggsfieldAdapter({ mode: "fixture" }),
    higgsfieldJobs: createHiggsfieldGenerateJobStore({ backend: "memory" }),
    email: createEmailAdapter({ mode: "dry_run" }),
    writeReport: false,
    reportRoot,
    panelBaseUrl: "http://127.0.0.1:8787",
  };
}

async function api(
  c: PanelApiContext,
  method: string,
  pathname: string,
  opts?: { query?: Record<string, string>; body?: unknown },
) {
  return handlePanelApi(
    {
      method,
      pathname,
      searchParams: new URLSearchParams(opts?.query ?? {}),
      ...(opts?.body !== undefined ? { body: opts.body } : {}),
    },
    c,
  );
}

function assertLiveOff(body: unknown, label: string): void {
  const rec = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  if ("live_publish" in rec) expect(rec.live_publish, label).toBe(false);
  if ("live_ads" in rec) expect(rec.live_ads, label).toBe(false);
  if ("live_publish_allowed" in rec) {
    expect(rec.live_publish_allowed, label).toBe(false);
  }
  if ("live_ads_allowed" in rec) expect(rec.live_ads_allowed, label).toBe(false);
}

describe("Villa Glory golden path (fixture)", () => {
  const temps: string[] = [];
  afterEach(() => {
    for (const dir of temps) {
      rmSync(dir, { recursive: true, force: true });
    }
    temps.length = 0;
  });

  it("runs Drive → pack → arrange/gaps → owner review → social → ads → CRM → digest without live flags or brand leak", async () => {
    const gates = loadPhaseGates();
    expect(gates.live_publish_allowed).toBe(false);
    expect(gates.live_ads_allowed).toBe(false);

    const c = ctx();
    temps.push(c.reportRoot);

    const health = await api(c, "GET", "/health");
    expect(health.status).toBe(200);
    const healthBody = health.body as {
      ok: boolean;
      live_publish_allowed: boolean;
      live_ads_allowed: boolean;
      ops_store: string;
    };
    expect(healthBody.ok).toBe(true);
    expect(healthBody.live_publish_allowed).toBe(false);
    expect(healthBody.live_ads_allowed).toBe(false);
    expect(["file", "memory"]).toContain(healthBody.ops_store);

    const synced = await api(c, "POST", "/api/drive-sync", {
      body: { brand_id: "VILLA_GLORY" },
    });
    expect(synced.status).toBe(200);
    const syncBody = synced.body as {
      brand_id: string;
      ingested: number;
      live_publish: boolean;
      live_ads: boolean;
    };
    expect(syncBody.brand_id).toBe("VILLA_GLORY");
    expect(syncBody.ingested).toBeGreaterThan(0);
    assertLiveOff(syncBody, "drive sync");

    const lotinDrive = await api(c, "GET", "/api/assets", {
      query: { brand_id: "LOTIN", source: "drive" },
    });
    expect(lotinDrive.status).toBe(200);
    expect((lotinDrive.body as { assets: unknown[] }).assets).toEqual([]);

    const vgAssets = await api(c, "GET", "/api/assets", {
      query: { brand_id: "VILLA_GLORY", source: "drive" },
    });
    expect(vgAssets.status).toBe(200);
    const vgAssetRows = (
      vgAssets.body as {
        assets: Array<{
          asset_id: string;
          brand_id: string;
          folder_role?: string;
          approval_status?: string;
        }>;
      }
    ).assets;
    expect(vgAssetRows.length).toBeGreaterThan(0);
    expect(vgAssetRows.every((row) => row.brand_id === "VILLA_GLORY")).toBe(true);
    const stillIds = vgAssetRows
      .filter((row) => row.folder_role === "approved-stills")
      .map((row) => row.asset_id);
    expect(stillIds.length).toBeGreaterThan(0);

    const packRes = await api(c, "POST", "/api/campaign-packs", {
      body: {
        brand_id: "VILLA_GLORY",
        objective: "Draft social plan for qualified enquiries",
      },
    });
    expect(packRes.status).toBe(200);
    const pack = packRes.body as {
      brand_id: string;
      campaign_id: string;
      pack_id: string;
      approval_id: string | null;
      approvable: boolean;
      live_publish: boolean;
      live_ads: boolean;
    };
    expect(pack.brand_id).toBe("VILLA_GLORY");
    expect(pack.approvable).toBe(true);
    expect(pack.approval_id).toBeTruthy();
    assertLiveOff(pack, "campaign pack");

    const arranged = await api(c, "POST", "/api/figma-arrange", {
      body: {
        brand_id: "VILLA_GLORY",
        campaign_id: pack.campaign_id,
        source_asset_ids: stillIds.slice(0, 2),
        layout_brief: "Instagram grid from approved stills. No commercial claims.",
      },
    });
    expect(arranged.status).toBe(200);
    assertLiveOff(arranged.body, "figma arrange");

    const gaps = await api(c, "POST", "/api/higgsfield-gaps", {
      body: {
        brand_id: "VILLA_GLORY",
        campaign_id: pack.campaign_id,
        source_asset_ids: stillIds.slice(0, 1),
        layout_brief: "Story still 9:16. No commercial claims.",
      },
    });
    expect(gaps.status).toBe(200);
    const gapBody = gaps.body as { status: string; brand_id: string };
    expect(gapBody.brand_id).toBe("VILLA_GLORY");
    expect(["READY_FOR_OWNER_REVIEW", "SKIPPED_NO_GAP", "GENERATED"]).toContain(
      gapBody.status,
    );
    assertLiveOff(gaps.body, "higgsfield");

    const lotinFigma = await api(c, "GET", "/api/figma-arrange", {
      query: { brand_id: "LOTIN" },
    });
    expect(lotinFigma.status).toBe(200);
    expect((lotinFigma.body as { jobs: unknown[] }).jobs).toEqual([]);

    const reviewed = await api(c, "POST", `/api/campaigns/${pack.campaign_id}/owner-review`, {
      body: { brand_id: "VILLA_GLORY" },
    });
    expect(reviewed.status).toBe(200);
    const reviewBody = reviewed.body as {
      outbox: { mode: string; status: string; live_publish: boolean; live_ads: boolean };
    };
    expect(reviewBody.outbox.mode).toBe("dry_run");
    expect(reviewBody.outbox.status).toBe("RECORDED");
    assertLiveOff(reviewBody.outbox, "owner review");

    const lotinOutbox = await api(c, "GET", "/api/email-outbox", {
      query: { brand_id: "LOTIN" },
    });
    expect(lotinOutbox.status).toBe(200);
    expect((lotinOutbox.body as { items: unknown[] }).items).toHaveLength(0);

    const decided = await api(c, "POST", `/api/approvals/${pack.approval_id}/decide`, {
      body: {
        brand_id: "VILLA_GLORY",
        decision: "APPROVED",
        rationale: "Internal Level 1 approve for golden-path dry-run only",
      },
    });
    expect(decided.status).toBe(200);

    const calendar = await api(c, "GET", "/api/publish/calendar", {
      query: { brand_id: "VILLA_GLORY", campaign_id: pack.campaign_id },
    });
    expect(calendar.status).toBe(200);
    const cal = calendar.body as {
      live_publish_allowed: boolean;
      items: Array<{ calendar: Array<{ key: string }> }>;
    };
    expect(cal.live_publish_allowed).toBe(false);
    const calKey = cal.items[0]?.calendar[0]?.key;
    expect(calKey).toBeTruthy();

    const scheduled = await api(c, "POST", "/api/publish/dry-run", {
      body: {
        brand_id: "VILLA_GLORY",
        campaign_id: pack.campaign_id,
        calendar_item_key: calKey,
        asset_ids: stillIds.slice(0, 1),
        actor: "panel-operator",
        rationale: "Golden-path Instagram dry-run only",
      },
    });
    expect(scheduled.status).toBe(200);
    const social = scheduled.body as {
      status: string;
      dry_run: boolean;
      live_publish: boolean;
      external_side_effects: boolean;
    };
    expect(social.status).toBe("DRY_RUN_OK");
    expect(social.dry_run).toBe(true);
    expect(social.external_side_effects).toBe(false);
    assertLiveOff(social, "social dry-run");

    const livePublish = await api(c, "POST", "/api/publish", {
      body: { brand_id: "VILLA_GLORY" },
    });
    expect(livePublish.status).toBe(403);
    assertLiveOff(livePublish.body, "live publish blocked");

    const staged = await api(c, "POST", "/api/ads/stage", {
      body: {
        brand_id: "VILLA_GLORY",
        campaign_id: pack.campaign_id,
        platform: "META",
        rationale: "Golden-path Meta stage only",
      },
    });
    expect(staged.status).toBe(200);
    const ads = staged.body as {
      status: string;
      staging: boolean;
      live_ads: boolean;
      external_side_effects: boolean;
    };
    expect(ads.status).toBe("STAGING_OK");
    expect(ads.staging).toBe(true);
    expect(ads.external_side_effects).toBe(false);
    assertLiveOff(ads, "ads stage");

    const liveAds = await api(c, "POST", "/api/ads/launch", {
      body: { brand_id: "VILLA_GLORY" },
    });
    expect(liveAds.status).toBe(403);
    assertLiveOff(liveAds.body, "live ads blocked");

    const ingested = await api(c, "POST", "/api/leads/ingest-fixtures", {
      body: { brand_id: "VILLA_GLORY", campaign_id: pack.campaign_id },
    });
    expect(ingested.status).toBe(200);

    const leads = await api(c, "GET", "/api/leads", {
      query: { brand_id: "VILLA_GLORY" },
    });
    expect(leads.status).toBe(200);
    const leadItems = (leads.body as { items: Array<{ brand_id: string; pii_ref: string; campaign_id?: string }> }).items;
    expect(leadItems.length).toBeGreaterThan(0);
    expect(leadItems.every((row) => row.brand_id === "VILLA_GLORY")).toBe(true);
    expect(leadItems.every((row) => row.pii_ref.startsWith("vault:"))).toBe(true);
    const leadBlob = JSON.stringify(leads.body);
    expect(leadBlob).not.toMatch(/@gmail\.|whatsapp:\+|phone/i);

    const lotinLeads = await api(c, "GET", "/api/leads", {
      query: { brand_id: "LOTIN" },
    });
    expect(lotinLeads.status).toBe(200);
    expect((lotinLeads.body as { items: unknown[] }).items).toHaveLength(0);

    const dash = await api(c, "GET", "/api/dashboard", {
      query: { brand_id: "VILLA_GLORY" },
    });
    expect(dash.status).toBe(200);
    const dashboard = dash.body as {
      brand_id: string;
      live_publish: boolean;
      live_ads: boolean;
      today: { lead_count: number; social_outbox_count: number; ad_outbox_count: number };
    };
    expect(dashboard.brand_id).toBe("VILLA_GLORY");
    expect(dashboard.today.lead_count).toBeGreaterThan(0);
    expect(dashboard.today.social_outbox_count).toBeGreaterThan(0);
    expect(dashboard.today.ad_outbox_count).toBeGreaterThan(0);
    assertLiveOff(dashboard, "dashboard");

    const digest = await api(c, "POST", "/api/digests", {
      body: { brand_id: "VILLA_GLORY", period: "daily" },
    });
    expect(digest.status).toBe(200);
    const digestBody = digest.body as {
      status: string;
      digest: { counts: { lead_count: number }; live_publish: boolean; live_ads: boolean };
    };
    expect(digestBody.status).toBe("RECORDED");
    expect(digestBody.digest.counts.lead_count).toBeGreaterThan(0);
    assertLiveOff(digestBody.digest, "digest");

    const lotinDigest = await api(c, "GET", "/api/digests", {
      query: { brand_id: "LOTIN" },
    });
    expect(lotinDigest.status).toBe(200);
    expect((lotinDigest.body as { items: unknown[] }).items).toEqual([]);
  });
});
