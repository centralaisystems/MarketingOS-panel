import { describe, expect, it } from "vitest";
import {
  InMemoryAuditSink,
  buildCampaignPack,
  extractPackDraftSignals,
  loadBrandPack,
  loadBrandRegistry,
  loadPhaseGates,
  LOTIN_FIXTURE_DRIVE_FOLDER_ID,
} from "@marketing-os/runtime";
import type { CampaignPack } from "@marketing-os/contracts";

const OBJECTIVE = "Draft a qualified-enquiry plan for UAE property consultations";

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

describe("LOTIN Wave 2 draft quality", () => {
  it("keeps committed LOTIN registry fixture Drive on and owner automation off", () => {
    const entry = loadBrandRegistry({ forceReload: true }).brands.find(
      (row) => row.brand_id === "LOTIN",
    );
    if (!entry) throw new Error("LOTIN missing from registry");
    expect(entry.asset_drive_folder_id).toBe(LOTIN_FIXTURE_DRIVE_FOLDER_ID);
    expect(entry.automation_enabled).toBe(false);
    expect(entry.owner_email_enabled).toBe(false);
    expect(entry.owner_email).toBeUndefined();
  });

  it("extracts pack signals without inventing VERIFIED claims", () => {
    const pack = loadBrandPack("LOTIN");
    const signals = extractPackDraftSignals(pack);

    expect(signals.official_name?.status).toBe("VERIFIED");
    expect(signals.official_name?.value).toBe("Lotin Real Estate");
    expect(signals.category?.status).toBe("VERIFIED");
    expect(String(signals.category?.value)).toMatch(/real_estate_brokerage/);
    expect(signals.tone?.status).toBe("VERIFIED");
    expect(JSON.stringify(signals.tone?.value)).toMatch(/Professional|Discreet|Trust-focused/);
    expect(signals.offerings.some((o) => o.name === "Off-plan property brokerage")).toBe(
      true,
    );
    expect(
      signals.audiences.some(
        (a) => a.label === "Property investors and private real-estate portfolio clients",
      ),
    ).toBe(true);
    expect(signals.ctas.some((c) => c.label === "Book a consultation")).toBe(true);
    expect(signals.approved_claims).toBeUndefined();
    expect(signals.missing_paths).toEqual(
      expect.arrayContaining([
        "channels.channels",
        "content_pillars.pillars",
        "claims.approved_claims",
        "visual.colors",
      ]),
    );
    expect(JSON.stringify(signals)).not.toMatch(/Villa Glory|VILLA_GLORY|NOX FORM|NOX_FORM/);
  });

  it("builds a non-trivial LOTIN pack from brand-pack fields", () => {
    const audit = new InMemoryAuditSink();
    const campaign = buildCampaignPack({
      brand_id: "LOTIN",
      objective: OBJECTIVE,
      requested_by: "test",
      writeReport: false,
      audit,
    });

    expect(campaign.brand_id).toBe("LOTIN");
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
    const stubHeadline = `LOTIN: ${OBJECTIVE}`;

    expect(headline).not.toBe(stubHeadline);
    expect(headline).toMatch(/Lotin Real Estate/);
    expect(headline).toMatch(/real estate brokerage/i);
    expect(body).toMatch(/Professional|Trust-focused|Discreet/);
    expect(body).toMatch(/UAE real estate brokerage|brokerage and advisory/i);
    expect(body).toMatch(/Off-plan property brokerage|Buying and selling brokerage/);
    expect(body).toMatch(/Property investors|Home buyers|Property owners/);
    expect(body).toMatch(/Book a consultation/);
    expect(body).toMatch(/do not invent ROI|guaranteed returns/i);
    expect(body).toMatch(/MISSING/);
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

    const social = firstDeliverable(
      campaign.social_calendar,
      "social_calendar_draft",
    );
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
    expect(socialText).toMatch(/brokerage|advisory|consultation|leasing/i);
    expect(socialText).toMatch(/Book a consultation|Off-plan property brokerage/i);

    const creative = firstDeliverable(
      campaign.creative_briefs[0],
      "creative_brief",
    );
    const visual = String(creative.visual_direction ?? "");
    expect(visual).toMatch(/real estate brokerage|advisory|UAE/i);
    expect(visual).toMatch(/MISSING/);
    expect(creative.do_not).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/ROI|guaranteed returns|inventory|pricing/i),
      ]),
    );
    expect(creative.scene_subjects).toEqual(
      expect.arrayContaining([
        "Off-plan property brokerage",
        "Buying and selling brokerage",
      ]),
    );

    const paid = firstDeliverable(
      campaign.paid_recommendations,
      "paid_recommendation",
    );
    expect(paid.launch_allowed).toBe(false);
    const recommendation = paid.recommendation as {
      launch_allowed: boolean;
      audience_notes: string[];
      creative_notes: string[];
      budget_notes: string[];
    };
    expect(recommendation.launch_allowed).toBe(false);
    expect(recommendation.audience_notes.join("\n")).toMatch(/Property investors|Home buyers/);
    expect(recommendation.creative_notes.join("\n")).toMatch(
      /Book a consultation|real estate brokerage/i,
    );
    expect(recommendation.budget_notes.join("\n")).toMatch(/WAVE_6/);

    const strategy = firstDeliverable(campaign.strategy, "campaign_strategy_outline");
    expect(String(strategy.known_positioning)).toMatch(/real estate brokerage/i);
    expect(String(strategy.offer_messaging)).toMatch(/Book a consultation/);

    const blob = flattenPackText(campaign);
    expect(blob).not.toMatch(/Villa Glory|VILLA_GLORY|NOX FORM|NOX TECH/);
    expect(blob).not.toMatch(/guaranteed 40%|risk-free|living-room set/i);
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
