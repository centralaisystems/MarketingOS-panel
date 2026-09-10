/**
 * Wave 8 — scheduled automation digest (operator / local trigger).
 *
 * Usage:
 *   pnpm run-digest -- --brand VILLA_GLORY
 *   pnpm run-digest -- --brand VILLA_GLORY --period daily
 *   pnpm run-digest -- --brand VILLA_GLORY --period weekly
 *
 * Fixture / dry-run is the default (MOS_EMAIL_MODE=dry_run). Writes ops
 * digest record + email outbox. No production cron is shipped — operators
 * run this CLI or POST /api/digests. Future cron can call the same function.
 * Kill switch: registry automation_enabled. Emailing also requires
 * owner_email_enabled. Live publish/ads stay OFF.
 */
import { join } from "node:path";
import {
  assertRegisteredBrandId,
  createEmailAdapter,
  createOpsStore,
  runAutomationDigest,
} from "@marketing-os/runtime";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return undefined;
}

async function main(): Promise<void> {
  const brandRaw = arg("--brand");
  if (!brandRaw) {
    console.error(
      "Usage: pnpm run-digest -- --brand VILLA_GLORY [--period daily|weekly]",
    );
    process.exit(1);
  }
  const brand_id = assertRegisteredBrandId(brandRaw);
  const period = arg("--period") ?? "daily";
  const result = await runAutomationDigest({
    brand_id,
    period,
    store: createOpsStore({
      backend: process.env.MOS_OPS_BACKEND === "memory" ? "memory" : "file",
      dir: process.env.MOS_OPS_DIR ?? join(process.cwd(), "data", "ops"),
    }),
    email: createEmailAdapter(),
  });
  console.log(JSON.stringify(result, null, 2));
  if (result.status === "BLOCKED") {
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
