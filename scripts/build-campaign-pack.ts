/**
 * Build a Level-1 campaign pack (Wave 2). No live publish/ads.
 *
 * Usage:
 *   pnpm build-campaign-pack -- --brand LOTIN --objective "Spring enquiry social plan"
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  assertRegisteredBrandId,
  buildCampaignPack,
  slugForBrandId,
} from "@marketing-os/runtime";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return undefined;
}

const brand = arg("--brand");
const objective = arg("--objective");
if (!brand || !objective) {
  console.error(
    'Usage: pnpm build-campaign-pack -- --brand LOTIN --objective "..."',
  );
  process.exit(1);
}

const brand_id = assertRegisteredBrandId(brand);
const pack = buildCampaignPack({
  brand_id,
  objective,
  requested_by: "cli-operator",
  writeReport: true,
});

const outDir = join("reports", "campaigns", slugForBrandId(brand_id));
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, `${pack.pack_id}.json`);
writeFileSync(outPath, JSON.stringify(pack, null, 2) + "\n");

console.log(
  JSON.stringify(
    {
      pack_id: pack.pack_id,
      brand_id: pack.brand_id,
      guardian: pack.guardian,
      live_publish: pack.live_publish,
      live_ads: pack.live_ads,
      path: outPath,
    },
    null,
    2,
  ),
);
