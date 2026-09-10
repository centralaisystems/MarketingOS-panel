/**
 * Wave 4b — Figma arrange from brand-kit + approved stills.
 *
 * Usage:
 *   pnpm arrange-figma -- --brand VILLA_GLORY
 *   pnpm arrange-figma -- --brand VILLA_GLORY --sync
 *
 * Fixture mode is the default. Live Figma requires MOS_FIGMA_SOURCE=figma_api
 * plus MOS_FIGMA_ACCESS_TOKEN and MOS_FIGMA_FILE_KEY. `pnpm test` never needs
 * live credentials.
 */
import { join } from "node:path";
import {
  assertRegisteredBrandId,
  arrangeInFigma,
  createAssetCatalog,
  createDriveAssetSource,
  createFigmaArrangeAdapter,
  createFigmaArrangeJobStore,
  listApprovedStillsForArrange,
  syncBrandAssets,
} from "@marketing-os/runtime";
import type { FigmaSourceMode } from "@marketing-os/contracts";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return undefined;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function resolveSourceMode(): FigmaSourceMode | undefined {
  const raw = (arg("--source") ?? "").trim().toLowerCase();
  if (raw === "figma_api" || raw === "figma") return "figma_api";
  if (raw === "fixture") return "fixture";
  return undefined;
}

async function main(): Promise<void> {
  const brandRaw = arg("--brand");
  if (!brandRaw) {
    console.error(
      "Usage: pnpm arrange-figma -- --brand VILLA_GLORY [--sync] [--source fixture]",
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
  const stills = listApprovedStillsForArrange(catalog, brand_id);
  const selected = stills.filter((row) => row.folder_role === "approved-stills");
  const source_asset_ids = (selected.length ? selected : stills).map((row) => row.asset_id);
  const sourceMode = resolveSourceMode();
  const job = await arrangeInFigma({
    brand_id,
    source_asset_ids,
    layout_brief: arg("--brief") ?? "Instagram grid from approved stills + brand-kit. No commercial claims.",
    catalog,
    jobs: createFigmaArrangeJobStore({
      backend: process.env.MOS_OPS_BACKEND === "memory" ? "memory" : "file",
      dir: process.env.MOS_FIGMA_DIR ?? join(process.cwd(), "data", "figma"),
    }),
    adapter: createFigmaArrangeAdapter(
      sourceMode === undefined ? {} : { mode: sourceMode },
    ),
  });
  console.log(JSON.stringify(job, null, 2));
  if (job.status !== "READY_FOR_OWNER_REVIEW") {
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
