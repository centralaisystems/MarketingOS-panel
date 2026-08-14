#!/usr/bin/env tsx
/** Run onboard-brand for all four brands and write a combined gap report. */
import { writeFileSync, mkdirSync } from "node:fs";
import { BrandIdSchema, type BrandId } from "@marketing-os/contracts";
import { runBrandOnboarding } from "@marketing-os/runtime";

const brands = BrandIdSchema.options as BrandId[];
const reports = brands.map((brand_id) => {
  const r = runBrandOnboarding(brand_id);
  return {
    brand_id,
    readiness: r.report.readiness_status,
    overall_score: r.report.overall_score,
    verified: r.report.verified.length,
    unverified: r.report.unverified.length,
    missing: r.report.missing.length,
    conflicting: r.report.conflicting.length,
    stale: r.report.stale.length,
    critical_blockers: r.report.critical_blockers,
    next_actions: r.report.next_actions,
    related_brand_ids: r.related_brand_ids,
    guardian_passed: r.report.guardian_passed,
  };
});

mkdirSync("reports/onboarding", { recursive: true });
writeFileSync(
  "reports/onboarding/FOUR_BRAND_GAP_REPORT.json",
  JSON.stringify({ generated_at: new Date().toISOString(), brands: reports }, null, 2) +
    "\n",
);
console.log(JSON.stringify(reports, null, 2));
