/**
 * Apply Phase 2C human brand decisions.
 *
 * Usage:
 *   pnpm apply-brand-decisions -- --file reports/onboarding/PHASE_2C_DECISIONS.json
 *
 * Does nothing useful until decisions are no longer PENDING.
 * Never auto-approves blanks.
 */
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadDecisionBatch,
  applyBrandDecisions,
} from "@marketing-os/runtime";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return undefined;
}

function main(): void {
  const file =
    arg("--file") ?? join(ROOT, "reports/onboarding/PHASE_2C_DECISIONS.json");
  const dry = process.argv.includes("--dry-run");
  const batch = loadDecisionBatch(file);
  const pending = batch.decisions.filter((d) => d.decision === "PENDING").length;
  const actionable = batch.decisions.length - pending;

  console.log(`Loaded ${batch.decisions.length} decisions from ${file}`);
  console.log(`PENDING: ${pending} | actionable: ${actionable}`);

  if (actionable === 0) {
    console.log(
      "No non-PENDING decisions — nothing to apply. Fill PHASE_2C_DECISIONS.json after operator review.",
    );
    process.exit(0);
  }

  const result = applyBrandDecisions(batch, {
    brandsRoot: join(ROOT, "brands"),
    write: !dry,
    reportDir: join(ROOT, "reports/onboarding"),
  });

  console.log(JSON.stringify({
    dry_run: dry,
    applied: result.applied,
    skipped_pending: result.skipped_pending,
    skipped: result.skipped,
    rejected: result.rejected,
    errors: result.errors,
    audit_summary: result.audit_summary,
  }, null, 2));

  if (result.errors.length) process.exit(1);
}

main();
