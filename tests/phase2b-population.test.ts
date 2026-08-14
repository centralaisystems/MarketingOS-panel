import { describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync, cpSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  EvidenceLedgerSchema,
  HumanReviewQueueSchema,
  ProvenancedFieldSchema as PFS,
} from "@marketing-os/contracts";
import {
  filterPlaceholderCandidates,
  isPlaceholderOrDemoContent,
  looksLikeUnverifiedMarketingClaim,
  applyEvidenceLedger,
  buildHumanReviewQueue,
  candidateToField,
  loadBrandPack,
  verifyBrandIntelligence,
  detectAndRecordConflict,
} from "@marketing-os/runtime";

const ROOT = join(process.cwd());

function fixtureBrandsRoot(): string {
  const dir = join(tmpdir(), `mos-phase2b-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  for (const slug of ["lotin", "villa-glory", "nox-form", "nox-tech"]) {
    cpSync(join(ROOT, "brands", slug), join(dir, slug), { recursive: true });
  }
  if (existsSync(join(ROOT, "brands/_shared"))) {
    cpSync(join(ROOT, "brands/_shared"), join(dir, "_shared"), {
      recursive: true,
    });
  }
  return dir;
}

describe("Phase 2B placeholder / sample rejection", () => {
  it("rejects CRM-test and lorem placeholders", () => {
    expect(isPlaceholderOrDemoContent("Villa Glory CRM Test Product")).toBe(
      true,
    );
    expect(isPlaceholderOrDemoContent("lorem ipsum dolor")).toBe(true);
    expect(isPlaceholderOrDemoContent("Request Private Quote")).toBe(false);
  });

  it("filters placeholder candidates from extraction", () => {
    const { kept, rejected } = filterPlaceholderCandidates([
      {
        candidate_value: "Living",
        evidence_summary: "Room collection",
      },
      {
        candidate_value: "villa-glory-crm-test-product",
        evidence_summary: "QA product",
      },
    ]);
    expect(kept).toHaveLength(1);
    expect(rejected).toHaveLength(1);
  });
});

describe("Phase 2B code capability ≠ marketing claim", () => {
  it("detects ROI-style marketing claim language", () => {
    expect(looksLikeUnverifiedMarketingClaim("180–240% ROI within 18 months")).toBe(
      true,
    );
    expect(looksLikeUnverifiedMarketingClaim("Internal sales platform")).toBe(
      false,
    );
  });

  it("keeps OBSERVED_IN_CODE candidates as APPROVE_MARKETING_CLAIM in review queue", () => {
    const ledger = EvidenceLedgerSchema.parse({
      brand_id: "NOX_TECH",
      generated_at: new Date().toISOString(),
      pipeline: "PHASE_2B",
      candidates: [
        {
          candidate_id: "c1",
          brand_id: "NOX_TECH",
          field_path: "offerings.items",
          candidate_value: "CRM Core",
          source_repository: "Nox-tech-ai",
          relative_source_path: "supabase/seeds/batches/all-modules.json",
          source_type: "INTERNAL_DOCUMENT",
          evidence_summary: "Seed module",
          observed_at: new Date().toISOString(),
          verification_status: "UNVERIFIED",
          confidence: "LOW",
          status_reason: "OBSERVED_IN_CODE",
          capability_claim_state: "OBSERVED_IN_CODE",
        },
      ],
    });
    const queue = buildHumanReviewQueue([ledger]);
    expect(queue.items[0]?.action).toBe("APPROVE_MARKETING_CLAIM");
    HumanReviewQueueSchema.parse(queue);
  });

  it("candidateToField never auto-VERIFIES repository evidence", () => {
    const field = candidateToField({
      candidate_id: "x",
      brand_id: "VILLA_GLORY",
      field_path: "identity.official_name",
      candidate_value: "Villa Glory",
      source_repository: "Villa-Glory",
      relative_source_path: "about.html",
      source_type: "OFFICIAL_WEBSITE",
      evidence_summary: "About",
      observed_at: new Date().toISOString(),
      verification_status: "VERIFIED",
      confidence: "HIGH",
      status_reason: "would be wrong to trust blindly",
      rejected: false,
      placeholder_filtered: false,
      time_sensitive: false,
    });
    expect(field.status).toBe("UNVERIFIED");
    expect(field.confidence).toBe("MEDIUM");
  });
});

describe("Phase 2B provenance + conflicts + precedence", () => {
  it("preserves provenance on applied fields", () => {
    const field = candidateToField({
      candidate_id: "p1",
      brand_id: "NOX_FORM",
      field_path: "identity.website",
      candidate_value: "https://www.noxform.design",
      source_repository: "NOXFORM",
      relative_source_path: "src/lib/content.ts",
      source_type: "OFFICIAL_WEBSITE",
      evidence_summary: "siteConfig.website",
      observed_at: new Date().toISOString(),
      verification_status: "UNVERIFIED",
      confidence: "MEDIUM",
      status_reason: "Public domain",
      rejected: false,
      placeholder_filtered: false,
      time_sensitive: false,
    });
    expect(field.source_reference).toContain("NOXFORM:");
    expect(field.source_type).toBe("OFFICIAL_WEBSITE");
  });

  it("marks conflicting non-inference sources", () => {
    const existing = PFS.parse({
      status: "UNVERIFIED",
      value: "UAE only",
      source_type: "INTERNAL_OPERATOR",
      source_reference: "ops",
      observed_at: new Date().toISOString(),
      confidence: "MEDIUM",
    });
    const result = detectAndRecordConflict({
      path: "identity.location_markets",
      existing,
      incoming: {
        value: "Global",
        source_type: "PUBLIC_SOURCE",
        source_reference: "blog",
        observed_at: new Date().toISOString(),
      },
    });
    expect(result.status).toBe("CONFLICTING");
  });

  it("upgrades AI_INFERENCE placeholders with website evidence (source precedence)", () => {
    const brandsRoot = fixtureBrandsRoot();
    try {
      // Reset official_name to AI_INFERENCE for clean upgrade
      const idPath = join(brandsRoot, "villa-glory/IDENTITY.json");
      const identity = JSON.parse(readFileSync(idPath, "utf8")) as Record<
        string,
        unknown
      >;
      identity.official_name = {
        status: "UNVERIFIED",
        value: "VG",
        source_type: "AI_INFERENCE",
        source_reference: "brief",
        confidence: "LOW",
        observed_at: new Date().toISOString(),
        time_sensitive: false,
      };
      writeFileSync(idPath, JSON.stringify(identity, null, 2));

      const ledger = EvidenceLedgerSchema.parse({
        brand_id: "VILLA_GLORY",
        generated_at: new Date().toISOString(),
        pipeline: "PHASE_2B",
        candidates: [
          {
            candidate_id: "up1",
            brand_id: "VILLA_GLORY",
            field_path: "identity.official_name",
            candidate_value: "Villa Glory",
            source_repository: "Villa-Glory",
            relative_source_path: "about.html",
            source_type: "OFFICIAL_WEBSITE",
            evidence_summary: "About name",
            observed_at: new Date().toISOString(),
            verification_status: "UNVERIFIED",
            confidence: "MEDIUM",
            status_reason: "Website",
          },
        ],
      });
      const result = applyEvidenceLedger("VILLA_GLORY", ledger, {
        brandsRoot,
        write: true,
      });
      expect(result.applied).toBeGreaterThanOrEqual(1);
      const pack = loadBrandPack("VILLA_GLORY", undefined, { brandsRoot });
      expect(pack.identity.official_name.value).toBe("Villa Glory");
      expect(pack.identity.official_name.source_type).toBe("OFFICIAL_WEBSITE");
      expect(pack.identity.official_name.status).not.toBe("CONFLICTING");
    } finally {
      rmSync(brandsRoot, { recursive: true, force: true });
    }
  });
});

describe("Phase 2B sibling brand isolation + Guardian", () => {
  it("does not merge Villa Glory and NOX FORM packs", () => {
    const vg = loadBrandPack("VILLA_GLORY");
    const nf = loadBrandPack("NOX_FORM");
    expect(vg.brand_id).toBe("VILLA_GLORY");
    expect(nf.brand_id).toBe("NOX_FORM");
    const vgBlob = JSON.stringify(vg.offerings);
    const nfBlob = JSON.stringify(nf.offerings);
    // VG should not list NOX FORM studio services as its offerings
    expect(vgBlob).not.toMatch(/Interior Architecture/);
    // NF Luxury Furnishing note should mention isolation when present
    if (nfBlob.includes("Luxury Furnishing")) {
      expect(JSON.stringify(nf)).toMatch(/not.*Villa Glory|Isolation|distinct/i);
    }
  });

  it("Guardian reviews packs without false-positive on isolation notes", () => {
    const nf = loadBrandPack("NOX_FORM");
    const g = verifyBrandIntelligence(nf);
    // May fail for other reasons in populated packs; isolation notes alone must not be the only reasons
    const contamination = g.reasons.filter((r) =>
      r.toLowerCase().includes("contamination"),
    );
    expect(contamination).toHaveLength(0);
  });
});

describe("Phase 2B duplicate normalization", () => {
  it("skips re-applying identical non-inference values without conflict", () => {
    const brandsRoot = fixtureBrandsRoot();
    try {
      const ledger = EvidenceLedgerSchema.parse({
        brand_id: "NOX_FORM",
        generated_at: new Date().toISOString(),
        pipeline: "PHASE_2B",
        candidates: [
          {
            candidate_id: "d1",
            brand_id: "NOX_FORM",
            field_path: "identity.official_name",
            candidate_value: "NOX FORM",
            source_repository: "NOXFORM",
            relative_source_path: "src/lib/content.ts",
            source_type: "OFFICIAL_WEBSITE",
            evidence_summary: "name",
            observed_at: new Date().toISOString(),
            verification_status: "UNVERIFIED",
            confidence: "MEDIUM",
            status_reason: "dup",
          },
          {
            candidate_id: "d2",
            brand_id: "NOX_FORM",
            field_path: "identity.official_name",
            candidate_value: "NOX FORM",
            source_repository: "NOXFORM",
            relative_source_path: "src/lib/content.ts",
            source_type: "OFFICIAL_WEBSITE",
            evidence_summary: "name again",
            observed_at: new Date().toISOString(),
            verification_status: "UNVERIFIED",
            confidence: "MEDIUM",
            status_reason: "dup2",
          },
        ],
      });
      const first = applyEvidenceLedger("NOX_FORM", ledger, {
        brandsRoot,
        write: true,
      });
      const second = applyEvidenceLedger("NOX_FORM", ledger, {
        brandsRoot,
        write: true,
      });
      expect(first.conflicts + second.conflicts).toBe(0);
      void first;
    } finally {
      rmSync(brandsRoot, { recursive: true, force: true });
    }
  });
});
