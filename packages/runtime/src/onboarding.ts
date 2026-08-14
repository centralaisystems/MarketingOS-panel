import {
  type BrandId,
  type BrandPack,
  type BrandReadinessReport,
} from "@marketing-os/contracts";
import {
  loadBrandPack,
  loadOnboardingRecord,
  loadRelationshipRegistry,
  listRelatedBrandIds,
} from "./brand-pack.js";
import { computeBrandReadiness } from "./readiness.js";
import { scanTextForForeignBrands } from "./contamination.js";
import type { AuditSink } from "./audit.js";
import { InMemoryAuditSink } from "./audit.js";
import { collectProvenancedFields } from "./brand-pack.js";

/**
 * Brand Guardian validation of Brand Intelligence packs.
 * Rejects unsupported claims, wrong-brand info, conflicts presented as certain,
 * unverified-as-certain, stale-as-current, prohibited patterns, silent cross-brand promotion.
 */
export function verifyBrandIntelligence(
  pack: BrandPack,
  audit?: AuditSink,
): { passed: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const fields = collectProvenancedFields(pack);

  for (const { path, field } of fields) {
    if (field.status === "VERIFIED" && field.source_type === "AI_INFERENCE") {
      reasons.push(`${path}: VERIFIED with AI_INFERENCE is forbidden`);
    }
    if (
      field.status === "VERIFIED" &&
      (!field.source_type || !field.source_reference)
    ) {
      reasons.push(`${path}: VERIFIED lacks provenance`);
    }
    if (field.status === "CONFLICTING") {
      reasons.push(`${path}: CONFLICTING — human resolution required`);
    }
    if (field.status === "STALE") {
      reasons.push(`${path}: STALE — do not present as current`);
    }
    if (
      field.status === "UNVERIFIED" &&
      (field.confidence === "HIGH" || field.confidence === "VERIFIED")
    ) {
      reasons.push(
        `${path}: UNVERIFIED fact presented with ${field.confidence} confidence`,
      );
    }
  }

  const blob = JSON.stringify(pack);
  const foreign = scanTextForForeignBrands(blob, pack.brand_id);
  const filtered = foreign.filter((f) => {
    const snip = f.snippet.toLowerCase();
    return !(
      snip.includes("keep separate") ||
      snip.includes("rather than") ||
      snip.includes("not a furniture") ||
      snip.includes("distinct from") ||
      snip.includes("must not merge") ||
      snip.includes("do not merge") ||
      snip.includes("knowledge must not merge") ||
      snip.includes("isolation") ||
      snip.includes("not villa glory") ||
      snip.includes("not nox form")
    );
  });
  if (filtered.length) {
    reasons.push(
      `Cross-brand contamination signals in pack (${filtered.length})`,
    );
  }

  const passed = reasons.length === 0;
  audit?.append({
    brand_id: pack.brand_id,
    agent_id: "A14_BRAND_GUARDIAN",
    event_type: passed ? "GUARDIAN_PASSED" : "GUARDIAN_REJECTED",
    message: passed
      ? `Brand intelligence pack OK for ${pack.brand_id}`
      : `Brand intelligence issues: ${reasons.length}`,
    metadata: { reasons },
  });

  return { passed, reasons };
}

export function runBrandOnboarding(
  brandId: BrandId,
  opts?: { brandsRoot?: string; audit?: AuditSink },
): {
  pack: BrandPack;
  report: BrandReadinessReport;
  related_brand_ids: BrandId[];
  relationships_do_not_merge_memory: true;
} {
  const audit = opts?.audit ?? new InMemoryAuditSink();
  const pack = loadBrandPack(brandId, audit, {
    ...(opts?.brandsRoot ? { brandsRoot: opts.brandsRoot } : {}),
  });
  const onboarding = loadOnboardingRecord(brandId, {
    ...(opts?.brandsRoot ? { brandsRoot: opts.brandsRoot } : {}),
  });
  const guardian = verifyBrandIntelligence(pack, audit);
  const report = computeBrandReadiness(
    brandId,
    pack,
    onboarding.state,
    guardian,
  );
  const registry = loadRelationshipRegistry({
    ...(opts?.brandsRoot ? { brandsRoot: opts.brandsRoot } : {}),
  });
  const related_brand_ids = listRelatedBrandIds(brandId, registry);

  return {
    pack,
    report,
    related_brand_ids,
    relationships_do_not_merge_memory: true,
  };
}
