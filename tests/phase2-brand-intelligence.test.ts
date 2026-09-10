import { describe, expect, it } from "vitest";
import {
  ProvenancedFieldSchema,
  IngestionEnvelopeSchema,
  canTransitionOnboarding,
} from "@marketing-os/contracts";
import {
  createIngestionEnvelope,
  normalizeJsonIngestion,
  detectAndRecordConflict,
  applyStaleness,
  areLikelySameBrandName,
  normalizeBrandAlias,
  loadBrandPack,
  runBrandOnboarding,
  verifyBrandIntelligence,
  computeBrandReadiness,
  loadRelationshipRegistry,
  listRelatedBrandIds,
  InMemoryAuditSink,
} from "@marketing-os/runtime";

function downgradeVerifiedFields(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) downgradeVerifiedFields(item);
    return;
  }
  if (!value || typeof value !== "object") return;

  const record = value as Record<string, unknown>;
  if (record.status === "VERIFIED") {
    record.status = "UNVERIFIED";
    record.confidence = "MEDIUM";
    delete record.verified_at;
  }
  for (const child of Object.values(record)) downgradeVerifiedFields(child);
}

describe("Phase 2 provenance", () => {
  it("rejects VERIFIED with AI_INFERENCE", () => {
    expect(() =>
      ProvenancedFieldSchema.parse({
        status: "VERIFIED",
        value: "LOTIN",
        source_type: "AI_INFERENCE",
        source_reference: "model",
      }),
    ).toThrow();
  });

  it("accepts VERIFIED with INTERNAL_OPERATOR provenance", () => {
    const field = ProvenancedFieldSchema.parse({
      status: "VERIFIED",
      value: "LOTIN LLC",
      source_type: "INTERNAL_OPERATOR",
      source_reference: "operator:ceo",
      verified_at: new Date().toISOString(),
    });
    expect(field.status).toBe("VERIFIED");
  });

  it("MISSING must not carry a value", () => {
    expect(() =>
      ProvenancedFieldSchema.parse({ status: "MISSING", value: "x" }),
    ).toThrow();
  });
});

describe("Phase 2 conflicts", () => {
  it("marks CONFLICTING instead of silently overwriting", () => {
    const existing = ProvenancedFieldSchema.parse({
      status: "UNVERIFIED",
      value: "UAE",
      source_type: "INTERNAL_OPERATOR",
      source_reference: "ops",
      observed_at: new Date().toISOString(),
    });
    const result = detectAndRecordConflict({
      path: "identity.location_markets",
      existing,
      incoming: {
        value: "Turkey",
        source_type: "PUBLIC_SOURCE",
        source_reference: "old-website",
        observed_at: "2020-01-01T00:00:00.000Z",
      },
    });
    expect(result.status).toBe("CONFLICTING");
    if (result.status === "CONFLICTING") {
      expect(result.field.status).toBe("CONFLICTING");
      expect(result.field.conflict_values?.length).toBe(2);
    }
  });
});

describe("Phase 2 staleness", () => {
  it("marks time-sensitive fields STALE after review window", () => {
    const field = ProvenancedFieldSchema.parse({
      status: "UNVERIFIED",
      value: { price: "AED 1" },
      source_type: "PUBLIC_SOURCE",
      source_reference: "listing",
      observed_at: "2020-01-01T00:00:00.000Z",
      time_sensitive: true,
      review_after_days: 30,
    });
    const stale = applyStaleness(field, new Date("2026-08-14T00:00:00.000Z"));
    expect(stale.status).toBe("STALE");
  });

  it("does not stale non-time-sensitive facts", () => {
    const field = ProvenancedFieldSchema.parse({
      status: "UNVERIFIED",
      value: "furniture",
      source_type: "AI_INFERENCE",
      source_reference: "brief",
      observed_at: "2020-01-01T00:00:00.000Z",
      time_sensitive: false,
    });
    expect(applyStaleness(field).status).toBe("UNVERIFIED");
  });
});

describe("Phase 2 normalization", () => {
  it("maps NOX FORM aliases to one brand id", () => {
    expect(normalizeBrandAlias("Nox Form")).toBe("NOX_FORM");
    expect(normalizeBrandAlias("NOXFORM")).toBe("NOX_FORM");
    expect(areLikelySameBrandName("NOX FORM", "Nox Form")).toBe(true);
  });
});

describe("Phase 2 ingestion", () => {
  it("preserves provenance through JSON normalization", () => {
    const envelope = createIngestionEnvelope({
      brand_id: "LOTIN",
      format: "JSON",
      source_type: "INTERNAL_OPERATOR",
      source_reference: "operator:test",
      content: JSON.stringify({ "identity.website": "https://example.com" }),
    });
    expect(envelope.connector_connected).toBe(false);
    const facts = normalizeJsonIngestion(envelope);
    expect(facts[0]?.source_type).toBe("INTERNAL_OPERATOR");
    expect(facts[0]?.source_reference).toBe("operator:test");
    expect(facts[0]?.ingestion_id).toBe(envelope.ingestion_id);
    expect(IngestionEnvelopeSchema.parse(envelope).brand_id).toBe("LOTIN");
  });
});

describe("Phase 2 brand packs & readiness", () => {
  it("loads each brand pack independently", () => {
    for (const id of ["LOTIN", "VILLA_GLORY", "NOX_FORM", "NOX_TECH"] as const) {
      const pack = loadBrandPack(id);
      expect(pack.brand_id).toBe(id);
    }
  });

  it("does not score highly on unverified population alone", () => {
    const pack = structuredClone(loadBrandPack("LOTIN"));
    downgradeVerifiedFields(pack);
    const report = computeBrandReadiness("LOTIN", pack, "GAP_ANALYSIS", {
      passed: true,
      reasons: [],
    });
    expect(report.overall_score).toBeLessThan(50);
    expect(report.verified.length).toBe(0);
    expect(report.readiness_status).not.toBe("BRAND_READY");
  });

  it("Villa Glory pack does not load NOX FORM knowledge", () => {
    const pack = loadBrandPack("VILLA_GLORY");
    expect(pack.brand_id).toBe("VILLA_GLORY");
    expect(pack.identity.official_name.value).not.toBe("NOX FORM");
  });

  it("relationships list related brands without merging memory", () => {
    const registry = loadRelationshipRegistry();
    const related = listRelatedBrandIds("VILLA_GLORY", registry);
    // XB-01 REJECTED: VG↔NF relationship is REVOKED — must not surface as related.
    expect(related).not.toContain("NOX_FORM");
    expect(registry.relationships.some((r) => r.relationship_id === "rel-vg-nf-orientation" && r.status === "REVOKED")).toBe(true);
    const onboarding = runBrandOnboarding("VILLA_GLORY");
    expect(onboarding.relationships_do_not_merge_memory).toBe(true);
    expect(onboarding.pack.brand_id).toBe("VILLA_GLORY");
  });

  it("onboarding workflow transitions are controlled", () => {
    expect(canTransitionOnboarding("DISCOVER", "INGEST")).toBe(true);
    expect(canTransitionOnboarding("DISCOVER", "BRAND_READY")).toBe(false);
    expect(canTransitionOnboarding("HUMAN_REVIEW", "BRAND_READY")).toBe(true);
  });
});

describe("Phase 2 Brand Guardian on intelligence", () => {
  it("rejects pack with unverified HIGH confidence", () => {
    const pack = loadBrandPack("LOTIN");
    pack.identity.official_name = ProvenancedFieldSchema.parse({
      status: "UNVERIFIED",
      value: "Fake Certainty Inc",
      source_type: "AI_INFERENCE",
      source_reference: "guess",
      confidence: "HIGH",
      observed_at: new Date().toISOString(),
    });
    const verdict = verifyBrandIntelligence(pack, new InMemoryAuditSink());
    expect(verdict.passed).toBe(false);
    expect(verdict.reasons.some((r) => /HIGH confidence/i.test(r))).toBe(true);
  });

  it("rejects CONFLICTING fields", () => {
    const pack = loadBrandPack("LOTIN");
    pack.identity.location_markets = ProvenancedFieldSchema.parse({
      status: "CONFLICTING",
      value: "UAE",
      conflict_values: [
        {
          value: "UAE",
          source_type: "INTERNAL_OPERATOR",
          source_reference: "ops",
        },
        {
          value: "Turkey",
          source_type: "PUBLIC_SOURCE",
          source_reference: "old-site",
        },
      ],
    });
    const verdict = verifyBrandIntelligence(pack);
    expect(verdict.passed).toBe(false);
  });

  it("runBrandOnboarding returns structured report", () => {
    const r = runBrandOnboarding("NOX_TECH");
    expect(r.report.brand_id).toBe("NOX_TECH");
    expect(r.report.missing.length).toBeGreaterThan(0);
    expect(r.report.recommended_human_questions.length).toBeGreaterThan(0);
  });
});

describe("Phase 1 still works", () => {
  it("profile.json brands still load via Phase 1 loader", async () => {
    const { loadBrandContext, InMemoryAuditSink: Audit } = await import(
      "@marketing-os/runtime"
    );
    const audit = new Audit();
    const { profile, loaded_brand_ids } = loadBrandContext("LOTIN", audit);
    expect(loaded_brand_ids).toEqual(["LOTIN"]);
    expect(profile.display_name).toBe("LOTIN");
  });
});
