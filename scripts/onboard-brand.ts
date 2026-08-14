#!/usr/bin/env tsx
/**
 * onboard-brand — list MISSING / UNVERIFIED fields for a brand brain.
 * Phase 1 identifies gaps only (Phase 2 populates).
 */
import { BrandIdSchema, listMissingKnowledge } from "@marketing-os/contracts";
import { InMemoryAuditSink, loadBrandContext } from "@marketing-os/runtime";

const brandRaw = process.argv[2] ?? process.argv[process.argv.indexOf("--") + 1];
const cleaned = brandRaw?.startsWith("--")
  ? process.argv[process.argv.indexOf(brandRaw) + 1]
  : brandRaw;

if (!cleaned || cleaned.startsWith("-")) {
  // also support: pnpm onboard-brand -- LOTIN  OR --brand LOTIN
  const idx = process.argv.indexOf("--brand");
  const fromFlag = idx >= 0 ? process.argv[idx + 1] : process.argv.find((a) =>
    ["LOTIN", "VILLA_GLORY", "NOX_FORM", "NOX_TECH"].includes(a),
  );
  if (!fromFlag) {
    console.error("Usage: pnpm onboard-brand -- LOTIN");
    process.exit(1);
  }
  run(fromFlag);
} else {
  run(cleaned);
}

function run(brandRaw: string) {
  const brand_id = BrandIdSchema.parse(brandRaw);
  const audit = new InMemoryAuditSink();
  const { profile, missing } = loadBrandContext(brand_id, audit);

  const unverified = (
    [
      "identity",
      "positioning",
      "products_services",
      "audiences",
      "personas",
      "markets",
      "competitors",
      "tone",
      "visual_guidelines",
      "content_pillars",
      "channels",
      "seo",
      "paid_media",
      "cta_library",
      "claims_restrictions",
      "historical_learnings",
    ] as const
  ).filter((k) => profile[k].status === "UNVERIFIED");

  console.log(
    JSON.stringify(
      {
        brand_id,
        display_name: profile.display_name,
        missing: listMissingKnowledge(profile),
        unverified,
        missing_count: missing.length,
        default_locales: profile.default_locales,
        note: "Phase 1 identifies gaps only. Do not invent values. Phase 2 populates.",
      },
      null,
      2,
    ),
  );
}
