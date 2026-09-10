import { describe, expect, it } from "vitest";
import {
  InMemoryAuditSink,
  buildCampaignPack,
  extractPackDraftSignals,
  loadBrandPack,
  loadBrandRegistry,
  loadPhaseGates,
  NOX_TECH_FIXTURE_DRIVE_FOLDER_ID,
  verifiedOfferingNames,
} from "@marketing-os/runtime";
import type { CampaignPack } from "@marketing-os/contracts";

const OBJECTIVE = "Draft a qualified discovery plan for B2B implementation conversations";

const REJECTED_ROI = /180–240%|200–280%|150–200%|160–220%|170–230%/;
const REJECTED_PACKAGES = /CRM Core|Sales Pipeline/;

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

describe("NOX TECH Wave 2 draft quality", () => {
  it("keeps committed NOX TECH registry fixture Drive on and owner automation off", () => {
    const entry = loadBrandRegistry({ forceReload: true }).brands.find(
      (row) => row.brand_id === "NOX_TECH",
    );
    if (!entry) throw new Error("NOX_TECH missing from registry");
    expect(entry.asset_drive_folder_id).toBe(NOX_TECH_FIXTURE_DRIVE_FOLDER_ID);
    expect(entry.automation_enabled).toBe(false);
    expect(entry.owner_email_enabled).toBe(false);
    expect(entry.owner_email).toBeUndefined();
  });

  it("extracts pack signals without promoting rejected packages or ROI", () => {
    const pack = loadBrandPack("NOX_TECH");
    const signals = extractPackDraftSignals(pack);

    expect(signals.official_name?.status).toBe("VERIFIED");
    expect(signals.official_name?.value).toBe("NOX TECH");
    expect(signals.category?.status).toBe("VERIFIED");
    expect(String(signals.category?.value)).toMatch(/ai_assisted_sales_implementation/);
    expect(signals.tone?.status).toBe("VERIFIED");
    expect(JSON.stringify(signals.tone?.value)).toMatch(
      /Clear|Technical|Professional|Implementation-focused/,
    );
    expect(verifiedOfferingNames(signals)).toEqual([]);
    expect(signals.offerings.every((o) => o.name_status !== "VERIFIED")).toBe(true);
    expect(JSON.stringify(signals.offerings)).not.toMatch(REJECTED_PACKAGES);
    expect(
      signals.audiences.some(
        (a) =>
          a.label ===
          "Businesses needing custom AI, automation, sales, or implementation tools",
      ),
    ).toBe(true);
    expect(signals.ctas.some((c) => c.label === "Book Discovery")).toBe(true);
    expect(signals.approved_claims).toBeUndefined();
    expect(signals.prohibited_claims?.status).toBe("VERIFIED");
    expect(JSON.stringify(signals.prohibited_claims?.value)).toMatch(
      /ROI|seeded module|OBSERVED_IN_CODE/,
    );
    expect(JSON.stringify(signals)).not.toMatch(REJECTED_ROI);
    expect(signals.missing_paths).toEqual(
      expect.arrayContaining([
        "channels.channels",
        "content_pillars.pillars",
        "claims.approved_claims",
        "visual.colors",
      ]),
    );
    expect(JSON.stringify(signals)).not.toMatch(
      /Villa Glory|VILLA_GLORY|NOX FORM|Lotin Real Estate/,
    );
  });

  it("builds a pack from VERIFIED identity/positioning only — no commercial SKUs or ROI", () => {
    const audit = new InMemoryAuditSink();
    const campaign = buildCampaignPack({
      brand_id: "NOX_TECH",
      objective: OBJECTIVE,
      requested_by: "test",
      writeReport: false,
      audit,
    });

    expect(campaign.brand_id).toBe("NOX_TECH");
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
    const stubHeadline = `NOX TECH: ${OBJECTIVE}`;

    expect(headline).not.toBe(stubHeadline);
    expect(headline).toMatch(/NOX TECH/);
    expect(headline).toMatch(/ai assisted sales implementation/i);
    expect(body).toMatch(/Clear|Technical|Professional|Implementation-focused/);
    expect(body).toMatch(/sales and implementation platform/i);
    expect(body).toMatch(
      /Businesses needing custom AI, automation, sales, or implementation tools/,
    );
    expect(body).toMatch(/Book Discovery/);
    expect(body).toMatch(/Approved commercial claims: MISSING/);
    expect(body).toMatch(/not VERIFIED|do not invent product specs|MISSING/);
    expect(body).not.toMatch(REJECTED_ROI);
    expect(body).not.toMatch(REJECTED_PACKAGES);
    expect(String(content.compliance_notes ?? "")).toMatch(
      /ROI|seeded module|OBSERVED_IN_CODE|commercially offered/i,
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
    expect(socialText).toMatch(/ai assisted sales implementation|implementation platform/i);
    expect(socialText).toMatch(/No VERIFIED offering names|Book Discovery/);
    expect(socialText).not.toMatch(REJECTED_ROI);
    expect(socialText).not.toMatch(REJECTED_PACKAGES);

    const creative = firstDeliverable(campaign.creative_briefs[0], "creative_brief");
    const visual = String(creative.visual_direction ?? "");
    expect(visual).toMatch(/ai assisted sales implementation|implementation platform/i);
    expect(visual).toMatch(/MISSING/);
    expect(creative.scene_subjects).toEqual([]);
    expect(creative.do_not).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/ROI|seeded module|OBSERVED_IN_CODE|commercially offered/i),
      ]),
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
      /Businesses needing custom AI, automation, sales, or implementation tools/,
    );
    expect(recommendation.creative_notes.join("\n")).toMatch(
      /Book Discovery|ai assisted sales implementation/i,
    );
    expect(recommendation.creative_notes.join("\n")).toMatch(/No ROI|ROI/);
    expect(recommendation.budget_notes.join("\n")).toMatch(/WAVE_6/);
    expect(recommendation.creative_notes.join("\n")).not.toMatch(REJECTED_ROI);

    const strategy = firstDeliverable(campaign.strategy, "campaign_strategy_outline");
    expect(String(strategy.known_positioning)).toMatch(/sales and implementation platform/i);
    expect(String(strategy.offer_messaging)).toMatch(/Book Discovery/);
    expect(strategy.known_offerings).toEqual([]);

    const blob = flattenPackText(campaign);
    expect(blob).not.toMatch(/Villa Glory|VILLA_GLORY|NOX FORM|Lotin Real Estate/);
    expect(blob).not.toMatch(REJECTED_ROI);
    expect(blob).not.toMatch(REJECTED_PACKAGES);
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
