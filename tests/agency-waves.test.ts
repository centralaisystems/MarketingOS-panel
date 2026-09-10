import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  rmSync,
  cpSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  clearBrandRegistryCache,
  loadBrandRegistry,
  listBrandIds,
  assertRegisteredBrandId,
  slugForBrandId,
  normalizeBrandAlias,
  buildCampaignPack,
  dryRunSocialPublish,
  createLeadDraft,
  buildDailyDigest,
  loadPhaseGates,
  InMemoryAuditSink,
} from "@marketing-os/runtime";
import type { CampaignPack } from "@marketing-os/contracts";

const REPO_BRANDS = join(process.cwd(), "brands");

describe("Wave 1 brand registry", () => {
  beforeEach(() => clearBrandRegistryCache());
  afterEach(() => clearBrandRegistryCache());

  it("loads registry and resolves slug/alias", () => {
    const reg = loadBrandRegistry({ brandsRoot: REPO_BRANDS });
    expect(reg.brands.length).toBeGreaterThanOrEqual(4);
    expect(listBrandIds({ brandsRoot: REPO_BRANDS })).toContain("LOTIN");
    expect(slugForBrandId("VILLA_GLORY", { brandsRoot: REPO_BRANDS })).toBe(
      "villa-glory",
    );
    expect(normalizeBrandAlias("nox form")).toBe("NOX_FORM");
  });

  it("rejects unknown brands", () => {
    expect(() =>
      assertRegisteredBrandId("NOT_A_REAL_BRAND", { brandsRoot: REPO_BRANDS }),
    ).toThrow(/Unknown brand_id/);
  });
});

function assertInternalDraftPack(
  pack: CampaignPack,
  brandId: string,
  audit: InMemoryAuditSink,
): void {
  expect(pack.brand_id).toBe(brandId);
  expect(pack.approval_level_cap).toBe("LEVEL_1");
  expect(pack.live_publish).toBe(false);
  expect(pack.live_ads).toBe(false);
  expect(pack.content_drafts.length).toBeGreaterThan(0);
  expect(pack.social_calendar).toBeTruthy();
  expect(pack.creative_briefs.length).toBeGreaterThan(0);
  expect(pack.paid_recommendations).toBeTruthy();
  expect(pack.guardian.reviewed).toEqual(
    expect.arrayContaining(["content", "social", "creative"]),
  );
  const guardianEvents = audit
    .list({ brand_id: brandId })
    .filter(
      (e) =>
        e.event_type === "GUARDIAN_PASSED" ||
        e.event_type === "GUARDIAN_REJECTED",
    );
  expect(guardianEvents.length).toBeGreaterThanOrEqual(3);
  if (pack.guardian.passed) {
    expect(pack.approvable).toBe(true);
  } else {
    expect(pack.approvable).toBe(false);
    expect(pack.guardian.reasons.length).toBeGreaterThan(0);
  }
}

describe("Wave 2 campaign factory", () => {
  it.each(["LOTIN", "VILLA_GLORY"] as const)(
    "builds an internal e2e pack for %s",
    (brand_id) => {
      const audit = new InMemoryAuditSink();
      const pack = buildCampaignPack({
        brand_id,
        objective: "Draft social plan for qualified enquiries",
        requested_by: "test",
        writeReport: false,
        audit,
      });
      assertInternalDraftPack(pack, brand_id, audit);
    },
  );
});

describe("Wave 5-8 gated foundations", () => {
  it("keeps Wave 1–4 enabled and live flags off", () => {
    const gates = loadPhaseGates();
    expect(gates.enabled_waves).toEqual([
      "WAVE_1_REGISTRY",
      "WAVE_2_CONTENT_FACTORY",
      "WAVE_3_DB_PANEL",
      "WAVE_4_ANALYTICS_ASSETS",
    ]);
    expect(gates.enabled_waves).not.toContain("WAVE_5_SOCIAL_PUBLISH");
    expect(gates.enabled_waves).not.toContain("WAVE_6_PAID_ADS");
    expect(gates.live_publish_allowed).toBe(false);
    expect(gates.live_ads_allowed).toBe(false);
  });

  it("blocks wave 5–8 execution until those waves are enabled", () => {
    expect(() =>
      dryRunSocialPublish({
        brand_id: "LOTIN",
        channel: "INSTAGRAM",
        caption: "Internal draft caption only",
        dry_run: true,
      }),
    ).toThrow(/WAVE_5_SOCIAL_PUBLISH/);
    expect(() =>
      createLeadDraft({
        brand_id: "LOTIN",
        pii_ref: "vault:lead_abc123",
        source: "FORM",
      }),
    ).toThrow(/WAVE_7_CRM/);
    expect(() => buildDailyDigest()).toThrow(/WAVE_8_AUTOMATION_DASHBOARD/);
  });

  it("rejects raw PII in CRM lead drafts before wave execution", () => {
    expect(() =>
      createLeadDraft({
        brand_id: "LOTIN",
        pii_ref: "person@example.com",
        source: "FORM",
      }),
    ).toThrow(/opaque/);
  });
});

describe("registry isolation with fifth brand fixture", () => {
  let root: string;
  beforeEach(() => {
    clearBrandRegistryCache();
    root = mkdtempSync(join(tmpdir(), "mos-reg-"));
    mkdirSync(join(root, "_shared"), { recursive: true });
    cpSync(
      join(REPO_BRANDS, "_shared", "REGISTRY.json"),
      join(root, "_shared", "REGISTRY.json"),
    );
    cpSync(
      join(REPO_BRANDS, "_shared", "RELATIONSHIPS.json"),
      join(root, "_shared", "RELATIONSHIPS.json"),
    );
    for (const slug of ["lotin", "villa-glory", "nox-form", "nox-tech"]) {
      cpSync(join(REPO_BRANDS, slug), join(root, slug), { recursive: true });
    }
    const reg = JSON.parse(
      readFileSync(join(root, "_shared", "REGISTRY.json"), "utf8"),
    ) as {
      updated_at: string;
      brands: Array<Record<string, unknown>>;
    };
    reg.brands.push({
      brand_id: "DEMO_FIFTH",
      slug: "demo-fifth",
      display_name: "Demo Fifth",
      aliases: ["demo fifth", "demo-fifth"],
      status: "ACTIVE",
      default_locales: ["en"],
      created_at: new Date().toISOString(),
    });
    reg.updated_at = new Date().toISOString();
    writeFileSync(
      join(root, "_shared", "REGISTRY.json"),
      JSON.stringify(reg, null, 2),
    );
    cpSync(join(REPO_BRANDS, "lotin"), join(root, "demo-fifth"), {
      recursive: true,
    });
    for (const file of [
      "profile.json",
      "IDENTITY.json",
      "ONBOARDING.json",
      "POSITIONING.json",
      "OFFERINGS.json",
      "AUDIENCES.json",
      "VOICE.json",
      "VISUAL.json",
      "CHANNELS.json",
      "CONTENT_PILLARS.json",
      "CLAIMS.json",
      "CTA.json",
      "COMPETITORS.json",
      "LEARNINGS.json",
      "SOURCES.json",
      "EVIDENCE_LEDGER.json",
    ]) {
      const p = join(root, "demo-fifth", file);
      const j = JSON.parse(readFileSync(p, "utf8")) as Record<string, unknown>;
      j.brand_id = "DEMO_FIFTH";
      if (file === "profile.json") {
        j.slug = "demo-fifth";
        j.display_name = "Demo Fifth";
      }
      writeFileSync(p, JSON.stringify(j, null, 2));
    }
  });
  afterEach(() => {
    clearBrandRegistryCache();
    rmSync(root, { recursive: true, force: true });
  });

  it("lists fifth brand from registry", () => {
    expect(listBrandIds({ brandsRoot: root })).toContain("DEMO_FIFTH");
    expect(slugForBrandId("DEMO_FIFTH", { brandsRoot: root })).toBe(
      "demo-fifth",
    );
    expect(() =>
      assertRegisteredBrandId("UNKNOWN_X", { brandsRoot: root }),
    ).toThrow();
  });
});
