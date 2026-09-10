import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  BrandDecisionBatchSchema,
  BrandRelationshipRegistrySchema,
  isHighRiskMarketingClaim,
  type BrandDecision,
  type BrandDecisionBatch,
  type BrandId,
  type ProvenancedField,
} from "@marketing-os/contracts";
import {
  loadBrandPack,
  loadOnboardingRecord,
} from "./brand-pack.js";
import { resolveBrandsRoot } from "./brand-loader.js";
import {
  listBrandIds,
  slugForBrandId,
} from "./brand-registry.js";
import { computeBrandReadiness } from "./readiness.js";
import { verifyBrandIntelligence } from "./onboarding.js";
import type { AuditSink } from "./audit.js";
import { InMemoryAuditSink } from "./audit.js";

const MODULE_FILE: Record<string, string> = {
  identity: "IDENTITY.json",
  positioning: "POSITIONING.json",
  offerings: "OFFERINGS.json",
  audiences: "AUDIENCES.json",
  voice: "VOICE.json",
  visual: "VISUAL.json",
  channels: "CHANNELS.json",
  content_pillars: "CONTENT_PILLARS.json",
  claims: "CLAIMS.json",
  cta: "CTA.json",
  competitors: "COMPETITORS.json",
  learnings: "LEARNINGS.json",
  sources: "SOURCES.json",
};

function setByPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split(".").flatMap((raw): Array<string | number> => {
    const match = raw.match(/^(.+)\[(\d+)\]$/);
    return match ? [match[1]!, Number(match[2])] : [raw];
  });
  let cur: unknown = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i]!;
    if (typeof p === "number") {
      if (!Array.isArray(cur)) throw new Error(`Invalid array path: ${path}`);
      cur = cur[p];
    } else {
      if (!cur || typeof cur !== "object") {
        throw new Error(`Invalid object path: ${path}`);
      }
      cur = (cur as Record<string, unknown>)[p];
    }
  }
  const last = parts[parts.length - 1]!;
  if (typeof last === "number") {
    if (!Array.isArray(cur)) throw new Error(`Invalid array path: ${path}`);
    cur[last] = value;
  } else {
    if (!cur || typeof cur !== "object") {
      throw new Error(`Invalid object path: ${path}`);
    }
    (cur as Record<string, unknown>)[last] = value;
  }
}

function getByPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const raw of path.split(".")) {
    if (cur == null || typeof cur !== "object") return undefined;
    const m = raw.match(/^(.+)\[(\d+)\]$/);
    if (m) {
      cur = (cur as Record<string, unknown>)[m[1]!];
      if (!Array.isArray(cur)) return undefined;
      cur = cur[Number(m[2])];
    } else {
      cur = (cur as Record<string, unknown>)[raw];
    }
  }
  return cur;
}

function isProvenanced(v: unknown): v is ProvenancedField {
  return !!v && typeof v === "object" && "status" in (v as object);
}

function isMarketingSurface(field: string): boolean {
  return (
    field.includes("approved_claims") ||
    field.startsWith("claims.approved") ||
    /marketing_approved/i.test(field)
  );
}

export function loadDecisionBatch(path: string): BrandDecisionBatch {
  return BrandDecisionBatchSchema.parse(
    JSON.parse(readFileSync(path, "utf8")) as unknown,
  );
}

function buildVerifiedField(
  decision: BrandDecision,
  existing: ProvenancedField | undefined,
  value: unknown,
): ProvenancedField {
  const prior =
    existing?.source_type && existing.source_reference
      ? `Prior evidence: ${existing.source_type} / ${existing.source_reference}`
      : existing?.notes
        ? `Prior notes: ${existing.notes}`
        : "No prior repository evidence";
  const notes = [
    `OPERATOR_VERIFIED by ${decision.decided_by}`,
    decision.operator_notes ? `Notes: ${decision.operator_notes}` : null,
    prior,
    decision.marketing_approved
      ? "marketing_approved=true (explicit)"
      : "marketing_approved=false (VERIFY ≠ advertising approval)",
  ]
    .filter(Boolean)
    .join(" | ");

  return {
    status: "VERIFIED",
    value,
    notes,
    source_type: "INTERNAL_OPERATOR",
    source_reference: `operator:${decision.decided_by}:${decision.id}`,
    observed_at: existing?.observed_at ?? decision.decided_at,
    verified_at: decision.decided_at!,
    confidence: "VERIFIED",
    time_sensitive: existing?.time_sensitive ?? false,
    ...(existing?.review_after_days
      ? { review_after_days: existing.review_after_days }
      : {}),
  };
}

export type ApplyOptions = {
  brandsRoot?: string;
  write?: boolean;
  audit?: AuditSink;
  reportDir?: string;
};

/**
 * Apply human decisions. Never treats PENDING or blank as approval.
 */
export function applyBrandDecisions(
  batch: BrandDecisionBatch,
  opts?: ApplyOptions,
): {
  applied: number;
  skipped_pending: number;
  skipped: number;
  rejected: number;
  errors: string[];
  readiness: Record<string, unknown>;
  audit_summary: string[];
} {
  const audit = opts?.audit ?? new InMemoryAuditSink();
  const brandsRoot = opts?.brandsRoot ?? resolveBrandsRoot();
  let applied = 0;
  let skipped_pending = 0;
  let skipped = 0;
  let rejected = 0;
  const errors: string[] = [];
  const audit_summary: string[] = [];
  const dirtyByBrand = new Map<BrandId, Set<string>>();
  const packs = new Map<BrandId, Record<string, unknown>>();

  function ensurePack(brandId: BrandId): Record<string, unknown> {
    if (!packs.has(brandId)) {
      const pack = loadBrandPack(brandId, audit, {
        brandsRoot,
        applyStale: false,
      });
      packs.set(brandId, pack as unknown as Record<string, unknown>);
    }
    return packs.get(brandId)!;
  }

  for (const d of batch.decisions) {
    if (d.decision === "PENDING") {
      skipped_pending++;
      continue;
    }
    if (d.decision === "SKIP") {
      skipped++;
      audit_summary.push(`${d.id}: SKIP`);
      continue;
    }

    if (!d.decided_by?.trim() || !d.decided_at) {
      errors.push(`${d.id}: missing decided_by/decided_at`);
      rejected++;
      continue;
    }

    if (d.field.startsWith("relationships.")) {
      if (
        d.decision === "REJECT" ||
        d.decision === "VERIFY" ||
        d.decision === "EDIT"
      ) {
        try {
          applyRelationshipDecision(d, brandsRoot, opts?.write !== false);
          applied++;
          audit_summary.push(`${d.id}: relationship ${d.decision}`);
        } catch (e) {
          errors.push(`${d.id}: ${e instanceof Error ? e.message : String(e)}`);
          rejected++;
        }
        continue;
      }
    }

    const pack = ensurePack(d.brand_id);
    if (pack.brand_id !== d.brand_id) {
      errors.push(`${d.id}: brand isolation violation`);
      rejected++;
      continue;
    }

    const existingRaw = getByPath(pack, d.field);

    if (d.decision === "REJECT") {
      if (isProvenanced(existingRaw)) {
        setByPath(pack, d.field, {
          status: "MISSING",
          notes: `OPERATOR_REJECTED by ${d.decided_by}: ${d.operator_notes ?? "rejected"}`,
          time_sensitive: false,
        });
        const mods = dirtyByBrand.get(d.brand_id) ?? new Set();
        mods.add(d.field.split(".")[0]!);
        dirtyByBrand.set(d.brand_id, mods);
        applied++;
        audit_summary.push(`${d.id}: REJECT → MISSING`);
      } else {
        skipped++;
      }
      continue;
    }

    if (!isProvenanced(existingRaw)) {
      errors.push(`${d.id}: field path not a provenanced field: ${d.field}`);
      rejected++;
      continue;
    }

    const value =
      d.decision === "EDIT"
        ? d.corrected_value
        : d.corrected_value !== undefined
          ? d.corrected_value
          : d.candidate_value;

    if (value === undefined || value === null || value === "") {
      errors.push(
        `${d.id}: blank value is not approval — supply candidate_value or corrected_value`,
      );
      rejected++;
      continue;
    }

    const valueText = typeof value === "string" ? value : JSON.stringify(value);
    const highRisk =
      d.requires_marketing_approval || isHighRiskMarketingClaim(valueText);

    if (highRisk && isMarketingSurface(d.field) && !d.marketing_approved) {
      errors.push(
        `${d.id}: high-risk marketing surface requires marketing_approved=true (VERIFY alone is insufficient)`,
      );
      rejected++;
      continue;
    }

    setByPath(pack, d.field, buildVerifiedField(d, existingRaw, value));
    const mods = dirtyByBrand.get(d.brand_id) ?? new Set();
    mods.add(d.field.split(".")[0]!);
    dirtyByBrand.set(d.brand_id, mods);
    applied++;
    audit_summary.push(
      `${d.id}: ${d.decision} ${d.field} marketing_approved=${d.marketing_approved}`,
    );
  }

  if (opts?.write !== false) {
    for (const [brandId, mods] of dirtyByBrand) {
      const pack = packs.get(brandId)!;
      const root = join(brandsRoot, slugForBrandId(brandId, { brandsRoot }));
      for (const mod of mods) {
        const file = MODULE_FILE[mod];
        if (!file) continue;
        writeFileSync(
          join(root, file),
          JSON.stringify(pack[mod], null, 2) + "\n",
        );
      }
    }
  }

  const readiness: Record<string, unknown> = {};
  for (const id of listBrandIds({ brandsRoot })) {
    const pack = loadBrandPack(id, audit, { brandsRoot });
    const onboarding = loadOnboardingRecord(id, { brandsRoot });
    const g = verifyBrandIntelligence(pack, audit);
    readiness[id] = computeBrandReadiness(id, pack, onboarding.state, g);
  }

  if (opts?.reportDir && opts.write !== false) {
    mkdirSync(opts.reportDir, { recursive: true });
    const auditName =
      batch.version === "phase2d"
        ? "PHASE_2D_APPLY_AUDIT.json"
        : "PHASE_2C_APPLY_AUDIT.json";
    writeFileSync(
      join(opts.reportDir, auditName),
      JSON.stringify(
        {
          generated_at: new Date().toISOString(),
          version: batch.version,
          applied,
          skipped_pending,
          skipped,
          rejected,
          errors,
          audit_summary,
          readiness: Object.fromEntries(
            Object.entries(readiness).map(([k, v]) => [
              k,
              {
                overall_score: (v as { overall_score: number }).overall_score,
                readiness_status: (v as { readiness_status: string })
                  .readiness_status,
                verified: (v as { verified: string[] }).verified?.length,
              },
            ]),
          ),
        },
        null,
        2,
      ) + "\n",
    );
  }

  return {
    applied,
    skipped_pending,
    skipped,
    rejected,
    errors,
    readiness,
    audit_summary,
  };
}

function applyRelationshipDecision(
  d: BrandDecision,
  brandsRoot: string,
  write: boolean,
): void {
  const path = join(brandsRoot, "_shared", "RELATIONSHIPS.json");
  if (!existsSync(path)) {
    throw new Error("RELATIONSHIPS.json missing");
  }
  const registry = BrandRelationshipRegistrySchema.parse(
    JSON.parse(readFileSync(path, "utf8")),
  );
  const relId = d.field.replace(/^relationships\./, "");
  const rel = registry.relationships.find((r) => r.relationship_id === relId);
  if (!rel) {
    throw new Error(`Unknown relationship ${relId}`);
  }
  if (d.decision === "REJECT") {
    rel.status = "REVOKED";
    rel.usage_permission = false;
    rel.source_type = "INTERNAL_OPERATOR";
    rel.source_reference = `operator:${d.decided_by}:${d.id}`;
    rel.confidence = "VERIFIED";
    rel.description =
      d.operator_notes?.trim() ||
      "Operator rejected this cross-brand relationship; no sharing is authorized.";
    registry.updated_at = new Date().toISOString();
    if (write) {
      writeFileSync(path, JSON.stringify(registry, null, 2) + "\n");
    }
    return;
  }
  const perms =
    d.corrected_value &&
    typeof d.corrected_value === "object" &&
    d.corrected_value !== null &&
    "permissions" in (d.corrected_value as object)
      ? (
          d.corrected_value as {
            permissions?: Record<string, boolean>;
          }
        ).permissions
      : undefined;

  rel.status = "VERIFIED";
  rel.source_type = "INTERNAL_OPERATOR";
  rel.source_reference = `operator:${d.decided_by}:${d.id}`;
  rel.confidence = "VERIFIED";
  if (perms) {
    rel.usage_permission = perms.asset_sharing === true;
    rel.description = `${rel.description} | Operator permissions: ${JSON.stringify(perms)}`;
  }
  registry.updated_at = new Date().toISOString();
  if (write) {
    writeFileSync(path, JSON.stringify(registry, null, 2) + "\n");
  }
}
