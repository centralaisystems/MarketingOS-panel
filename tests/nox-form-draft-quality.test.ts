import { describe, expect, it } from "vitest";
import {
  InMemoryAuditSink,
  buildCampaignPack,
  extractPackDraftSignals,
  loadBrandPack,
  loadBrandRegistry,
  loadPhaseGates,
  NOX_FORM_FIXTURE_DRIVE_FOLDER_ID,
} from "@marketing-os/runtime";
import type { CampaignPack } from "@marketing-os/contracts";

const OBJECTIVE = "Draft a qualified project-enquiry plan for private villa interiors";

function asResult(value: unknown): {
  summary: string;
  deliverables: Array<Record<string, unknown>>;
  missing_information: string[];
  statements: Array<{ text: string; kind: string; confidence: string }>;
} {
  return value as {
    summary: string;
    deliverables: Array<Record<string, unknown>>;
    missing_information: string[];
    statements: Array<{ text: string; kind: string; confidence: string }>;
  };
}

function firstDeliverable(
  result: unknown,
  type: string,
): Record<string, unknown> {
  const found = asResult(result).deliverables.find((d) => d.type === type);
  if (!found) throw new Error(`Missing deliverable ${type}`);
  return found;
}

function flattenPackText(pack: CampaignPack): string {
  return JSON.stringify({
    strategy: pack.strategy,
    content_drafts: pack.content_drafts,
    social_calendar: pack.social_calendar,
    creative_briefs: pack.creative_briefs,
    paid_recommendations: pack.paid_recommendations,
  });
}

describe("NOX FORM Wave 2 draft quality", () => {
  it("keeps committed NOX FORM registry fixture Drive on and owner automation off", () => {
    const entry = loadBrandRegistry({ forceReload: true }).brands.find(
      (row) => row.brand_id === "NOX_FORM",
    );
    if (!entry) throw new Error("NOX_FORM missing from registry");
    expect(entry.asset_drive_folder_id).toBe(NOX_FORM_FIXTURE_DRIVE_FOLDER_ID);
    expect(entry.automation_enabled).toBe(false);
    expect(entry.owner_email_enabled).toBe(false);
    expect(entry.owner_email).toBeUndefined();
  });

  it("extracts pack signals without inventing VERIFIED claims", () => {
    const pack = loadBrandPack("NOX_FORM");
    const signals = extractPackDraftSignals(pack);

    expect(signals.official_name?.status).toBe("VERIFIED");
    expect(signals.official_name?.value).toBe("NOX FORM");
    expect(signals.category?.status).toBe("VERIFIED");
    expect(String(signals.category?.value)).toMatch(/architecture_interior_design_turnkey/);
    expect(signals.tone?.status).toBe("VERIFIED");
    expect(JSON.stringify(signals.tone?.value)).toMatch(
      /Refined|Atmospheric|Material-honest|Professional studio/,
    );
    expect(signals.offerings.some((o) => o.name === "Interior Architecture")).toBe(true);
    expect(signals.offerings.some((o) => o.name === "Turnkey Fit-Out")).toBe(true);
    expect(
      signals.audiences.some((a) => a.label === "Private villa / residence clients"),
    ).toBe(true);
    expect(signals.ctas.some((c) => c.label === "Start a Project")).toBe(true);
    expect(signals.approved_claims).toBeUndefined();
    expect(signals.missing_paths).toEqual(
      expect.arrayContaining([
        "channels.channels",
        "content_pillars.pillars",
        "claims.approved_claims",
        "visual.imagery",
      ]),
    );
    expect(signals.missing_paths).not.toContain("visual.colors");
    expect(JSON.stringify(signals)).not.toMatch(
      /Villa Glory|VILLA_GLORY|Lotin Real Estate|NOX TECH|NOX_TECH/,
    );
  });

  it("builds a non-trivial NOX FORM pack from brand-pack fields", () => {
    const audit = new InMemoryAuditSink();
    const campaign = buildCampaignPack({
      brand_id: "NOX_FORM",
      objective: OBJECTIVE,
      requested_by: "test",
      writeReport: false,
      audit,
    });

    expect(campaign.brand_id).toBe("NOX_FORM");
    expect(campaign.approval_level_cap).toBe("LEVEL_1");
    expect(campaign.live_publish).toBe(false);
    expect(campaign.live_ads).toBe(false);
    expect(campaign.guardian.reviewed).toEqual(
      expect.arrayContaining(["content", "social", "creative"]),
    );
    if (!campaign.guardian.passed) {
      expect(campaign.approvable).toBe(false);
      expect(campaign.guardian.reasons.length).toBeGreaterThan(0);
    }

    const content = firstDeliverable(campaign.content_drafts[0], "draft_copy_pack");
    const headline = String(content.headline ?? "");
    const body = String(content.body ?? "");
    const stubHeadline = `NOX FORM: ${OBJECTIVE}`;

    expect(headline).not.toBe(stubHeadline);
    expect(headline).toMatch(/NOX FORM/);
    expect(headline).toMatch(/architecture|interior design|turnkey/i);
    expect(body).toMatch(/Refined|Atmospheric|Material-honest|Professional studio/);
    expect(body).toMatch(/architecture, interior design, and turnkey/i);
    expect(body).toMatch(/Interior Architecture|Turnkey Fit-Out|Luxury Furnishing/);
    expect(body).toMatch(/Private villa \/ residence clients|Hospitality space clients/);
    expect(body).toMatch(/Start a Project/);
    expect(body).toMatch(/do not invent product specs|MISSING/);
    expect(String(content.compliance_notes ?? "")).toMatch(
      /completed projects|awards|client names|timelines|budgets/i,
    );
    expect(content.invented_claims).toBe(false);
    expect(content.pack_citations).toEqual(
      expect.arrayContaining([
        "voice.tone",
        "positioning.positioning_statement",
        "claims.prohibited_claims",
      ]),
    );

    const contentResult = asResult(campaign.content_drafts[0]);
    expect(contentResult.missing_information).toEqual(
      expect.arrayContaining(["channels.channels", "claims.approved_claims"]),
    );

    const social = firstDeliverable(campaign.social_calendar, "social_calendar_draft");
    expect(social.live_publish).toBe(false);
    const week = social.week as Array<{
      day: string;
      idea: string;
      caption?: string;
      caption_hint?: string;
    }>;
    const socialText = week
      .map((row) => `${row.idea} ${row.caption ?? ""} ${row.caption_hint ?? ""}`)
      .join("\n");
    expect(socialText).not.toBe(
      `Hook related to: ${OBJECTIVE}\nProof / process / product story (verified facts only)\nCTA / conversation starter`,
    );
    expect(socialText).toMatch(/architecture|interior|turnkey|studio/i);
    expect(socialText).toMatch(/Start a Project|Interior Architecture|Turnkey Fit-Out/i);

    const creative = firstDeliverable(campaign.creative_briefs[0], "creative_brief");
    const visual = String(creative.visual_direction ?? "");
    expect(visual).toMatch(/#15110f|#9a7b4f|noir|bronze/i);
    expect(creative.do_not).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/completed projects|awards|client names|timelines|budgets/i),
      ]),
    );
    expect(creative.scene_subjects).toEqual(
      expect.arrayContaining(["Interior Architecture", "Turnkey Fit-Out"]),
    );

    const paid = firstDeliverable(campaign.paid_recommendations, "paid_recommendation");
    expect(paid.launch_allowed).toBe(false);
    const recommendation = paid.recommendation as {
      launch_allowed: boolean;
      audience_notes: string[];
      creative_notes: string[];
      budget_notes: string[];
    };
    expect(recommendation.launch_allowed).toBe(false);
    expect(recommendation.audience_notes.join("\n")).toMatch(
      /Private villa \/ residence clients|Hospitality space clients/,
    );
    expect(recommendation.creative_notes.join("\n")).toMatch(
      /Start a Project|architecture|interior design|turnkey/i,
    );
    expect(recommendation.budget_notes.join("\n")).toMatch(/WAVE_6/);

    const strategy = firstDeliverable(campaign.strategy, "campaign_strategy_outline");
    expect(String(strategy.known_positioning)).toMatch(/architecture|interior design|turnkey/i);
    expect(String(strategy.offer_messaging)).toMatch(/Start a Project/);

    const blob = flattenPackText(campaign);
    expect(blob).not.toMatch(/Villa Glory|VILLA_GLORY|Lotin Real Estate|NOX TECH/);
    expect(blob).not.toMatch(/Request Private Quote|living-room set|guaranteed 40%|risk-free/i);
  });

  it("keeps live flags off after draft-quality work", () => {
    const gates = loadPhaseGates();
    expect(gates.enabled_waves).toEqual([
      "WAVE_1_REGISTRY",
      "WAVE_2_CONTENT_FACTORY",
      "WAVE_3_DB_PANEL",
      "WAVE_4_ANALYTICS_ASSETS",
      "WAVE_4B_ASSET_PIPELINE",
      "WAVE_5_SOCIAL_PUBLISH",
      "WAVE_6_PAID_ADS",
      "WAVE_7_CRM",
      "WAVE_8_AUTOMATION_DASHBOARD",
    ]);
    expect(gates.live_publish_allowed).toBe(false);
    expect(gates.live_ads_allowed).toBe(false);
  });
});
