import {
  BrandReadinessReportSchema,
  type BrandId,
  type BrandPack,
  type BrandReadinessReport,
  type OnboardingState,
  type ProvenancedField,
  type ReadinessArea,
  type ReadinessAreaScore,
} from "@marketing-os/contracts";
import { collectProvenancedFields } from "./brand-pack.js";
import { warnIfStalePresentedAsCurrent } from "./staleness.js";

type Counts = {
  verified: number;
  unverified: number;
  missing: number;
  conflicting: number;
  stale: number;
  paths: {
    verified: string[];
    unverified: string[];
    missing: string[];
    conflicting: string[];
    stale: string[];
  };
};

function emptyCounts(): Counts {
  return {
    verified: 0,
    unverified: 0,
    missing: 0,
    conflicting: 0,
    stale: 0,
    paths: {
      verified: [],
      unverified: [],
      missing: [],
      conflicting: [],
      stale: [],
    },
  };
}

function tally(fields: Array<{ path: string; field: ProvenancedField }>): Counts {
  const c = emptyCounts();
  for (const { path, field } of fields) {
    switch (field.status) {
      case "VERIFIED":
        c.verified++;
        c.paths.verified.push(path);
        break;
      case "UNVERIFIED":
        c.unverified++;
        c.paths.unverified.push(path);
        break;
      case "MISSING":
        c.missing++;
        c.paths.missing.push(path);
        break;
      case "CONFLICTING":
        c.conflicting++;
        c.paths.conflicting.push(path);
        break;
      case "STALE":
        c.stale++;
        c.paths.stale.push(path);
        break;
    }
  }
  return c;
}

/**
 * Score an area: VERIFIED weighs high; UNVERIFIED alone cannot inflate to readiness.
 * Formula: (verified * 100 + unverified * 15) / (verified + unverified + missing + conflicting + stale)
 * Conflicts and missing critically penalize.
 */
function scoreArea(
  area: ReadinessArea,
  fields: Array<{ path: string; field: ProvenancedField }>,
  criticalPaths: string[],
): ReadinessAreaScore {
  const c = tally(fields);
  const denom =
    c.verified + c.unverified + c.missing + c.conflicting + c.stale || 1;
  let score = (c.verified * 100 + c.unverified * 15) / denom;
  if (c.conflicting > 0) score = Math.min(score, 25);
  if (c.stale > 0) score = Math.min(score, score * 0.7);

  const blockers: string[] = [];
  for (const p of criticalPaths) {
    const hit = fields.find((f) => f.path === p || f.path.endsWith(p));
    if (!hit || hit.field.status === "MISSING") {
      blockers.push(`Critical missing: ${p}`);
    } else if (hit.field.status === "CONFLICTING") {
      blockers.push(`Critical conflict: ${p}`);
    } else if (hit.field.status === "STALE") {
      blockers.push(`Critical stale: ${p}`);
    } else if (hit.field.status === "UNVERIFIED") {
      blockers.push(`Critical unverified: ${p}`);
    }
  }

  return {
    area,
    score: Math.round(Math.max(0, Math.min(100, score))),
    verified_count: c.verified,
    unverified_count: c.unverified,
    missing_count: c.missing,
    conflicting_count: c.conflicting,
    stale_count: c.stale,
    critical_blockers: blockers,
  };
}

function filterByPrefix(
  all: Array<{ path: string; field: ProvenancedField }>,
  prefixes: string[],
) {
  return all.filter((f) => prefixes.some((p) => f.path.startsWith(p)));
}

export function computeBrandReadiness(
  brandId: BrandId,
  pack: BrandPack,
  onboardingState: OnboardingState,
  guardian: { passed: boolean; reasons: string[] },
): BrandReadinessReport {
  const all = collectProvenancedFields(pack);
  const totals = tally(all);

  const areas: ReadinessAreaScore[] = [
    scoreArea(
      "identity",
      filterByPrefix(all, ["identity"]),
      [
        "identity.official_name",
        "identity.description",
        "identity.location_markets",
      ],
    ),
    scoreArea(
      "positioning",
      filterByPrefix(all, ["positioning"]),
      ["positioning.positioning_statement", "positioning.category"],
    ),
    scoreArea("products_services", filterByPrefix(all, ["offerings"]), []),
    scoreArea("audiences", filterByPrefix(all, ["audiences"]), []),
    scoreArea("tone", filterByPrefix(all, ["voice"]), ["voice.tone"]),
    scoreArea("visual_identity", filterByPrefix(all, ["visual"]), []),
    scoreArea("channels", filterByPrefix(all, ["channels"]), []),
    scoreArea(
      "claims_restrictions",
      filterByPrefix(all, ["claims"]),
      ["claims.prohibited_claims"],
    ),
    scoreArea("ctas", filterByPrefix(all, ["cta"]), []),
    scoreArea(
      "evidence_quality",
      all,
      [],
    ),
  ];

  // Evidence quality: ratio of verified among non-missing
  const nonMissing =
    totals.verified + totals.unverified + totals.conflicting + totals.stale || 1;
  const evidenceArea = areas.find((a) => a.area === "evidence_quality");
  if (evidenceArea) {
    evidenceArea.score = Math.round((totals.verified * 100) / nonMissing);
    evidenceArea.verified_count = totals.verified;
    evidenceArea.unverified_count = totals.unverified;
    evidenceArea.missing_count = totals.missing;
    evidenceArea.conflicting_count = totals.conflicting;
    evidenceArea.stale_count = totals.stale;
  }

  const overall = Math.round(
    areas.reduce((s, a) => s + a.score, 0) / areas.length,
  );

  const critical_blockers = [
    ...areas.flatMap((a) => a.critical_blockers),
    ...guardian.reasons.map((r) => `Guardian: ${r}`),
  ];

  const staleWarnings = all.flatMap(({ path, field }) =>
    warnIfStalePresentedAsCurrent(field).map((w) => `${path}: ${w}`),
  );

  let readiness_status: BrandReadinessReport["readiness_status"] = "IN_PROGRESS";
  if (totals.verified === 0 && totals.unverified === 0) {
    readiness_status = "NOT_STARTED";
  }
  if (critical_blockers.length || totals.conflicting > 0 || !guardian.passed) {
    readiness_status = "BLOCKED";
  } else if (
    onboardingState === "BRAND_READY" &&
    overall >= 70 &&
    totals.verified >= 8 &&
    guardian.passed
  ) {
    readiness_status = "BRAND_READY";
  } else if (
    // Critical paths clear + enough VERIFIED truth → internal drafts OK
    // even when overall score is still low (many non-critical MISSING fields).
    totals.verified >= 8 &&
    totals.verified + totals.unverified > 0
  ) {
    readiness_status = "READY_FOR_INTERNAL_DRAFTS";
  } else if (overall >= 35 && totals.verified + totals.unverified > 0) {
    readiness_status = "READY_FOR_INTERNAL_DRAFTS";
  }

  // Cannot be BRAND_READY just because fields have text
  if (
    readiness_status === "BRAND_READY" &&
    (totals.verified < 8 || overall < 70)
  ) {
    readiness_status = "READY_FOR_INTERNAL_DRAFTS";
  }

  const recommended_documents = [
    "Official brand / legal identity sheet",
    "Approved positioning / messaging document",
    "Current product/service list with CTAs",
    "Tone of voice guide (if exists)",
    "Visual brand kit (if exists)",
    "Active channel list with handles/URLs",
    "Claims & compliance restrictions",
  ];

  const recommended_human_questions = [
    "What is the official brand name and website?",
    "What positioning statement is approved for external use?",
    "Which offers/products may be marketed now?",
    "What claims are prohibited (ROI, guarantees, etc.)?",
    "Which channels are active and who owns them?",
    "Are there any cross-brand asset usage permissions?",
  ];

  const next_actions = [
    onboardingState === "DISCOVER"
      ? "Gather internal documents and operator answers (INGEST)."
      : `Continue onboarding from state ${onboardingState}.`,
    ...critical_blockers.slice(0, 5).map((b) => `Resolve: ${b}`),
    ...staleWarnings.slice(0, 3),
  ];

  return BrandReadinessReportSchema.parse({
    brand_id: brandId,
    onboarding_state: onboardingState,
    overall_score: overall,
    readiness_status,
    areas,
    critical_blockers,
    missing: totals.paths.missing,
    unverified: totals.paths.unverified,
    conflicting: totals.paths.conflicting,
    stale: totals.paths.stale,
    verified: totals.paths.verified,
    recommended_documents,
    recommended_human_questions,
    next_actions,
    guardian_passed: guardian.passed,
    guardian_reasons: guardian.reasons,
    generated_at: new Date().toISOString(),
  });
}
