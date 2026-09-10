import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  BrandPackSchema,
  IdentityModuleSchema,
  PositioningModuleSchema,
  OfferingsModuleSchema,
  AudiencesModuleSchema,
  VoiceModuleSchema,
  VisualModuleSchema,
  ChannelsModuleSchema,
  ContentPillarsModuleSchema,
  ClaimsModuleSchema,
  CtaModuleSchema,
  CompetitorsModuleSchema,
  LearningsModuleSchema,
  SourcesModuleSchema,
  OnboardingRecordSchema,
  BrandRelationshipRegistrySchema,
  type BrandId,
  type BrandPack,
  type OnboardingRecord,
  type BrandRelationshipRegistry,
  type ProvenancedField,
} from "@marketing-os/contracts";
import { resolveBrandsRoot } from "./brand-loader.js";
import {
  assertRegisteredBrandId,
  brandsRootOpt,
  slugForBrandId,
} from "./brand-registry.js";
import type { AuditSink } from "./audit.js";
import { applyStaleness } from "./staleness.js";

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

function walkProvenanced(
  node: unknown,
  path: string,
  visit: (path: string, field: ProvenancedField) => void,
): void {
  if (!node || typeof node !== "object") return;
  const obj = node as Record<string, unknown>;
  if (
    typeof obj.status === "string" &&
    ("value" in obj || obj.status === "MISSING" || obj.status === "CONFLICTING")
  ) {
    visit(path, obj as ProvenancedField);
  }
  for (const [k, v] of Object.entries(obj)) {
    if (k === "conflict_values") continue;
    if (Array.isArray(v)) {
      v.forEach((item, i) => walkProvenanced(item, `${path}.${k}[${i}]`, visit));
    } else if (v && typeof v === "object") {
      walkProvenanced(v, path ? `${path}.${k}` : k, visit);
    }
  }
}

export function collectProvenancedFields(
  pack: BrandPack,
): Array<{ path: string; field: ProvenancedField }> {
  const out: Array<{ path: string; field: ProvenancedField }> = [];
  walkProvenanced(pack, "", (path, field) => {
    if (path) out.push({ path, field });
  });
  return out;
}

export function loadBrandPack(
  brandId: BrandId,
  audit?: AuditSink,
  opts?: { brandsRoot?: string; applyStale?: boolean },
): BrandPack {
  const id = assertRegisteredBrandId(brandId, brandsRootOpt(opts?.brandsRoot));
  const root = join(
    resolveBrandsRoot(opts?.brandsRoot),
    slugForBrandId(id, brandsRootOpt(opts?.brandsRoot)),
  );

  const required = [
    ["IDENTITY.json", IdentityModuleSchema],
    ["POSITIONING.json", PositioningModuleSchema],
    ["OFFERINGS.json", OfferingsModuleSchema],
    ["AUDIENCES.json", AudiencesModuleSchema],
    ["VOICE.json", VoiceModuleSchema],
    ["VISUAL.json", VisualModuleSchema],
    ["CHANNELS.json", ChannelsModuleSchema],
    ["CONTENT_PILLARS.json", ContentPillarsModuleSchema],
    ["CLAIMS.json", ClaimsModuleSchema],
    ["CTA.json", CtaModuleSchema],
    ["COMPETITORS.json", CompetitorsModuleSchema],
    ["LEARNINGS.json", LearningsModuleSchema],
    ["SOURCES.json", SourcesModuleSchema],
  ] as const;

  const modules: Record<string, unknown> = { brand_id: id };
  for (const [file, schema] of required) {
    const path = join(root, file);
    if (!existsSync(path)) {
      throw new Error(`Brand pack missing ${path}`);
    }
    const parsed = schema.parse(readJson(path));
    if (parsed.brand_id !== id) {
      throw new Error(`brand_id mismatch in ${file}: ${parsed.brand_id}`);
    }
    const key = file.replace(/\.json$/, "").toLowerCase();
    const map: Record<string, string> = {
      identity: "identity",
      positioning: "positioning",
      offerings: "offerings",
      audiences: "audiences",
      voice: "voice",
      visual: "visual",
      channels: "channels",
      content_pillars: "content_pillars",
      claims: "claims",
      cta: "cta",
      competitors: "competitors",
      learnings: "learnings",
      sources: "sources",
    };
    modules[map[key] ?? key] = parsed;
  }

  let pack = BrandPackSchema.parse(modules);

  if (opts?.applyStale !== false) {
    const refreshed = structuredClone(pack) as BrandPack;
    walkProvenanced(refreshed, "", (path, field) => {
      const next = applyStaleness(field);
      // mutate via path is hard; re-walk assignment:
      void path;
      Object.assign(field, next);
    });
    pack = BrandPackSchema.parse(refreshed);
  }

  audit?.append({
    brand_id: id,
    event_type: "BRAND_CONTEXT_LOADED",
    message: `Loaded brand intelligence pack for ${id}`,
    metadata: { pack: true },
  });

  return pack;
}

export function loadOnboardingRecord(
  brandId: BrandId,
  opts?: { brandsRoot?: string },
): OnboardingRecord {
  const id = assertRegisteredBrandId(brandId, brandsRootOpt(opts?.brandsRoot));
  const path = join(
    resolveBrandsRoot(opts?.brandsRoot),
    slugForBrandId(id, brandsRootOpt(opts?.brandsRoot)),
    "ONBOARDING.json",
  );
  if (!existsSync(path)) {
    return OnboardingRecordSchema.parse({
      brand_id: id,
      state: "DISCOVER",
      updated_at: new Date().toISOString(),
      notes: "Default — ONBOARDING.json not yet written",
    });
  }
  return OnboardingRecordSchema.parse(readJson(path));
}

export function loadRelationshipRegistry(opts?: {
  brandsRoot?: string;
}): BrandRelationshipRegistry {
  const path = join(
    resolveBrandsRoot(opts?.brandsRoot),
    "_shared",
    "RELATIONSHIPS.json",
  );
  if (!existsSync(path)) {
    return BrandRelationshipRegistrySchema.parse({
      updated_at: new Date().toISOString(),
      relationships: [],
    });
  }
  return BrandRelationshipRegistrySchema.parse(readJson(path));
}

/**
 * Relationships must never merge brand packs.
 * Returns related brand ids for explicit workflows only.
 */
export function listRelatedBrandIds(
  brandId: BrandId,
  registry: BrandRelationshipRegistry,
): BrandId[] {
  const related = new Set<BrandId>();
  for (const r of registry.relationships) {
    if (r.status === "REVOKED") continue;
    if (r.from_brand_id === brandId) related.add(r.to_brand_id);
    if (r.to_brand_id === brandId) related.add(r.from_brand_id);
  }
  related.delete(brandId);
  return [...related];
}
