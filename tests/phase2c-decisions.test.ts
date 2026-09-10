import { describe, expect, it } from "vitest";
import { cpSync, mkdirSync, rmSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  BrandDecisionBatchSchema,
  isHighRiskMarketingClaim,
} from "@marketing-os/contracts";
import {
  applyBrandDecisions,
  loadBrandPack,
} from "@marketing-os/runtime";

const ROOT = process.cwd();

function fixtureBrands(): string {
  const dir = join(tmpdir(), `mos-p2c-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  for (const slug of ["lotin", "villa-glory", "nox-form", "nox-tech", "_shared"]) {
    const src = join(ROOT, "brands", slug);
    if (existsSync(src)) cpSync(src, join(dir, slug), { recursive: true });
  }
  return dir;
}

describe("Phase 2C decision schema", () => {
  it("loads the completed human-approved batch with safety rejections intact", () => {
    const batch = BrandDecisionBatchSchema.parse(
      JSON.parse(
        readFileSync(
          join(ROOT, "reports/onboarding/PHASE_2C_DECISIONS.json"),
          "utf8",
        ),
      ),
    );
    expect(batch.version).toBe("phase2c");
    expect(batch.decisions.every((d) => d.decision !== "PENDING")).toBe(true);
    expect(
      batch.decisions
        .filter((d) => d.decision !== "SKIP")
        .every((d) => d.decided_by === "Ahmet Oney"),
    ).toBe(true);
    for (const id of ["LQ-01", "VG-01", "NF-01", "NT-01"]) {
      expect(batch.decisions.find((d) => d.id === id)?.marketing_approved).toBe(
        true,
      );
    }
    for (const id of ["NT-04", "NT-05", "NT-06", "NT-06b", "XB-01"]) {
      expect(batch.decisions.find((d) => d.id === id)?.marketing_approved).toBe(
        false,
      );
    }
    expect(batch.decisions.find((d) => d.id === "XB-01")?.decision).toBe(
      "REJECT",
    );
    expect(new Set(batch.decisions.map((d) => d.id)).size).toBe(
      batch.decisions.length,
    );
  });

  it("rejects VERIFY without decided_by / decided_at", () => {
    expect(() =>
      BrandDecisionBatchSchema.parse({
        version: "phase2c",
        generated_at: new Date().toISOString(),
        decisions: [
          {
            id: "VG-01",
            brand_id: "VILLA_GLORY",
            field: "identity.official_name",
            candidate_value: "Villa Glory",
            decision: "VERIFY",
          },
        ],
      }),
    ).toThrow();
  });

  it("flags high-risk marketing claims", () => {
    expect(isHighRiskMarketingClaim("180–240% ROI within 18 months")).toBe(
      true,
    );
    expect(isHighRiskMarketingClaim("Villa Glory showrooms in Dubai")).toBe(
      false,
    );
  });
});

describe("Phase 2C apply-brand-decisions", () => {
  it("does not apply PENDING decisions", () => {
    const brandsRoot = fixtureBrands();
    try {
      const batch = BrandDecisionBatchSchema.parse({
        version: "phase2c",
        generated_at: new Date().toISOString(),
        decisions: [
          {
            id: "VG-01",
            brand_id: "VILLA_GLORY",
            field: "identity.official_name",
            candidate_value: "Villa Glory",
            decision: "PENDING",
          },
        ],
      });
      const before = loadBrandPack("VILLA_GLORY", undefined, { brandsRoot });
      const result = applyBrandDecisions(batch, {
        brandsRoot,
        write: true,
      });
      expect(result.applied).toBe(0);
      expect(result.skipped_pending).toBe(1);
      const after = loadBrandPack("VILLA_GLORY", undefined, { brandsRoot });
      expect(after.identity.official_name.status).toBe(
        before.identity.official_name.status,
      );
    } finally {
      rmSync(brandsRoot, { recursive: true, force: true });
    }
  });

  it("revokes a rejected cross-brand relationship and disables asset sharing", () => {
    const brandsRoot = fixtureBrands();
    try {
      const result = applyBrandDecisions(
        BrandDecisionBatchSchema.parse({
          version: "phase2c",
          generated_at: new Date().toISOString(),
          decisions: [
            {
              id: "XB-01",
              brand_id: "VILLA_GLORY",
              field: "relationships.rel-vg-nf-orientation",
              decision: "REJECT",
              operator_notes: "The brands are separate businesses.",
              decided_by: "operator_test",
              decided_at: new Date().toISOString(),
              marketing_approved: false,
            },
          ],
        }),
        { brandsRoot, write: true },
      );

      expect(result.errors).toEqual([]);
      expect(result.applied).toBe(1);
      const registry = JSON.parse(
        readFileSync(join(brandsRoot, "_shared", "RELATIONSHIPS.json"), "utf8"),
      ) as {
        relationships: Array<{
          relationship_id: string;
          status: string;
          usage_permission: boolean;
          source_reference: string;
        }>;
      };
      expect(
        registry.relationships.find(
          (relationship) =>
            relationship.relationship_id === "rel-vg-nf-orientation",
        ),
      ).toMatchObject({
        status: "REVOKED",
        usage_permission: false,
        source_reference: "operator:operator_test:XB-01",
      });
    } finally {
      rmSync(brandsRoot, { recursive: true, force: true });
    }
  });

  it("applies VERIFY with INTERNAL_OPERATOR provenance and preserves prior evidence in notes", () => {
    const brandsRoot = fixtureBrands();
    try {
      const result = applyBrandDecisions(
        BrandDecisionBatchSchema.parse({
          version: "phase2c",
          generated_at: new Date().toISOString(),
          decisions: [
            {
              id: "VG-01",
              brand_id: "VILLA_GLORY",
              field: "identity.official_name",
              candidate_value: "Villa Glory",
              decision: "VERIFY",
              decided_by: "operator_test",
              decided_at: new Date().toISOString(),
              marketing_approved: false,
            },
          ],
        }),
        { brandsRoot, write: true },
      );
      expect(result.errors).toEqual([]);
      expect(result.applied).toBe(1);
      const pack = loadBrandPack("VILLA_GLORY", undefined, { brandsRoot });
      expect(pack.identity.official_name.status).toBe("VERIFIED");
      expect(pack.identity.official_name.source_type).toBe("INTERNAL_OPERATOR");
      expect(pack.identity.official_name.notes).toMatch(/Prior evidence/);
      expect(pack.identity.official_name.notes).toMatch(/marketing_approved=false/);
    } finally {
      rmSync(brandsRoot, { recursive: true, force: true });
    }
  });

  it("rejects blank values as approval", () => {
    const brandsRoot = fixtureBrands();
    try {
      const result = applyBrandDecisions(
        BrandDecisionBatchSchema.parse({
          version: "phase2c",
          generated_at: new Date().toISOString(),
          decisions: [
            {
              id: "VG-09",
              brand_id: "VILLA_GLORY",
              field: "identity.website",
              decision: "VERIFY",
              candidate_value: "",
              decided_by: "operator_test",
              decided_at: new Date().toISOString(),
            },
          ],
        }),
        { brandsRoot, write: false },
      );
      expect(result.rejected).toBe(1);
      expect(result.errors[0]).toMatch(/blank value/i);
    } finally {
      rmSync(brandsRoot, { recursive: true, force: true });
    }
  });

  it("blocks high-risk approved_claims without marketing_approved", () => {
    const brandsRoot = fixtureBrands();
    try {
      const result = applyBrandDecisions(
        BrandDecisionBatchSchema.parse({
          version: "phase2c",
          generated_at: new Date().toISOString(),
          decisions: [
            {
              id: "NT-06",
              brand_id: "NOX_TECH",
              field: "claims.approved_claims",
              candidate_value: "180–240% ROI within 18 months",
              decision: "VERIFY",
              decided_by: "operator_test",
              decided_at: new Date().toISOString(),
              marketing_approved: false,
              requires_marketing_approval: true,
            },
          ],
        }),
        { brandsRoot, write: false },
      );
      expect(result.rejected).toBe(1);
      expect(result.errors[0]).toMatch(/marketing_approved=true/i);
    } finally {
      rmSync(brandsRoot, { recursive: true, force: true });
    }
  });

  it("does not write NOX_FORM fields when verifying Villa Glory only", () => {
    const brandsRoot = fixtureBrands();
    try {
      const nfBefore = loadBrandPack("NOX_FORM", undefined, { brandsRoot });
      applyBrandDecisions(
        BrandDecisionBatchSchema.parse({
          version: "phase2c",
          generated_at: new Date().toISOString(),
          decisions: [
            {
              id: "VG-01",
              brand_id: "VILLA_GLORY",
              field: "identity.official_name",
              candidate_value: "Villa Glory",
              decision: "VERIFY",
              decided_by: "operator_test",
              decided_at: new Date().toISOString(),
            },
          ],
        }),
        { brandsRoot, write: true },
      );
      const nfAfter = loadBrandPack("NOX_FORM", undefined, { brandsRoot });
      expect(nfAfter.identity.official_name).toEqual(
        nfBefore.identity.official_name,
      );
    } finally {
      rmSync(brandsRoot, { recursive: true, force: true });
    }
  });

  it("applies EDIT corrected_value", () => {
    const brandsRoot = fixtureBrands();
    try {
      applyBrandDecisions(
        BrandDecisionBatchSchema.parse({
          version: "phase2c",
          generated_at: new Date().toISOString(),
          decisions: [
            {
              id: "NF-01",
              brand_id: "NOX_FORM",
              field: "identity.official_name",
              candidate_value: "NOX FORM",
              decision: "EDIT",
              corrected_value: "NOX FORM Studio",
              decided_by: "operator_test",
              decided_at: new Date().toISOString(),
            },
          ],
        }),
        { brandsRoot, write: true },
      );
      const pack = loadBrandPack("NOX_FORM", undefined, { brandsRoot });
      expect(pack.identity.official_name.value).toBe("NOX FORM Studio");
      expect(pack.identity.official_name.status).toBe("VERIFIED");
    } finally {
      rmSync(brandsRoot, { recursive: true, force: true });
    }
  });

  it("applies decisions to indexed array fields", () => {
    const brandsRoot = fixtureBrands();
    try {
      const result = applyBrandDecisions(
        BrandDecisionBatchSchema.parse({
          version: "phase2c",
          generated_at: new Date().toISOString(),
          decisions: [
            {
              id: "VG-06a",
              brand_id: "VILLA_GLORY",
              field: "audiences.segments[0].label",
              candidate_value: "Verified private clients",
              decision: "VERIFY",
              decided_by: "operator_test",
              decided_at: new Date().toISOString(),
            },
          ],
        }),
        { brandsRoot, write: true },
      );

      expect(result.errors).toEqual([]);
      expect(result.applied).toBe(1);
      const pack = loadBrandPack("VILLA_GLORY", undefined, { brandsRoot });
      expect(pack.audiences.segments[0]?.label).toMatchObject({
        status: "VERIFIED",
        value: "Verified private clients",
      });
    } finally {
      rmSync(brandsRoot, { recursive: true, force: true });
    }
  });
});
