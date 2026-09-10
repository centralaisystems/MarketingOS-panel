import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  AgentResultSchema,
  AiSearchVisibilityReportSchema,
  AnalyticsSnapshotSchema,
  ApprovalDecisionSchema,
  AssetRecordSchema,
  BrandIdSchema,
  EvidenceSchema,
  OpsCampaignRecordSchema,
  TaskSchema,
  MarketingMemoryItemSchema,
  UtmParamsSchema,
  LocalizedContentSchema,
  buildCampaignCode,
  GLOBAL_MEMORY_PROMOTION_RULES,
  PII_HANDLING_POLICY,
} from "@marketing-os/contracts";

describe("contracts", () => {
  it("accepts registry-format brand_id on Evidence (not a closed four-brand enum)", () => {
    const ev = EvidenceSchema.parse({
      id: "e1",
      summary: "Observed in pack",
      kind: "OBSERVATION",
      confidence: "LOW",
      brand_id: "DEMO_FIFTH",
    });
    expect(ev.brand_id).toBe("DEMO_FIFTH");
    expect(() =>
      EvidenceSchema.parse({
        id: "e2",
        summary: "bad id",
        kind: "FACT",
        confidence: "LOW",
        brand_id: "not-a-brand",
      }),
    ).toThrow();
  });

  it("accepts valid BrandId format and rejects invalid format", () => {
    expect(BrandIdSchema.parse("LOTIN")).toBe("LOTIN");
    expect(BrandIdSchema.parse("ACME_CO")).toBe("ACME_CO");
    expect(() => BrandIdSchema.parse("acme")).toThrow();
    expect(() => BrandIdSchema.parse("Lotin")).toThrow();
  });

  it("validates Task with brand_id", () => {
    const task = TaskSchema.parse({
      task_id: randomUUID(),
      brand_id: "LOTIN",
      objective: "Prepare campaign",
      requested_by: "op1",
      assigned_agent: "A01_MARKETING_DIRECTOR",
      expected_output: "plan",
      approval_level: "LEVEL_1",
      created_at: new Date().toISOString(),
    });
    expect(task.brand_id).toBe("LOTIN");
    expect(task.workflow_state).toBe("IDEA");
  });

  it("rejects Task without brand_id", () => {
    expect(() =>
      TaskSchema.parse({
        task_id: randomUUID(),
        objective: "x",
        requested_by: "op1",
        assigned_agent: "A01_MARKETING_DIRECTOR",
        expected_output: "plan",
        approval_level: "LEVEL_1",
        created_at: new Date().toISOString(),
      }),
    ).toThrow();
  });

  it("validates AgentResult", () => {
    const result = AgentResultSchema.parse({
      task_id: randomUUID(),
      brand_id: "NOX_TECH",
      agent: "A05_CONTENT_COPY",
      summary: "Draft",
      confidence: "LOW",
      recommended_next_action: "Review",
      recommended_approval_level: "LEVEL_1",
      created_at: new Date().toISOString(),
    });
    expect(result.brand_id).toBe("NOX_TECH");
  });

  it("validates ApprovalDecision with operator actor", () => {
    const decision = ApprovalDecisionSchema.parse({
      approval_id: randomUUID(),
      brand_id: "VILLA_GLORY",
      level: "LEVEL_2",
      decision: "PENDING",
      actor: { operator_id: "op-1", role: "APPROVER" },
      action: "REQUEST_APPROVAL",
      rationale: "Publish requires human",
      timestamp: new Date().toISOString(),
    });
    expect(decision.actor.operator_id).toBe("op-1");
  });

  it("defaults memory scope to BRAND and blocks auto global", () => {
    const item = MarketingMemoryItemSchema.parse({
      memory_id: randomUUID(),
      observation: "Test learning",
      confidence: "LOW",
      source: "test",
      brand_id: "LOTIN",
      created_at: new Date().toISOString(),
    });
    expect(item.scope).toBe("BRAND");
    expect(GLOBAL_MEMORY_PROMOTION_RULES.auto_promote_to_global).toBe(false);
  });

  it("validates UTM taxonomy and campaign code", () => {
    const utm = UtmParamsSchema.parse({
      brand_id: "LOTIN",
      utm_source: "meta",
      utm_medium: "paid_social",
      utm_campaign: "lotin_2026_investor_meta",
      channel: "meta",
    });
    expect(utm.utm_campaign).toContain("lotin");
    expect(
      buildCampaignCode({
        brand_slug: "lotin",
        year: 2026,
        objective_slug: "investor-acquisition",
        channel: "meta",
      }),
    ).toBe("lotin_2026_investor_acquisition_meta");
  });

  it("supports en/ar/tr localization metadata", () => {
    const loc = LocalizedContentSchema.parse({
      content_id: randomUUID(),
      source_language: "en",
      target_language: "ar",
      locale: "ar-AE",
      body: "مسودة",
    });
    expect(loc.target_language).toBe("ar");
  });

  it("documents PII policy for Phase 1", () => {
    expect(PII_HANDLING_POLICY.store_real_leads).toBe(false);
    expect(PII_HANDLING_POLICY.allow_pii_in_prompts).toBe(false);
  });

  it("validates ops campaign rows as brand-scoped drafts", () => {
    const now = new Date().toISOString();
    const row = OpsCampaignRecordSchema.parse({
      campaign_id: randomUUID(),
      brand_id: "VILLA_GLORY",
      pack_id: randomUUID(),
      objective: "Draft social plan",
      status: "DRAFT",
      pack: {
        pack_id: randomUUID(),
        brand_id: "VILLA_GLORY",
        objective: "Draft social plan",
        generated_at: now,
        guardian: { passed: true, reasons: [], reviewed: ["content"] },
        approvable: true,
        live_publish: false,
        live_ads: false,
      },
      guardian_passed: true,
      approvable: true,
      created_at: now,
      updated_at: now,
    });
    expect(row.brand_id).toBe("VILLA_GLORY");
    expect(row.pack.live_publish).toBe(false);
  });

  it("rejects Git asset URIs and VERIFIED analytics fixture traffic", () => {
    expect(() =>
      AssetRecordSchema.parse({
        asset_id: randomUUID(),
        brand_id: "VILLA_GLORY",
        title: "still",
        kind: "IMAGE",
        mime_type: "image/jpeg",
        storage_uri: "assets/binaries/room.jpg",
        in_git: false,
        approval_status: "APPROVED",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }),
    ).toThrow(/object storage|Git/);

    expect(() =>
      AnalyticsSnapshotSchema.parse({
        brand_id: "VILLA_GLORY",
        generated_at: new Date().toISOString(),
        status: "FIXTURE",
        write_scopes: ["analytics.edit"],
        live_keys_used: false,
        providers: [],
        utm_health: {
          rows_with_valid_utm: 0,
          rows_missing_or_invalid_utm: 0,
        },
      }),
    ).toThrow();

    expect(() =>
      AiSearchVisibilityReportSchema.parse({
        brand_id: "VILLA_GLORY",
        generated_at: new Date().toISOString(),
        mode: "FIXTURE",
        write_scopes: [],
        live_probe: false,
        invented_verified_claims: true,
        probes: [],
        summary: "bad",
      }),
    ).toThrow();
  });
});
