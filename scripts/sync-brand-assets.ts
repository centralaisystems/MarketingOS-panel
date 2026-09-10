/**
 * Wave 4b — read-only Drive metadata ingest into the Wave 4 asset catalog.
 *
 * Usage:
 *   pnpm sync-brand-assets -- --brand VILLA_GLORY
 *   pnpm sync-brand-assets -- --brand VILLA_GLORY --source fixture
 *
 * Fixture mode is the default. Live Google Drive requires MOS_DRIVE_SOURCE=google_drive
 * plus MOS_DRIVE_SERVICE_ACCOUNT_JSON / MOS_DRIVE_SERVICE_ACCOUNT_FILE (preferred)
 * or MOS_DRIVE_ACCESS_TOKEN (local fallback). `pnpm test` never needs live credentials.
 */
import { join } from "node:path";
import {
  assertRegisteredBrandId,
  createAssetCatalog,
  createDriveAssetSource,
  syncBrandAssets,
} from "@marketing-os/runtime";
import type { DriveSourceMode } from "@marketing-os/contracts";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return undefined;
}

function resolveSourceMode(): DriveSourceMode | undefined {
  const raw = (arg("--source") ?? "").trim().toLowerCase();
  if (raw === "google_drive" || raw === "google") return "google_drive";
  if (raw === "fixture") return "fixture";
  return undefined;
}

async function main(): Promise<void> {
  const brandRaw = arg("--brand");
  if (!brandRaw) {
    console.error("Usage: pnpm sync-brand-assets -- --brand VILLA_GLORY [--source fixture]");
    process.exit(1);
  }
  const brand_id = assertRegisteredBrandId(brandRaw);
  const sourceMode = resolveSourceMode();
  const catalog = createAssetCatalog({
    backend: process.env.MOS_OPS_BACKEND === "memory" ? "memory" : "file",
    dir: process.env.MOS_ASSETS_DIR ?? join(process.cwd(), "data", "assets"),
    seedFixtures: process.env.MOS_ASSETS_SEED !== "false",
  });
  const result = await syncBrandAssets({
    brand_id,
    catalog,
    source: createDriveAssetSource(
      sourceMode === undefined ? {} : { mode: sourceMode },
    ),
  });
  console.log(JSON.stringify(result, null, 2));
  if (!result.configured || !result.contract.valid) {
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
