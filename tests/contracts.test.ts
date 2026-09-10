import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  AgentResultSchema,
  AiSearchVisibilityReportSchema,
  AnalyticsSnapshotSchema,
  ApprovalDecisionSchema,
  AssetRecordSchema,
  FigmaArrangeJobSchema,
  HiggsfieldGenerateJobSchema,
  VideoProduceJobSchema,
  AdOutboxItemSchema,
  AdStagingJobSchema,
  BrandIdSchema,
  BrandRegistryEntrySchema,
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

  it("accepts optional owner-email fields on a registry entry", () => {
    const entry = BrandRegistryEntrySchema.parse({
      brand_id: "VILLA_GLORY",
      slug: "villa-glory",
      display_name: "Villa Glory",
      owner_email: "villa-glory-owner@example.test",
      owner_email_enabled: true,
    });
    expect(entry.owner_email).toBe("villa-glory-owner@example.test");
    expect(entry.owner_email_enabled).toBe(true);
    const lotin = BrandRegistryEntrySchema.parse({
      brand_id: "LOTIN",
      slug: "lotin",
      display_name: "LOTIN",
    });
    expect(lotin.owner_email_enabled).toBe(false);
    expect(lotin.automation_enabled).toBe(false);
    const vgAuto = BrandRegistryEntrySchema.parse({
      brand_id: "VILLA_GLORY",
      slug: "villa-glory",
      display_name: "Villa Glory",
      automation_enabled: true,
    });
    expect(vgAuto.automation_enabled).toBe(true);
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

  it("validates a Figma arrange job as GENERATED / UNVERIFIED / not live", () => {
    const now = new Date().toISOString();
    const job = FigmaArrangeJobSchema.parse({
      job_id: randomUUID(),
      brand_id: "VILLA_GLORY",
      source_asset_ids: [randomUUID()],
      layout_brief: {
        title: "Arrange approved stills",
        description: "Instagram grid. No commercial claims.",
      },
      status: "READY_FOR_OWNER_REVIEW",
      source: "fixture",
      output: {
        file_key: "fixture-villa-glory-arrange",
        file_url: "https://www.figma.com/design/fixture-villa-glory-arrange/Villa-Glory-Arrange",
        node_id: "1:10",
        node_url:
          "https://www.figma.com/design/fixture-villa-glory-arrange/Villa-Glory-Arrange?node-id=1-10",
        template_id: "villa-glory-instagram-grid",
      },
      generated_asset_id: randomUUID(),
      guardian: { passed: true, reasons: [], reviewed: ["figma-arrange"] },
      created_at: now,
      updated_at: now,
      message: "Arranged",
    });
    expect(job.knowledge_status).toBe("UNVERIFIED");
    expect(job.provenance).toBe("GENERATED");
    expect(job.approval_status).toBe("DRAFT");
    expect(job.live_publish).toBe(false);
    expect(job.live_ads).toBe(false);
  });

  it("validates a Higgsfield generate job as GENERATED / UNVERIFIED / not live", () => {
    const now = new Date().toISOString();
    const job = HiggsfieldGenerateJobSchema.parse({
      job_id: randomUUID(),
      brand_id: "VILLA_GLORY",
      gap: {
        has_gap: true,
        needs: [
          {
            usage_tag: "story",
            aspect: "9:16",
            reason: "No approved still covers story / 9:16.",
          },
        ],
        reason: "No approved still covers story / 9:16.",
      },
      layout_brief: {
        title: "Fill still gaps",
        description: "Story still 9:16. No commercial claims.",
        needed_usage_tags: ["story"],
        needed_aspects: ["9:16"],
      },
      prompt: {
        text: "Photoreal still. Do not invent VERIFIED ROI, SKU, or partner claims.",
        verified_fields: ["voice.tone: Refined"],
        unverified_fields: [],
        forbidden_claims_note: "Do not invent VERIFIED ROI, SKU, or partner claims.",
      },
      status: "READY_FOR_OWNER_REVIEW",
      source: "fixture",
      output: {
        media_id: "fixture-villa_glory-story-9x16-abc",
        storage_uri: "mos://higgsfield/VILLA_GLORY/job",
        aspect: "9:16",
        usage_tag: "story",
        model: "fixture-still",
      },
      generated_asset_id: randomUUID(),
      guardian: { passed: true, reasons: [], reviewed: ["higgsfield-generate"] },
      created_at: now,
      updated_at: now,
      message: "Generated",
    });
    expect(job.knowledge_status).toBe("UNVERIFIED");
    expect(job.provenance).toBe("GENERATED");
    expect(job.approval_status).toBe("DRAFT");
    expect(job.live_publish).toBe(false);
    expect(job.live_ads).toBe(false);
  });

  it("validates a video produce job as GENERATED / UNVERIFIED / not live / not rendered", () => {
    const now = new Date().toISOString();
    const stillId = randomUUID();
    const job = VideoProduceJobSchema.parse({
      job_id: randomUUID(),
      brand_id: "VILLA_GLORY",
      brief: {
        title: "Video package",
        description: "Reel from approved stills. No commercial claims.",
        target_format: "reel",
      },
      approved_still_ids: [stillId],
      target_format: "reel",
      status: "READY_FOR_OWNER_REVIEW",
      source: "fixture",
      output: {
        package_kind: "export_package",
        recipe_id: "fixture-villa_glory-reel-abc",
        storage_uri: "mos://video/VILLA_GLORY/job",
        target_format: "reel",
        aspect: "9:16",
        duration_ms: 15000,
        timeline: [
          {
            order: 0,
            asset_id: stillId,
            role: "approved_still",
            duration_ms: 15000,
            storage_uri: "mos://drive/VILLA_GLORY/still",
          },
        ],
        captions: [
          {
            order: 0,
            text: "Refined, Warm",
            source_field: "voice.tone",
            knowledge_status: "VERIFIED",
          },
        ],
        asset_list: [
          {
            asset_id: stillId,
            title: "Living room",
            storage_uri: "mos://drive/VILLA_GLORY/still",
            role: "approved_still",
          },
        ],
        import_hint: "Fixture export package. Not a rendered video.",
        adapter_label: "fixture-video-package",
        rendered_video: false,
        desktop_control: false,
        published: false,
      },
      generated_asset_id: randomUUID(),
      guardian: { passed: true, reasons: [], reviewed: ["video-produce"] },
      created_at: now,
      updated_at: now,
      message: "Packaged",
    });
    expect(job.knowledge_status).toBe("UNVERIFIED");
    expect(job.provenance).toBe("GENERATED");
    expect(job.approval_status).toBe("DRAFT");
    expect(job.live_publish).toBe(false);
    expect(job.live_ads).toBe(false);
    expect(job.output.rendered_video).toBe(false);
    expect(job.output.published).toBe(false);
    expect(job.output.desktop_control).toBe(false);
  });

  it("validates Wave 6 staging jobs and outbox as recommendation-only", () => {
    const now = new Date().toISOString();
    const campaign_id = randomUUID();
    const pack_id = randomUUID();
    const draft = {
      brand_id: "VILLA_GLORY" as const,
      platform: "META" as const,
      environment: "non-prod" as const,
      adapter: "meta_ads_staging" as const,
      objective: "Qualified villa enquiries",
      audience_notes: [],
      creative_notes: [],
      test_plan: [],
      budget: {
        kind: "RECOMMENDATION" as const,
        notes: ["WAVE_6 staging only"],
        mutation_allowed: false as const,
        launch_allowed: false as const,
      },
      campaign_id,
      pack_id,
      launch_allowed: false as const,
    };
    const job = AdStagingJobSchema.parse({
      job_id: randomUUID(),
      brand_id: "VILLA_GLORY",
      platform: "META",
      action: "LAUNCH",
      mode: "STAGING",
      status: "STAGING_RECORDED",
      campaign_id,
      pack_id,
      outbox_id: randomUUID(),
      campaign_draft: draft,
      budget: draft.budget,
      actor: "panel-operator",
      rationale: "Stage only",
      live_ads: false,
      created_at: now,
    });
    expect(job.live_ads).toBe(false);
    expect(job.budget.mutation_allowed).toBe(false);
    const outbox = AdOutboxItemSchema.parse({
      outbox_id: randomUUID(),
      brand_id: "VILLA_GLORY",
      platform: "META",
      action: "LAUNCH",
      mode: "STAGING",
      status: "STAGING_RECORDED",
      staging: true,
      would_launch: true,
      campaign_id,
      pack_id,
      campaign_draft: draft,
      budget: draft.budget,
      actor: "panel-operator",
      rationale: "Stage only",
      live_ads: false,
      created_at: now,
    });
    expect(outbox.would_mutate_budget).toBe(false);
    expect(outbox.external_side_effects).toBe(false);
    expect(() =>
      AdOutboxItemSchema.parse({ ...outbox, live_ads: true }),
    ).toThrow();
  });
});
