/**
 * Wave 4b — Higgsfield fill-gaps when approved stills / brand-kit leave a hole.
 *
 * Usage:
 *   pnpm fill-higgsfield-gaps -- --brand VILLA_GLORY
 *   pnpm fill-higgsfield-gaps -- --brand VILLA_GLORY --sync
 *
 * Fixture mode is the default. Live Higgsfield requires MOS_HIGGSFIELD_SOURCE=higgsfield_api
 * plus MOS_HIGGSFIELD_API_KEY. `pnpm test` never needs live credentials.
 */
import { join } from "node:path";
import {
  assertRegisteredBrandId,
  createAssetCatalog,
  createDriveAssetSource,
  createHiggsfieldAdapter,
  createHiggsfieldGenerateJobStore,
  fillHiggsfieldGaps,
  syncBrandAssets,
} from "@marketing-os/runtime";
import type { HiggsfieldSourceMode } from "@marketing-os/contracts";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return undefined;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function resolveSourceMode(): HiggsfieldSourceMode | undefined {
  const raw = (arg("--source") ?? "").trim().toLowerCase();
  if (raw === "higgsfield_api" || raw === "higgsfield") return "higgsfield_api";
  if (raw === "fixture") return "fixture";
  return undefined;
}

async function main(): Promise<void> {
  const brandRaw = arg("--brand");
  if (!brandRaw) {
    console.error(
      "Usage: pnpm fill-higgsfield-gaps -- --brand VILLA_GLORY [--sync] [--source fixture]",
    );
    process.exit(1);
  }
  const brand_id = assertRegisteredBrandId(brandRaw);
  const catalog = createAssetCatalog({
    backend: process.env.MOS_OPS_BACKEND === "memory" ? "memory" : "file",
    dir: process.env.MOS_ASSETS_DIR ?? join(process.cwd(), "data", "assets"),
    seedFixtures: process.env.MOS_ASSETS_SEED !== "false",
  });
  if (hasFlag("--sync")) {
    await syncBrandAssets({
      brand_id,
      catalog,
      source: createDriveAssetSource(),
    });
  }
  const sourceMode = resolveSourceMode();
  const job = await fillHiggsfieldGaps({
    brand_id,
    layout_brief:
      arg("--brief") ?? "Story still 9:16. No commercial claims.",
    catalog,
    jobs: createHiggsfieldGenerateJobStore({
      backend: process.env.MOS_OPS_BACKEND === "memory" ? "memory" : "file",
      dir: process.env.MOS_HIGGSFIELD_DIR ?? join(process.cwd(), "data", "higgsfield"),
    }),
    adapter: createHiggsfieldAdapter(
      sourceMode === undefined ? {} : { mode: sourceMode },
    ),
  });
  console.log(JSON.stringify(job, null, 2));
  if (job.status === "GUARDIAN_REJECTED") {
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
