/**
 * Wave 4b — video export package from approved stills + Guardian-ready generated stills.
 *
 * Usage:
 *   pnpm produce-video -- --brand VILLA_GLORY
 *   pnpm produce-video -- --brand VILLA_GLORY --sync
 *   pnpm produce-video -- --brand VILLA_GLORY --format reel
 *
 * Fixture mode is the default. MOS_VIDEO_SOURCE=capcut|adobe_premiere labels the
 * same export package — CapCut/Adobe desktop control is not implemented.
 * `pnpm test` never needs CapCut or Adobe installed.
 */
import { join } from "node:path";
import {
  assertRegisteredBrandId,
  createAssetCatalog,
  createDriveAssetSource,
  createHiggsfieldGenerateJobStore,
  createVideoProducerAdapter,
  createVideoProduceJobStore,
  produceVideoPackage,
  syncBrandAssets,
} from "@marketing-os/runtime";
import type { VideoProducerSourceMode, VideoTargetFormat } from "@marketing-os/contracts";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return undefined;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function resolveSourceMode(): VideoProducerSourceMode | undefined {
  const raw = (arg("--source") ?? "").trim().toLowerCase();
  if (raw === "capcut") return "capcut";
  if (raw === "adobe_premiere" || raw === "adobe" || raw === "premiere") {
    return "adobe_premiere";
  }
  if (raw === "fixture") return "fixture";
  return undefined;
}

function resolveFormat(): VideoTargetFormat | undefined {
  const raw = (arg("--format") ?? "").trim().toLowerCase();
  if (raw === "reel" || raw === "story" || raw === "feed") return raw;
  return undefined;
}

async function main(): Promise<void> {
  const brandRaw = arg("--brand");
  if (!brandRaw) {
    console.error(
      "Usage: pnpm produce-video -- --brand VILLA_GLORY [--sync] [--format reel] [--source fixture]",
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
  const format = resolveFormat();
  const job = await produceVideoPackage({
    brand_id,
    brief: arg("--brief") ?? "Reel from approved stills. No commercial claims.",
    ...(format ? { target_format: format } : {}),
    catalog,
    jobs: createVideoProduceJobStore({
      backend: process.env.MOS_OPS_BACKEND === "memory" ? "memory" : "file",
      dir: process.env.MOS_VIDEO_DIR ?? join(process.cwd(), "data", "video"),
    }),
    adapter: createVideoProducerAdapter(
      sourceMode === undefined ? {} : { mode: sourceMode },
    ),
    higgsfieldJobs: createHiggsfieldGenerateJobStore({
      backend: process.env.MOS_OPS_BACKEND === "memory" ? "memory" : "file",
      dir: process.env.MOS_HIGGSFIELD_DIR ?? join(process.cwd(), "data", "higgsfield"),
    }),
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
