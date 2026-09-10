/**
 * All-brands fixture smoke — Drive sync + short campaign pack per ACTIVE registry brand.
 *
 * Usage:
 *   pnpm smoke:brands
 *
 * Fixture Drive only. No live publish/ads. Exit 1 if any brand fails.
 * Brand list comes from `listBrandIds()` (ACTIVE), not a closed enum.
 */
import { pathToFileURL } from "node:url";
import type { BrandId } from "@marketing-os/contracts";
import {
  brandsRootOpt,
  buildCampaignPack,
  createAssetCatalog,
  createDriveAssetSource,
  isLiveAdsOperatorFlagOn,
  isLivePublishOperatorFlagOn,
  listBrandIds,
  loadPhaseGates,
  syncBrandAssets,
} from "@marketing-os/runtime";

export const SMOKE_PACK_OBJECTIVE =
  "Draft a short qualified-enquiry plan. No commercial claims.";

export type SmokeCell = "PASS" | "FAIL";

export type BrandSmokeRow = {
  brand_id: BrandId;
  drive: SmokeCell;
  pack: SmokeCell;
  live_off: SmokeCell;
  result: SmokeCell;
  ingested: number;
  pack_id: string | null;
  detail: string;
};

export type BrandsSmokeReport = {
  mode: "fixture";
  brand_ids: BrandId[];
  rows: BrandSmokeRow[];
  passed: number;
  failed: number;
  ok: boolean;
};

export function listSmokeBrandIds(opts?: { brandsRoot?: string }): BrandId[] {
  return listBrandIds(brandsRootOpt(opts?.brandsRoot));
}

function cell(ok: boolean): SmokeCell {
  return ok ? "PASS" : "FAIL";
}

function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function liveFlagsOff(rec: { live_publish?: boolean; live_ads?: boolean }): boolean {
  return rec.live_publish === false && rec.live_ads === false;
}

export async function smokeOneBrand(
  brand_id: BrandId,
  opts?: { brandsRoot?: string },
): Promise<BrandSmokeRow> {
  const root = brandsRootOpt(opts?.brandsRoot);
  const details: string[] = [];
  let ingested = 0;
  let pack_id: string | null = null;
  let driveOk = false;
  let packOk = false;
  let liveOff = true;

  const catalog = createAssetCatalog({ backend: "memory" });
  try {
    const sync = await syncBrandAssets({
      brand_id,
      catalog,
      source: createDriveAssetSource({ mode: "fixture" }),
      ...root,
    });
    ingested = sync.ingested;
    driveOk =
      sync.configured &&
      sync.contract.valid &&
      sync.source === "fixture" &&
      sync.read_only &&
      sync.ingested > 0 &&
      !sync.stores_binaries_in_git;
    liveOff = liveOff && liveFlagsOff(sync);
    if (!driveOk) {
      details.push(sync.message || "Drive sync failed");
    }
  } catch (e) {
    driveOk = false;
    details.push(errMessage(e));
  }

  try {
    const pack = buildCampaignPack({
      brand_id,
      objective: SMOKE_PACK_OBJECTIVE,
      requested_by: "smoke-brands",
      writeReport: false,
      ...root,
    });
    pack_id = pack.pack_id;
    packOk =
      pack.brand_id === brand_id &&
      pack.guardian.passed &&
      pack.approvable &&
      pack.approval_level_cap === "LEVEL_1";
    liveOff = liveOff && liveFlagsOff(pack);
    if (!packOk) {
      details.push(
        pack.guardian.reasons[0] ?? "Campaign pack Guardian did not pass",
      );
    }
  } catch (e) {
    packOk = false;
    details.push(errMessage(e));
  }

  const result = driveOk && packOk && liveOff;
  return {
    brand_id,
    drive: cell(driveOk),
    pack: cell(packOk),
    live_off: cell(liveOff),
    result: cell(result),
    ingested,
    pack_id,
    detail: details.join("; "),
  };
}

export async function runBrandsFixtureSmoke(opts?: {
  brandsRoot?: string;
}): Promise<BrandsSmokeReport> {
  const root = brandsRootOpt(opts?.brandsRoot);
  const gates = loadPhaseGates(root);
  if (gates.live_publish_allowed || gates.live_ads_allowed) {
    throw new Error(
      "Smoke refuses to run while live_publish_allowed or live_ads_allowed is true.",
    );
  }
  if (isLivePublishOperatorFlagOn() || isLiveAdsOperatorFlagOn()) {
    throw new Error(
      "Smoke refuses to run while MOS_LIVE_PUBLISH or MOS_LIVE_ADS is enabled.",
    );
  }

  const brand_ids = listSmokeBrandIds(opts);
  if (brand_ids.length === 0) {
    throw new Error("No ACTIVE brands in registry.");
  }

  const rows: BrandSmokeRow[] = [];
  for (const brand_id of brand_ids) {
    rows.push(await smokeOneBrand(brand_id, opts));
  }

  const passed = rows.filter((r) => r.result === "PASS").length;
  const failed = rows.length - passed;
  return {
    mode: "fixture",
    brand_ids,
    rows,
    passed,
    failed,
    ok: failed === 0,
  };
}

function pad(value: string, width: number): string {
  return value.length >= width ? value : `${value}${" ".repeat(width - value.length)}`;
}

export function formatSmokeTable(report: BrandsSmokeReport): string {
  const brandW = Math.max(8, ...report.rows.map((r) => r.brand_id.length));
  const header = [
    pad("brand_id", brandW),
    pad("drive", 6),
    pad("pack", 6),
    pad("live_off", 8),
    pad("ingested", 8),
    "result",
  ].join("  ");
  const lines = [header, "-".repeat(header.length)];
  for (const row of report.rows) {
    lines.push(
      [
        pad(row.brand_id, brandW),
        pad(row.drive, 6),
        pad(row.pack, 6),
        pad(row.live_off, 8),
        pad(String(row.ingested), 8),
        row.result,
      ].join("  "),
    );
    if (row.result === "FAIL" && row.detail) {
      lines.push(`  ${row.detail}`);
    }
  }
  lines.push("");
  lines.push(
    `${report.passed} passed / ${report.failed} failed  (fixture Drive + short pack; live publish/ads OFF)`,
  );
  return lines.join("\n");
}

async function main(): Promise<void> {
  const report = await runBrandsFixtureSmoke();
  console.log(formatSmokeTable(report));
  if (!report.ok) {
    process.exitCode = 1;
  }
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
