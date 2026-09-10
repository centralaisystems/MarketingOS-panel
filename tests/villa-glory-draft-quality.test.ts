import { describe, expect, it } from "vitest";
import {
  InMemoryAuditSink,
  buildCampaignPack,
  extractPackDraftSignals,
  loadBrandPack,
  loadPhaseGates,
} from "@marketing-os/runtime";
import type { CampaignPack } from "@marketing-os/contracts";

const OBJECTIVE = "Draft a showroom enquiry plan for private residences";

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

describe("Villa Glory Wave 2 draft quality", () => {
  it("extracts pack signals without inventing VERIFIED claims", () => {
    const pack = loadBrandPack("VILLA_GLORY");
    const signals = extractPackDraftSignals(pack);

    expect(signals.official_name?.status).toBe("VERIFIED");
    expect(signals.official_name?.value).toBe("Villa Glory");
    expect(signals.category?.status).toBe("VERIFIED");
    expect(String(signals.category?.value)).toMatch(/luxury_furniture/);
    expect(signals.tone?.status).toBe("VERIFIED");
    expect(JSON.stringify(signals.tone?.value)).toMatch(/Refined|Consultative/);
    expect(signals.offerings.some((o) => o.name === "Living")).toBe(true);
    expect(signals.audiences.some((a) => a.label === "Private clients")).toBe(
      true,
    );
    expect(signals.ctas.some((c) => c.label === "Request Private Quote")).toBe(
      true,
    );
    expect(signals.approved_claims).toBeUndefined();
    expect(signals.missing_paths).toEqual(
      expect.arrayContaining([
        "channels.channels",
        "content_pillars.pillars",
        "claims.approved_claims",
        "visual.colors",
      ]),
    );
    expect(JSON.stringify(signals)).not.toMatch(/NOX FORM|NOX_FORM|LOTIN/);
  });

  it("builds a non-trivial Villa Glory pack from brand-pack fields", () => {
    const audit = new InMemoryAuditSink();
    const campaign = buildCampaignPack({
      brand_id: "VILLA_GLORY",
      objective: OBJECTIVE,
      requested_by: "test",
      writeReport: false,
      audit,
    });

    expect(campaign.brand_id).toBe("VILLA_GLORY");
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
    const stubHeadline = `Villa Glory: ${OBJECTIVE}`;

    expect(headline).not.toBe(stubHeadline);
    expect(headline).toMatch(/luxury furniture|interiors/i);
    expect(body).toMatch(/Refined|Warm|Consultative|Premium/);
    expect(body).toMatch(/complete home living|luxury furniture/i);
    expect(body).toMatch(/Living|Custom & Bespoke/);
    expect(body).toMatch(/Private clients/);
    expect(body).toMatch(/Request Private Quote/);
    expect(body).toMatch(/do not invent product specs/i);
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
    expect(socialText).toMatch(/furniture|interiors|collection|consultation/i);
    expect(socialText).toMatch(/Request Private Quote|Living|Private clients/i);

    const creative = firstDeliverable(
      campaign.creative_briefs[0],
      "creative_brief",
    );
    const visual = String(creative.visual_direction ?? "");
    expect(visual).toMatch(/luxury furniture|interiors|villas|showroom/i);
    expect(visual).toMatch(/MISSING/);
    expect(creative.do_not).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/product specs|prices|stock/i),
      ]),
    );
    expect(creative.scene_subjects).toEqual(
      expect.arrayContaining(["Living", "Dining"]),
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
    expect(recommendation.audience_notes.join("\n")).toMatch(/Private clients/);
    expect(recommendation.creative_notes.join("\n")).toMatch(
      /Request Private Quote|luxury furniture/i,
    );
    expect(recommendation.budget_notes.join("\n")).toMatch(/WAVE_6/);

    const strategy = firstDeliverable(campaign.strategy, "campaign_strategy_outline");
    expect(String(strategy.known_positioning)).toMatch(/luxury furniture/i);
    expect(String(strategy.offer_messaging)).toMatch(/Request Private Quote/);

    const blob = flattenPackText(campaign);
    expect(blob).not.toMatch(/NOX FORM|NOX_FORM|NOX TECH|LOTIN/);
    expect(blob).not.toMatch(/guaranteed 40%|risk-free/i);
  });

  it("keeps live flags off after draft-quality work", () => {
    const gates = loadPhaseGates();
    expect(gates.enabled_waves).toEqual([
      "WAVE_1_REGISTRY",
      "WAVE_2_CONTENT_FACTORY",
      "WAVE_3_DB_PANEL",
    ]);
    expect(gates.live_publish_allowed).toBe(false);
    expect(gates.live_ads_allowed).toBe(false);
  });
});
