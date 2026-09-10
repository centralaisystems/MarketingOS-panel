#!/usr/bin/env tsx
/**
 * onboard-brand — Phase 2 brand intelligence onboarding report.
 * Never invents answers.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { BrandIdSchema } from "@marketing-os/contracts";
import {
  InMemoryAuditSink,
  assertRegisteredBrandId,
  listBrandIds,
  runBrandOnboarding,
} from "@marketing-os/runtime";

function resolveBrandArg(): string {
  const idxBrand = process.argv.indexOf("--brand");
  if (idxBrand >= 0 && process.argv[idxBrand + 1]) {
    return process.argv[idxBrand + 1]!;
  }
  const known = listBrandIds();
  const found = process.argv.find((a) => known.includes(a));
  if (found) return found;
  console.error(`Usage: pnpm onboard-brand -- <BRAND_ID>`);
  console.error(`Known brands: ${known.join(", ")}`);
  process.exit(1);
}

const brand_id = assertRegisteredBrandId(BrandIdSchema.parse(resolveBrandArg()));
const audit = new InMemoryAuditSink();
const result = runBrandOnboarding(brand_id, { audit });

const summary = {
  brand_id: result.report.brand_id,
  readiness_status: result.report.readiness_status,
  overall_score: result.report.overall_score,
  onboarding_state: result.report.onboarding_state,
  guardian_passed: result.report.guardian_passed,
  guardian_reasons: result.report.guardian_reasons,
  verified_count: result.report.verified.length,
  unverified_count: result.report.unverified.length,
  missing_count: result.report.missing.length,
  conflicting_count: result.report.conflicting.length,
  stale_count: result.report.stale.length,
  verified: result.report.verified,
  unverified: result.report.unverified,
  missing: result.report.missing,
  conflicting: result.report.conflicting,
  stale: result.report.stale,
  critical_blockers: result.report.critical_blockers,
  recommended_documents: result.report.recommended_documents,
  recommended_human_questions: result.report.recommended_human_questions,
  next_actions: result.report.next_actions,
  areas: result.report.areas,
  related_brand_ids: result.related_brand_ids,
  relationships_do_not_merge_memory: result.relationships_do_not_merge_memory,
  note: "Phase 2 onboarding does not invent brand facts. Feed verified documents next.",
};

console.log(JSON.stringify(summary, null, 2));

mkdirSync("reports/onboarding", { recursive: true });
const out = join("reports/onboarding", `${brand_id}.json`);
writeFileSync(out, JSON.stringify(summary, null, 2) + "\n");
console.error(`Wrote ${out}`);
