import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { AgentResultSchema } from "@marketing-os/contracts";
import {
  BrandIsolationError,
  InMemoryAuditSink,
  InMemoryMemoryStore,
  loadBrandContext,
  runBrandGuardian,
  runMarketingDirector,
  scanAgentResultContamination,
  scanTextForForeignBrands,
  findSecretShapedStrings,
} from "@marketing-os/runtime";

describe("brand isolation", () => {
  it("loads only LOTIN for a LOTIN objective", () => {
    const audit = new InMemoryAuditSink();
    const result = runMarketingDirector(
      {
        brand_id: "LOTIN",
        objective: "Prepare an investor acquisition campaign.",
        requested_by: "test",
      },
      audit,
    );
    expect(result.loaded_brand_ids).toEqual(["LOTIN"]);
    expect(result.external_side_effects).toBe(false);
  });

  it("refuses multi-brand load without authorization", () => {
    const audit = new InMemoryAuditSink();
    expect(() =>
      loadBrandContext("LOTIN", audit, {
        additionalBrandIds: ["VILLA_GLORY"],
      }),
    ).toThrow(BrandIsolationError);
  });

  it("detects Villa Glory contamination inside a LOTIN result", () => {
    const result = AgentResultSchema.parse({
      task_id: randomUUID(),
      brand_id: "LOTIN",
      agent: "A05_CONTENT_COPY",
      summary: "Use Villa Glory living-room styling for investors",
      confidence: "LOW",
      recommended_next_action: "Revise",
      recommended_approval_level: "LEVEL_1",
      created_at: new Date().toISOString(),
    });
    const findings = scanAgentResultContamination(result, "LOTIN");
    expect(findings.length).toBeGreaterThan(0);
  });

  it("detects NOX TECH positioning leaked into NOX FORM task text", () => {
    const findings = scanTextForForeignBrands(
      "Position NOX FORM as an AI automation B2B platform like NOX TECH",
      "NOX_FORM",
    );
    expect(findings.some((f) => /NOX TECH|nox-tech|NOX_TECH/i.test(f.token))).toBe(
      true,
    );
  });

  it("Guardian rejects contaminated output", () => {
    const audit = new InMemoryAuditSink();
    const { profile } = loadBrandContext("LOTIN", audit);
    const contaminated = AgentResultSchema.parse({
      task_id: randomUUID(),
      brand_id: "LOTIN",
      agent: "A02_BRAND_STRATEGIST",
      summary: "Blend LOTIN with Villa Glory furniture offers",
      confidence: "MEDIUM",
      recommended_next_action: "Draft",
      recommended_approval_level: "LEVEL_1",
      created_at: new Date().toISOString(),
    });
    const verdict = runBrandGuardian(contaminated, profile, audit);
    expect(verdict.passed).toBe(false);
    expect(verdict.reasons.some((r) => /contamination/i.test(r))).toBe(true);
  });

  it("blocks automatic global memory promotion", () => {
    const audit = new InMemoryAuditSink();
    const store = new InMemoryMemoryStore(audit);
    const item = store.createDraft({
      brand_id: "LOTIN",
      observation: "Investors respond to WhatsApp CTAs",
      source: "hypothesis",
      confidence: "LOW",
    });
    expect(item.scope).toBe("BRAND");
    const promo = store.attemptPromoteToGlobal({
      memory_id: item.memory_id,
      operator_id: "op1",
      guardian_approved: false,
      human_approved: false,
    });
    expect(promo.ok).toBe(false);
  });
});

describe("evidence and secrets", () => {
  it("Research refuses fabrication when no evidence supplied", () => {
    const audit = new InMemoryAuditSink();
    const result = runMarketingDirector(
      {
        brand_id: "LOTIN",
        objective: "Prepare an investor acquisition campaign.",
        requested_by: "test",
      },
      audit,
    );
    const research = result.results.find(
      (r) => r.agent === "A03_RESEARCH_INTELLIGENCE",
    );
    expect(research).toBeTruthy();
    expect(research!.research_requirements.length).toBeGreaterThan(0);
    expect(
      research!.deliverables.some(
        (d) =>
          typeof d === "object" &&
          d !== null &&
          "fabricated" in d &&
          (d as { fabricated: boolean }).fabricated === false,
      ),
    ).toBe(true);
  });

  it("Guardian flags unsupported guarantee claims in deliverables", () => {
    const audit = new InMemoryAuditSink();
    const { profile } = loadBrandContext("LOTIN", audit);
    const bad = AgentResultSchema.parse({
      task_id: randomUUID(),
      brand_id: "LOTIN",
      agent: "A05_CONTENT_COPY",
      summary: "Draft",
      deliverables: [
        {
          type: "draft_copy_pack",
          body: "Guaranteed 40% ROI risk-free investment",
        },
      ],
      confidence: "HIGH",
      recommended_next_action: "Publish now",
      recommended_approval_level: "LEVEL_1",
      created_at: new Date().toISOString(),
    });
    const verdict = runBrandGuardian(bad, profile, audit);
    expect(verdict.passed).toBe(false);
  });

  it("detects secret-shaped strings", () => {
    const hits = findSecretShapedStrings(
      'api_key = "sk_live_abcdefghijklmnopqrstuv"',
    );
    expect(hits.length).toBeGreaterThan(0);
  });
});
