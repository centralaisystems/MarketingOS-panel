/**
 * NOX FORM golden path (fixture mode) — thinner than Villa Glory.
 * Drive sync → campaign pack → digest dry-run (test overlay) → isolation vs VG / NOX TECH.
 * Committed NOX FORM registry keeps automation/owner email off.
 * Asserts live publish/ads stay off.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  clearBrandRegistryCache,
  createAssetCatalog,
  createDriveAssetSource,
  createEmailAdapter,
  getBrandEntry,
  handlePanelApi,
  loadPhaseGates,
  MemoryOpsStore,
  NOX_FORM_FIXTURE_DRIVE_FOLDER_ID,
  NOX_FORM_FIXTURE_OWNER_CC,
  NOX_FORM_FIXTURE_OWNER_EMAIL,
  WAVE4_ASSET_IDS,
  type PanelApiContext,
} from "@marketing-os/runtime";

const REPO_BRANDS = join(process.cwd(), "brands");

function writeNoxFormAutomationOverlay(root: string): void {
  writeFileSync(
    join(root, "_shared", "REGISTRY.local.json"),
    JSON.stringify({
      brands: [
        {
          brand_id: "NOX_FORM",
          owner_email: NOX_FORM_FIXTURE_OWNER_EMAIL,
          owner_cc: [NOX_FORM_FIXTURE_OWNER_CC],
          owner_email_enabled: true,
          automation_enabled: true,
        },
      ],
    }),
  );
}

function ctx(opts?: { overlayAutomation?: boolean }): PanelApiContext & {
  reportRoot: string;
} {
  const reportRoot = mkdtempSync(join(tmpdir(), "mos-nf-golden-"));
  const brandsRoot = opts?.overlayAutomation
    ? mkdtempSync(join(tmpdir(), "mos-nf-reg-"))
    : undefined;
  if (brandsRoot) {
    cpSync(REPO_BRANDS, brandsRoot, { recursive: true });
    writeNoxFormAutomationOverlay(brandsRoot);
  }
  return {
    store: new MemoryOpsStore(),
    assets: createAssetCatalog({ seedFixtures: true }),
    drive: createDriveAssetSource({ mode: "fixture" }),
    email: createEmailAdapter({ mode: "dry_run" }),
    writeReport: false,
    reportRoot,
    panelBaseUrl: "http://127.0.0.1:8787",
    ...(brandsRoot ? { brandsRoot } : {}),
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

describe("NOX FORM golden path (fixture)", () => {
  const temps: string[] = [];
  afterEach(() => {
    clearBrandRegistryCache();
    for (const dir of temps) {
      rmSync(dir, { recursive: true, force: true });
    }
    temps.length = 0;
  });

  it("runs Drive → pack → digest overlay without live flags or foreign-brand leak", async () => {
    const gates = loadPhaseGates();
    expect(gates.live_publish_allowed).toBe(false);
    expect(gates.live_ads_allowed).toBe(false);

    const committed = getBrandEntry("NOX_FORM");
    expect(committed.asset_drive_folder_id).toBe(NOX_FORM_FIXTURE_DRIVE_FOLDER_ID);
    expect(committed.automation_enabled).toBe(false);
    expect(committed.owner_email_enabled).toBe(false);

    const blockedCtx = ctx();
    temps.push(blockedCtx.reportRoot);
    const blocked = await api(blockedCtx, "POST", "/api/digests", {
      body: { brand_id: "NOX_FORM", period: "daily" },
    });
    expect(blocked.status).toBe(403);
    expect((blocked.body as { error: string }).error).toMatch(/AUTOMATION_DISABLED/);

    const c = ctx({ overlayAutomation: true });
    temps.push(c.reportRoot);
    if (c.brandsRoot) temps.push(c.brandsRoot);

    const brands = await api(c, "GET", "/api/brands");
    expect(brands.status).toBe(200);
    const nfEntry = (
      brands.body as {
        brands: Array<{
          brand_id: string;
          asset_drive_folder_id?: string;
          automation_enabled?: boolean;
          owner_email?: string;
        }>;
      }
    ).brands.find((row) => row.brand_id === "NOX_FORM");
    expect(nfEntry?.asset_drive_folder_id).toBe(NOX_FORM_FIXTURE_DRIVE_FOLDER_ID);
    expect(nfEntry?.automation_enabled).toBe(true);
    expect(nfEntry?.owner_email).toBe(NOX_FORM_FIXTURE_OWNER_EMAIL);

    const ready = await api(c, "GET", "/api/readiness", {
      query: { brand_id: "NOX_FORM" },
    });
    expect(ready.status).toBe(200);
    const readyBody = ready.body as {
      brand_id: string;
      readiness_status: string;
      verified_count: number;
    };
    expect(readyBody.brand_id).toBe("NOX_FORM");
    expect(readyBody.readiness_status).toBeTruthy();
    expect(readyBody.verified_count).toBeGreaterThan(0);

    const seeded = await api(c, "GET", "/api/assets", {
      query: { brand_id: "NOX_FORM" },
    });
    expect(seeded.status).toBe(200);
    const seededRows = (
      seeded.body as { assets: Array<{ brand_id: string; asset_id: string }> }
    ).assets;
    expect(seededRows.some((row) => row.asset_id === WAVE4_ASSET_IDS.NOX_FORM_UNUSED)).toBe(
      true,
    );
    expect(
      seededRows.some((row) => row.asset_id === WAVE4_ASSET_IDS.VG_LIVING_UNUSED_A),
    ).toBe(false);
    expect(
      seededRows.some((row) => row.asset_id === WAVE4_ASSET_IDS.NOX_TECH_UNUSED),
    ).toBe(false);

    const synced = await api(c, "POST", "/api/drive-sync", {
      body: { brand_id: "NOX_FORM" },
    });
    expect(synced.status).toBe(200);
    const syncBody = synced.body as {
      brand_id: string;
      ingested: number;
      live_publish: boolean;
      live_ads: boolean;
    };
    expect(syncBody.brand_id).toBe("NOX_FORM");
    expect(syncBody.ingested).toBeGreaterThan(0);
    assertLiveOff(syncBody, "drive sync");

    const vgDrive = await api(c, "GET", "/api/assets", {
      query: { brand_id: "VILLA_GLORY", source: "drive" },
    });
    expect(vgDrive.status).toBe(200);
    expect((vgDrive.body as { assets: unknown[] }).assets).toEqual([]);

    const ntDrive = await api(c, "GET", "/api/assets", {
      query: { brand_id: "NOX_TECH", source: "drive" },
    });
    expect(ntDrive.status).toBe(200);
    expect((ntDrive.body as { assets: unknown[] }).assets).toEqual([]);

    const nfAssets = await api(c, "GET", "/api/assets", {
      query: { brand_id: "NOX_FORM", source: "drive" },
    });
    expect(nfAssets.status).toBe(200);
    const nfAssetRows = (
      nfAssets.body as { assets: Array<{ asset_id: string; brand_id: string }> }
    ).assets;
    expect(nfAssetRows.length).toBeGreaterThan(0);
    expect(nfAssetRows.every((row) => row.brand_id === "NOX_FORM")).toBe(true);

    const vgSync = await api(c, "POST", "/api/drive-sync", {
      body: { brand_id: "VILLA_GLORY" },
    });
    expect(vgSync.status).toBe(200);
    expect((vgSync.body as { ingested: number }).ingested).toBeGreaterThan(0);
    const vgAfter = await api(c, "GET", "/api/assets", {
      query: { brand_id: "VILLA_GLORY", source: "drive" },
    });
    const vgRows = (
      vgAfter.body as { assets: Array<{ brand_id: string; asset_id: string }> }
    ).assets;
    expect(vgRows.every((row) => row.brand_id === "VILLA_GLORY")).toBe(true);
    expect(vgRows.some((row) => nfAssetRows.some((n) => n.asset_id === row.asset_id))).toBe(
      false,
    );

    const packRes = await api(c, "POST", "/api/campaign-packs", {
      body: {
        brand_id: "NOX_FORM",
        objective: "Draft a qualified project-enquiry plan for private villa interiors",
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
    expect(pack.brand_id).toBe("NOX_FORM");
    expect(pack.pack_id).toBeTruthy();
    assertLiveOff(pack, "campaign pack");

    const vgCampaigns = await api(c, "GET", "/api/campaigns", {
      query: { brand_id: "VILLA_GLORY" },
    });
    expect(vgCampaigns.status).toBe(200);
    expect((vgCampaigns.body as { campaigns: unknown[] }).campaigns).toEqual([]);

    const livePublish = await api(c, "POST", "/api/publish", {
      body: { brand_id: "NOX_FORM" },
    });
    expect(livePublish.status).toBe(403);
    assertLiveOff(livePublish.body, "live publish blocked");

    const liveAds = await api(c, "POST", "/api/ads/launch", {
      body: { brand_id: "NOX_FORM" },
    });
    expect(liveAds.status).toBe(403);
    assertLiveOff(liveAds.body, "live ads blocked");

    const digest = await api(c, "POST", "/api/digests", {
      body: { brand_id: "NOX_FORM", period: "daily" },
    });
    expect(digest.status).toBe(200);
    const digestBody = digest.body as {
      status: string;
      digest: { brand_id: string; live_publish: boolean; live_ads: boolean };
    };
    expect(digestBody.status).toBe("RECORDED");
    expect(digestBody.digest.brand_id).toBe("NOX_FORM");
    assertLiveOff(digestBody.digest, "digest");

    const vgDigest = await api(c, "GET", "/api/digests", {
      query: { brand_id: "VILLA_GLORY" },
    });
    expect(vgDigest.status).toBe(200);
    expect((vgDigest.body as { items: unknown[] }).items).toEqual([]);

    const vgOutbox = await api(c, "GET", "/api/email-outbox", {
      query: { brand_id: "VILLA_GLORY" },
    });
    expect(vgOutbox.status).toBe(200);
    expect((vgOutbox.body as { items: unknown[] }).items).toHaveLength(0);
  });
});
