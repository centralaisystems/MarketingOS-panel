/**
 * Phase 2B — populate Brand Brains from authorized sibling repositories (read-only).
 * Write scope: MarketingOS only. Does not auto-VERIFY. Does not start Phase 3.
 */
import { writeFileSync, mkdirSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  EvidenceLedgerSchema,
  type BrandId,
  type EvidenceCandidate,
  type CapabilityClaimState,
  type SourceType,
} from "@marketing-os/contracts";
import {
  applyEvidenceLedger,
  buildHumanReviewQueue,
  writeReviewArtifacts,
  guardianReviewAllBrands,
  computeBrandReadiness,
  loadBrandPack,
  loadOnboardingRecord,
  verifyBrandIntelligence,
  InMemoryAuditSink,
} from "@marketing-os/runtime";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const OBS = new Date().toISOString();
const BEFORE: Record<BrandId, { score: number; status: string; verified: number }> = {
  LOTIN: { score: 4, status: "BLOCKED", verified: 0 },
  VILLA_GLORY: { score: 3, status: "BLOCKED", verified: 0 },
  NOX_FORM: { score: 3, status: "BLOCKED", verified: 0 },
  NOX_TECH: { score: 3, status: "BLOCKED", verified: 0 },
};

function lotinEmpty(path: string): boolean {
  if (!existsSync(path)) return true;
  return readdirSync(path).filter((f) => !f.startsWith(".")).length === 0;
}

function cand(
  partial: Omit<EvidenceCandidate, "observed_at" | "rejected" | "placeholder_filtered" | "time_sensitive"> & {
    observed_at?: string;
    rejected?: boolean;
    placeholder_filtered?: boolean;
    time_sensitive?: boolean;
    capability_claim_state?: CapabilityClaimState;
  },
): EvidenceCandidate {
  return {
    ...partial,
    observed_at: partial.observed_at ?? OBS,
    time_sensitive: partial.time_sensitive ?? false,
    rejected: partial.rejected ?? false,
    placeholder_filtered: partial.placeholder_filtered ?? false,
  };
}

function writeLedger(brand: BrandId, slug: string, candidates: EvidenceCandidate[]): void {
  const dir = join(ROOT, "brands", slug);
  mkdirSync(dir, { recursive: true });
  const ledger = EvidenceLedgerSchema.parse({
    brand_id: brand,
    generated_at: new Date().toISOString(),
    pipeline: "PHASE_2B",
    candidates,
  });
  writeFileSync(join(dir, "EVIDENCE_LEDGER.json"), JSON.stringify(ledger, null, 2) + "\n");
}

function pf(
  value: unknown,
  opts: {
    notes: string;
    source_type: SourceType;
    source_reference: string;
    confidence?: "LOW" | "MEDIUM" | "HIGH";
  },
) {
  return {
    status: "UNVERIFIED" as const,
    value,
    notes: opts.notes,
    source_type: opts.source_type,
    source_reference: opts.source_reference,
    observed_at: OBS,
    confidence: opts.confidence ?? "MEDIUM",
    time_sensitive: false,
  };
}

function patchModule(slug: string, file: string, mutate: (j: Record<string, unknown>) => void): void {
  const p = join(ROOT, "brands", slug, file);
  const j = JSON.parse(readFileSync(p, "utf8")) as Record<string, unknown>;
  mutate(j);
  j.updated_at = new Date().toISOString();
  writeFileSync(p, JSON.stringify(j, null, 2) + "\n");
}

function missing(): { status: "MISSING" } {
  return { status: "MISSING" };
}

async function main(): Promise<void> {
  const lotinPath = "/Users/aismacstudio/Development/Lotin";
  const lotinIsEmpty = lotinEmpty(lotinPath);
  console.log("LOTIN folder empty?", lotinIsEmpty);

  // ─── Villa Glory ledger ───────────────────────────────────────────────
  const vgAbout =
    "Villa-Glory-Commerce-Ops/imports/pages-content/about.html";
  const vgCollections =
    "Villa-Glory-Commerce-Ops/docs/COLLECTION_STRUCTURE.md";
  const vgProductModel =
    "Villa-Glory-Commerce-Ops/docs/PRODUCT_CONTENT_MODEL.md";

  const vg: EvidenceCandidate[] = [
    cand({
      candidate_id: "vg-1",
      brand_id: "VILLA_GLORY",
      field_path: "identity.official_name",
      candidate_value: "Villa Glory",
      source_repository: "Villa-Glory",
      relative_source_path: vgAbout,
      source_type: "OFFICIAL_WEBSITE",
      evidence_summary: "About page brand name Villa Glory.",
      verification_status: "UNVERIFIED",
      confidence: "MEDIUM",
      status_reason: "Public storefront About copy; legal entity still unknown.",
    }),
    cand({
      candidate_id: "vg-2",
      brand_id: "VILLA_GLORY",
      field_path: "identity.description",
      candidate_value:
        "Villa Glory is a UAE luxury furniture and interiors destination offering curated collections, bespoke furniture, showroom consultation, and project support.",
      source_repository: "Villa-Glory",
      relative_source_path: vgAbout,
      source_type: "OFFICIAL_WEBSITE",
      evidence_summary: "Lead paragraph on About page.",
      verification_status: "UNVERIFIED",
      confidence: "MEDIUM",
      status_reason: "Website description pending operator VERIFY.",
    }),
    cand({
      candidate_id: "vg-3",
      brand_id: "VILLA_GLORY",
      field_path: "identity.location_markets",
      candidate_value: ["UAE", "Dubai", "Sharjah"],
      source_repository: "Villa-Glory",
      relative_source_path: vgAbout,
      source_type: "OFFICIAL_WEBSITE",
      evidence_summary: "UAE destination; Dubai & Sharjah showrooms stated.",
      verification_status: "UNVERIFIED",
      confidence: "MEDIUM",
      status_reason: "Geographic claims from About.",
    }),
    cand({
      candidate_id: "vg-4",
      brand_id: "VILLA_GLORY",
      field_path: "positioning.category",
      candidate_value: "luxury_furniture_and_interiors",
      source_repository: "Villa-Glory",
      relative_source_path: vgAbout,
      source_type: "OFFICIAL_WEBSITE",
      evidence_summary: "Luxury furniture and interiors destination wording.",
      verification_status: "UNVERIFIED",
      confidence: "MEDIUM",
      status_reason: "Category from public About.",
    }),
    cand({
      candidate_id: "vg-5",
      brand_id: "VILLA_GLORY",
      field_path: "positioning.positioning_statement",
      candidate_value:
        "UAE luxury furniture and interiors destination with curated collections, bespoke furniture, showroom consultation, and project support for private clients, developers, and design professionals.",
      source_repository: "Villa-Glory",
      relative_source_path: vgAbout,
      source_type: "OFFICIAL_WEBSITE",
      evidence_summary: "Normalized from About lead + audience sentence.",
      verification_status: "UNVERIFIED",
      confidence: "MEDIUM",
      status_reason: "Marketing positioning from website — not operator-verified.",
    }),
    cand({
      candidate_id: "vg-6",
      brand_id: "VILLA_GLORY",
      field_path: "positioning.differentiation",
      candidate_value: [
        "Dubai and Sharjah showrooms",
        "Curated + bespoke furniture",
        "Private Concierge / professional project support",
        "Quote-first commerce (no standard online checkout)",
      ],
      source_repository: "Villa-Glory",
      relative_source_path: vgAbout,
      source_type: "OFFICIAL_WEBSITE",
      evidence_summary: "Showrooms, concierge, collections; quote-first from product model docs.",
      verification_status: "UNVERIFIED",
      confidence: "MEDIUM",
      status_reason: "Website + commerce docs.",
    }),
    cand({
      candidate_id: "vg-7",
      brand_id: "VILLA_GLORY",
      field_path: "positioning.geographic_positioning",
      candidate_value: "Dubai and Sharjah showrooms; UAE-focused destination",
      source_repository: "Villa-Glory",
      relative_source_path: vgAbout,
      source_type: "OFFICIAL_WEBSITE",
      evidence_summary: "Showroom geography on About.",
      verification_status: "UNVERIFIED",
      confidence: "MEDIUM",
      status_reason: "Website geography.",
    }),
    cand({
      candidate_id: "vg-rej-1",
      brand_id: "VILLA_GLORY",
      field_path: "offerings.items",
      candidate_value: "Villa Glory CRM Test Product",
      source_repository: "Villa-Glory",
      relative_source_path:
        "Villa-Glory-Commerce-Ops/docs/PRODUCT_CONTENT_MODEL.md",
      source_type: "INTERNAL_DOCUMENT",
      evidence_summary: "CRM-test QA product retained unpublished.",
      verification_status: "UNVERIFIED",
      confidence: "LOW",
      status_reason: "Filtered: test/QA fixture — not a marketing product.",
      rejected: true,
      placeholder_filtered: true,
    }),
  ];
  writeLedger("VILLA_GLORY", "villa-glory", vg);

  // Structured VG enrichment (schema-shaped)
  patchModule("villa-glory", "AUDIENCES.json", (j) => {
    j.segments = [
      {
        id: "private-clients",
        role: "PRIMARY",
        label: pf("Private clients", {
          notes: "From About audience sentence.",
          source_type: "OFFICIAL_WEBSITE",
          source_reference: `Villa-Glory:${vgAbout}`,
        }),
        geography: pf(["UAE", "Dubai", "Sharjah"], {
          notes: "Showroom geography; not exclusive market proof.",
          source_type: "OFFICIAL_WEBSITE",
          source_reference: `Villa-Glory:${vgAbout}`,
        }),
        needs: missing(),
        pain_points: missing(),
        motivations: missing(),
        objections: missing(),
        buying_triggers: missing(),
        preferred_channels: pf(["showroom", "Private Concierge", "contact"], {
          notes: "Channels mentioned on About / privacy policy.",
          source_type: "OFFICIAL_WEBSITE",
          source_reference: `Villa-Glory:${vgAbout}`,
          confidence: "LOW",
        }),
      },
      {
        id: "developers",
        role: "SECONDARY",
        label: pf("Developers", {
          notes: "Named audience on About.",
          source_type: "OFFICIAL_WEBSITE",
          source_reference: `Villa-Glory:${vgAbout}`,
        }),
        geography: missing(),
        needs: missing(),
        pain_points: missing(),
        motivations: missing(),
        objections: missing(),
        buying_triggers: missing(),
        preferred_channels: missing(),
      },
      {
        id: "design-professionals",
        role: "SECONDARY",
        label: pf("Design professionals", {
          notes: "Named audience on About; Professional Tools referenced in privacy copy.",
          source_type: "OFFICIAL_WEBSITE",
          source_reference: `Villa-Glory:${vgAbout}`,
        }),
        geography: missing(),
        needs: missing(),
        pain_points: missing(),
        motivations: missing(),
        objections: missing(),
        buying_triggers: missing(),
        preferred_channels: missing(),
      },
    ];
  });

  patchModule("villa-glory", "OFFERINGS.json", (j) => {
    // already written; no-op if file ok — rewrite cleanly without unused var
    const cats = [
      "Living",
      "Dining",
      "Bedroom",
      "Lighting",
      "Decor",
      "Outdoor",
      "Office",
      "Custom Made",
    ];
    j.items = cats.map((name) => ({
      id: `room-${name.toLowerCase().replace(/\s+/g, "-")}`,
      name: pf(name, {
        notes: "Room collection title from COLLECTION_STRUCTURE.md.",
        source_type: "INTERNAL_DOCUMENT",
        source_reference: `Villa-Glory:${vgCollections}`,
      }),
      category: pf("room_collection", {
        notes: "Collection architecture doc.",
        source_type: "INTERNAL_DOCUMENT",
        source_reference: `Villa-Glory:${vgCollections}`,
      }),
      description: pf(`${name} room collection (catalog structure)`, {
        notes: "Category-level only; SKUs not verified. CRM-test excluded.",
        source_type: "INTERNAL_DOCUMENT",
        source_reference: `Villa-Glory:${vgCollections}`,
        confidence: "LOW",
      }),
      audience: missing(),
      geography: pf(["UAE"], {
        notes: "Implied by storefront markets.",
        source_type: "OFFICIAL_WEBSITE",
        source_reference: `Villa-Glory:${vgAbout}`,
        confidence: "LOW",
      }),
      pricing: {
        status: "UNVERIFIED",
        value: "Price on request / quote-first",
        notes: "PRODUCT_CONTENT_MODEL: quote-first luxury.",
        source_type: "INTERNAL_DOCUMENT",
        source_reference: `Villa-Glory:${vgProductModel}`,
        observed_at: OBS,
        confidence: "MEDIUM",
        time_sensitive: true,
        review_after_days: 90,
      },
      cta: pf("Request Private Quote", {
        notes: "Quote-first CTA from product content model.",
        source_type: "INTERNAL_DOCUMENT",
        source_reference: `Villa-Glory:${vgProductModel}`,
      }),
    }));
  });

  patchModule("villa-glory", "CTA.json", (j) => {
    j.items = [
      {
        id: "request-private-quote",
        label: pf("Request Private Quote", {
          notes: "Primary quote-first CTA.",
          source_type: "INTERNAL_DOCUMENT",
          source_reference: `Villa-Glory:${vgProductModel}`,
        }),
        intent: pf("quotation", {
          notes: "Quote-first commerce model.",
          source_type: "INTERNAL_DOCUMENT",
          source_reference: `Villa-Glory:${vgProductModel}`,
        }),
        brand_appropriate: true,
      },
      {
        id: "private-concierge",
        label: pf("Private Concierge", {
          notes: "Mentioned on About and privacy policy.",
          source_type: "OFFICIAL_WEBSITE",
          source_reference: `Villa-Glory:${vgAbout}`,
        }),
        intent: pf("concierge_enquiry", {
          notes: "Assistance / quotation path.",
          source_type: "OFFICIAL_WEBSITE",
          source_reference: `Villa-Glory:${vgAbout}`,
        }),
        brand_appropriate: true,
      },
      {
        id: "contact",
        label: pf("Contact", {
          notes: "Contact path referenced in catalogue/about ecosystem.",
          source_type: "OFFICIAL_WEBSITE",
          source_reference: `Villa-Glory:${vgAbout}`,
          confidence: "LOW",
        }),
        intent: pf("contact", {
          notes: "General enquiry.",
          source_type: "OFFICIAL_WEBSITE",
          source_reference: `Villa-Glory:${vgAbout}`,
          confidence: "LOW",
        }),
        brand_appropriate: true,
      },
    ];
  });

  // ─── NOX FORM ─────────────────────────────────────────────────────────
  const nfContent = "src/lib/content.ts";
  const nfBrandKit = "src/lib/branding/brand-kit.ts";
  const nfServices = [
    "Interior Architecture",
    "Turnkey Fit-Out",
    "Luxury Furnishing",
    "Bespoke Joinery",
    "Material Curation",
    "Visualization & CGI",
    "Lighting Design",
    "Project Management",
  ];

  const nf: EvidenceCandidate[] = [
    cand({
      candidate_id: "nf-1",
      brand_id: "NOX_FORM",
      field_path: "identity.official_name",
      candidate_value: "NOX FORM",
      source_repository: "NOXFORM",
      relative_source_path: nfContent,
      source_type: "OFFICIAL_WEBSITE",
      evidence_summary: "siteConfig.name",
      verification_status: "UNVERIFIED",
      confidence: "MEDIUM",
      status_reason: "Customer-facing site config.",
    }),
    cand({
      candidate_id: "nf-2",
      brand_id: "NOX_FORM",
      field_path: "identity.legal_operating_relationship",
      candidate_value: "A Division of Woodex Global LLC",
      source_repository: "NOXFORM",
      relative_source_path: nfContent,
      source_type: "OFFICIAL_WEBSITE",
      evidence_summary: "siteConfig.legalName + divisionNote.",
      verification_status: "UNVERIFIED",
      confidence: "MEDIUM",
      status_reason: "Stated in site config; operator should confirm legal.",
    }),
    cand({
      candidate_id: "nf-3",
      brand_id: "NOX_FORM",
      field_path: "identity.description",
      candidate_value:
        "NOX FORM is a Dubai-based architecture, interior design, and turnkey delivery studio for private villas, residences, and hospitality spaces.",
      source_repository: "NOXFORM",
      relative_source_path: nfContent,
      source_type: "OFFICIAL_WEBSITE",
      evidence_summary: "siteConfig.description",
      verification_status: "UNVERIFIED",
      confidence: "MEDIUM",
      status_reason: "Public site description.",
    }),
    cand({
      candidate_id: "nf-4",
      brand_id: "NOX_FORM",
      field_path: "identity.location_markets",
      candidate_value: ["Dubai", "UAE"],
      source_repository: "NOXFORM",
      relative_source_path: nfContent,
      source_type: "OFFICIAL_WEBSITE",
      evidence_summary: "studioDescriptor + address in Dubai Investment Park 2.",
      verification_status: "UNVERIFIED",
      confidence: "MEDIUM",
      status_reason: "Address/markets from siteConfig.",
    }),
    cand({
      candidate_id: "nf-5",
      brand_id: "NOX_FORM",
      field_path: "identity.website",
      candidate_value: "https://www.noxform.design",
      source_repository: "NOXFORM",
      relative_source_path: nfContent,
      source_type: "OFFICIAL_WEBSITE",
      evidence_summary: "siteConfig.website www.noxform.design",
      verification_status: "UNVERIFIED",
      confidence: "MEDIUM",
      status_reason: "Listed public domain.",
    }),
    cand({
      candidate_id: "nf-6",
      brand_id: "NOX_FORM",
      field_path: "identity.contact_channels",
      candidate_value: {
        email: "studio@noxform.design",
        phone: "+971 50 834 4351",
        whatsapp: "+971 50 834 4351",
      },
      source_repository: "NOXFORM",
      relative_source_path: nfContent,
      source_type: "OFFICIAL_WEBSITE",
      evidence_summary: "siteConfig contact fields.",
      verification_status: "UNVERIFIED",
      confidence: "MEDIUM",
      status_reason: "Public contact channels in siteConfig.",
    }),
    cand({
      candidate_id: "nf-7",
      brand_id: "NOX_FORM",
      field_path: "positioning.positioning_statement",
      candidate_value:
        "Dubai-based architecture, interior design, and turnkey delivery studio for private villas, residences, and hospitality — designing the next era of spatial living.",
      source_repository: "NOXFORM",
      relative_source_path: nfContent,
      source_type: "OFFICIAL_WEBSITE",
      evidence_summary: "description + tagline combined.",
      verification_status: "UNVERIFIED",
      confidence: "MEDIUM",
      status_reason: "Website positioning; keep distinct from Villa Glory retail.",
    }),
    cand({
      candidate_id: "nf-8",
      brand_id: "NOX_FORM",
      field_path: "positioning.geographic_positioning",
      candidate_value: "Spatial Design Studio · Dubai, United Arab Emirates",
      source_repository: "NOXFORM",
      relative_source_path: nfContent,
      source_type: "OFFICIAL_WEBSITE",
      evidence_summary: "siteConfig.studioDescriptor",
      verification_status: "UNVERIFIED",
      confidence: "MEDIUM",
      status_reason: "Public studio descriptor.",
    }),
  ];
  writeLedger("NOX_FORM", "nox-form", nf);

  patchModule("nox-form", "OFFERINGS.json", (j) => {
    j.items = nfServices.map((name) => ({
      id: `svc-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      name: pf(name, {
        notes:
          name === "Luxury Furnishing"
            ? "Studio FF&E service (siteConfig.services) — NOT Villa Glory retail catalog. Isolation mandatory."
            : "From siteConfig.services / serviceCategories.",
        source_type: "OFFICIAL_WEBSITE",
        source_reference: `NOXFORM:${nfContent}`,
      }),
      category: pf("design_studio_service", {
        notes: "Professional design services — distinct from furniture retail.",
        source_type: "OFFICIAL_WEBSITE",
        source_reference: `NOXFORM:${nfContent}`,
      }),
      description: missing(),
      audience: pf(["residential", "hospitality", "private villas"], {
        notes: "Derived from siteConfig.description audiences.",
        source_type: "OFFICIAL_WEBSITE",
        source_reference: `NOXFORM:${nfContent}`,
        confidence: "LOW",
      }),
      geography: pf(["Dubai", "UAE"], {
        notes: "Studio location.",
        source_type: "OFFICIAL_WEBSITE",
        source_reference: `NOXFORM:${nfContent}`,
      }),
      pricing: missing(),
      cta: pf("Start a Project", {
        notes: "primaryCta.label in content.ts",
        source_type: "OFFICIAL_WEBSITE",
        source_reference: `NOXFORM:${nfContent}`,
      }),
    }));
  });

  patchModule("nox-form", "AUDIENCES.json", (j) => {
    j.segments = [
      {
        id: "private-villas-residences",
        role: "PRIMARY",
        label: pf("Private villa / residence clients", {
          notes: "From siteConfig.description.",
          source_type: "OFFICIAL_WEBSITE",
          source_reference: `NOXFORM:${nfContent}`,
        }),
        geography: pf(["Dubai", "UAE"], {
          notes: "Studio markets.",
          source_type: "OFFICIAL_WEBSITE",
          source_reference: `NOXFORM:${nfContent}`,
        }),
        needs: missing(),
        pain_points: missing(),
        motivations: missing(),
        objections: missing(),
        buying_triggers: missing(),
        preferred_channels: pf(["contact", "WhatsApp", "email"], {
          notes: "Public CTAs/channels.",
          source_type: "OFFICIAL_WEBSITE",
          source_reference: `NOXFORM:${nfContent}`,
          confidence: "LOW",
        }),
      },
      {
        id: "hospitality",
        role: "SECONDARY",
        label: pf("Hospitality space clients", {
          notes: "Named in siteConfig.description.",
          source_type: "OFFICIAL_WEBSITE",
          source_reference: `NOXFORM:${nfContent}`,
        }),
        geography: missing(),
        needs: missing(),
        pain_points: missing(),
        motivations: missing(),
        objections: missing(),
        buying_triggers: missing(),
        preferred_channels: missing(),
      },
    ];
  });

  patchModule("nox-form", "VOICE.json", (j) => {
    j.tone = pf(
      ["Refined", "Atmospheric", "Material-honest", "Professional studio"],
      {
        notes:
          "Tone inferred from public description language — distinct from Villa Glory retail tone. Do not merge.",
        source_type: "OFFICIAL_WEBSITE",
        source_reference: `NOXFORM:${nfContent}`,
        confidence: "LOW",
      },
    );
  });

  patchModule("nox-form", "VISUAL.json", (j) => {
    j.colors = pf(
      {
        noir: "#15110f",
        bronze: "#9a7b4f",
        note: "Default --brand-* tokens from brand-kit / globals.css",
      },
      {
        notes: "NOX FORM default brand palette tokens.",
        source_type: "INTERNAL_DOCUMENT",
        source_reference: `NOXFORM:${nfBrandKit}`,
      },
    );
    j.typography = pf(
      { primary: "Archivo", editorial: "Fraunces" },
      {
        notes: "Brand typography defaults in brand-kit.ts / layout fonts.",
        source_type: "INTERNAL_DOCUMENT",
        source_reference: `NOXFORM:${nfBrandKit}`,
      },
    );
  });

  patchModule("nox-form", "CTA.json", (j) => {
    j.items = [
      {
        id: "start-a-project",
        label: pf("Start a Project", {
          notes: "primaryCta.label",
          source_type: "OFFICIAL_WEBSITE",
          source_reference: `NOXFORM:${nfContent}`,
        }),
        intent: pf("project_enquiry", {
          notes: "Project acquisition CTA.",
          source_type: "OFFICIAL_WEBSITE",
          source_reference: `NOXFORM:${nfContent}`,
        }),
        brand_appropriate: true,
      },
      {
        id: "whatsapp",
        label: pf("WhatsApp", {
          notes: "siteConfig.whatsapp + prefill.",
          source_type: "OFFICIAL_WEBSITE",
          source_reference: `NOXFORM:${nfContent}`,
        }),
        intent: pf("conversation", {
          notes: "WhatsApp project discussion.",
          source_type: "OFFICIAL_WEBSITE",
          source_reference: `NOXFORM:${nfContent}`,
        }),
        brand_appropriate: true,
      },
    ];
  });

  patchModule("nox-form", "POSITIONING.json", (j) => {
    j.category = pf("architecture_interior_design_turnkey", {
      notes: "From siteConfig.description — studio services, not furniture retail.",
      source_type: "OFFICIAL_WEBSITE",
      source_reference: `NOXFORM:${nfContent}`,
    });
    j.marketing_direction_note =
      "Professional design studio (architecture / interiors / turnkey). Distinct from Villa Glory furniture retail — must not merge tone, audiences, products, CTAs, or pillars. 'Luxury Furnishing' here is studio FF&E, not VG catalog.";
  });

  // ─── NOX TECH ─────────────────────────────────────────────────────────
  const ntReadme = "README.md";
  const ntMarketing = "src/lib/marketing-data.ts";
  const ntSeeds = "supabase/seeds/batches/all-modules.json";
  const sampleModules = [
    "CRM Core",
    "Sales Pipeline",
    "Lead Management",
    "Solution Builder",
    "Proposal Generator",
  ];

  const nt: EvidenceCandidate[] = [
    cand({
      candidate_id: "nt-1",
      brand_id: "NOX_TECH",
      field_path: "identity.official_name",
      candidate_value: "NOX TECH",
      source_repository: "Nox-tech-ai",
      relative_source_path: ntReadme,
      source_type: "INTERNAL_DOCUMENT",
      evidence_summary: "README title NOX TECH AI.",
      verification_status: "UNVERIFIED",
      confidence: "MEDIUM",
      status_reason: "Internal product identity.",
    }),
    cand({
      candidate_id: "nt-2",
      brand_id: "NOX_TECH",
      field_path: "identity.description",
      candidate_value:
        "Internal software sales and implementation platform to manage the client lifecycle from discovery through proposal to implementation.",
      source_repository: "Nox-tech-ai",
      relative_source_path: ntReadme,
      source_type: "INTERNAL_DOCUMENT",
      evidence_summary: "README product one-liner.",
      verification_status: "UNVERIFIED",
      confidence: "MEDIUM",
      status_reason: "Documented product story — not yet marketing-approved.",
    }),
    cand({
      candidate_id: "nt-3",
      brand_id: "NOX_TECH",
      field_path: "positioning.positioning_statement",
      candidate_value:
        "AI-assisted sales and implementation platform spanning discovery, module marketplace, proposals, and delivery tracking (per README).",
      source_repository: "Nox-tech-ai",
      relative_source_path: ntReadme,
      source_type: "INTERNAL_DOCUMENT",
      evidence_summary: "README features framing.",
      verification_status: "UNVERIFIED",
      confidence: "LOW",
      status_reason: "DOCUMENTED internally; MARKETING_APPROVED still required for external claims.",
    }),
    cand({
      candidate_id: "nt-4",
      brand_id: "NOX_TECH",
      field_path: "claims.prohibited_claims",
      candidate_value: [
        "Do not claim guaranteed ROI percentages without MARKETING_APPROVED evidence",
        "Do not claim every seeded module is a commercially offered product",
        "OBSERVED_IN_CODE ≠ MARKETING_APPROVED",
      ],
      source_repository: "MarketingOS",
      relative_source_path: "docs/phase-0/CRITICAL_REVIEW.md",
      source_type: "INTERNAL_DOCUMENT",
      evidence_summary: "Capability vs claim policy.",
      verification_status: "UNVERIFIED",
      confidence: "MEDIUM",
      status_reason: "Policy guardrails for NOX TECH claims.",
    }),
    ...sampleModules.map((m, i) =>
      cand({
        candidate_id: `nt-mod-${i}`,
        brand_id: "NOX_TECH",
        field_path: "offerings.items",
        candidate_value: m,
        source_repository: "Nox-tech-ai",
        relative_source_path: ntSeeds,
        source_type: "INTERNAL_DOCUMENT",
        evidence_summary: `Seeded module name "${m}" in all-modules.json.`,
        verification_status: "UNVERIFIED",
        confidence: "LOW",
        status_reason:
          "OBSERVED_IN_CODE / seed data — not a marketing-approved commercial offer.",
        capability_claim_state: "OBSERVED_IN_CODE",
      }),
    ),
    cand({
      candidate_id: "nt-roi",
      brand_id: "NOX_TECH",
      field_path: "claims.claims_requiring_evidence",
      candidate_value:
        "marketing-data.ts contains quantified ROI estimate strings (e.g. 180–240% ROI)",
      source_repository: "Nox-tech-ai",
      relative_source_path: ntMarketing,
      source_type: "OFFICIAL_WEBSITE",
      evidence_summary: "Static ROI estimate copy in marketing-data.ts.",
      verification_status: "UNVERIFIED",
      confidence: "LOW",
      status_reason:
        "PUBLICLY_CLAIMED in code assets — requires APPROVE_MARKETING_CLAIM before approved use.",
      capability_claim_state: "PUBLICLY_CLAIMED",
    }),
  ];
  writeLedger("NOX_TECH", "nox-tech", nt);

  writeFileSync(
    join(ROOT, "brands/nox-tech/CAPABILITIES.json"),
    JSON.stringify(
      {
        brand_id: "NOX_TECH",
        generated_at: new Date().toISOString(),
        rule: "TECHNICALLY_PRESENT / OBSERVED_IN_CODE does not equal MARKETING_APPROVED.",
        documented_product_story: {
          source: `Nox-tech-ai:${ntReadme}`,
          summary:
            "Internal software sales and implementation platform (discovery → proposal → implementation).",
          state: "DOCUMENTED",
          marketing_approved: false,
        },
        items: [
          {
            name: "Module marketplace seed catalog",
            states: ["OBSERVED_IN_CODE"],
            marketing_approved: false,
            source: `Nox-tech-ai:${ntSeeds}`,
            note: "Large seed catalog present; sample names recorded — not a commercial SKU list.",
            sample_names: sampleModules,
          },
          {
            name: "Quantified ROI benefit copy in marketing-data.ts",
            states: ["PUBLICLY_CLAIMED"],
            marketing_approved: false,
            source: `Nox-tech-ai:${ntMarketing}`,
            note: "Requires human APPROVE_MARKETING_CLAIM",
          },
        ],
      },
      null,
      2,
    ) + "\n",
  );

  patchModule("nox-tech", "OFFERINGS.json", (j) => {
    j.items = sampleModules.map((name) => ({
      id: `obs-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      name: pf(`${name} (OBSERVED_IN_CODE — not MARKETING_APPROVED)`, {
        notes: "Seed/module catalog presence only.",
        source_type: "INTERNAL_DOCUMENT",
        source_reference: `Nox-tech-ai:${ntSeeds}`,
        confidence: "LOW",
      }),
      category: pf("observed_seed_module", {
        notes: "Not a marketing-approved product line.",
        source_type: "INTERNAL_DOCUMENT",
        source_reference: `Nox-tech-ai:${ntSeeds}`,
        confidence: "LOW",
      }),
      description: pf("Technically present in seed data; commercial offer unapproved.", {
        notes: "Capability ≠ claim.",
        source_type: "INTERNAL_DOCUMENT",
        source_reference: `Nox-tech-ai:${ntSeeds}`,
        confidence: "LOW",
      }),
      audience: missing(),
      geography: missing(),
      pricing: missing(),
      cta: missing(),
    }));
  });

  patchModule("nox-tech", "AUDIENCES.json", (j) => {
    j.segments = [
      {
        id: "businesses-sales-implementation",
        role: "PRIMARY",
        label: pf("Businesses needing sales/implementation tooling", {
          notes: "Weak ICP hint from README — operator must refine.",
          source_type: "INTERNAL_DOCUMENT",
          source_reference: `Nox-tech-ai:${ntReadme}`,
          confidence: "LOW",
        }),
        geography: missing(),
        needs: missing(),
        pain_points: missing(),
        motivations: missing(),
        objections: missing(),
        buying_triggers: missing(),
        preferred_channels: missing(),
      },
    ];
  });

  // ─── LOTIN ────────────────────────────────────────────────────────────
  writeLedger("LOTIN", "lotin", []);
  writeFileSync(
    join(ROOT, "brands/lotin/OPERATOR_QUESTIONNAIRE.md"),
    `# LOTIN — Operator Onboarding Questionnaire (Phase 2B)

Authoritative local source \`/Users/aismacstudio/Development/Lotin\` remains **empty**.
Do **not** invent answers. Prefer answers that unlock multiple Brand Brain fields.

## Critical — required before marketing

### Identity
1. What is the official brand name for marketing (and any legal entity name if different)?
2. One-sentence description of what LOTIN does (no investment promises).
3. Tagline or short phrase you approve for public use (or confirm none yet).

### Services
4. What services does LOTIN actually sell today (list only live offerings)?
5. Which activities are **out of scope** for marketing (e.g. brokerage, fund management)?

### Markets & audience
6. Primary geographic markets (cities/countries) you are authorized to market in?
7. Who is the primary buyer (persona) and who is explicitly **not** a target?

### Contact / CTA
8. What is the only approved primary CTA (e.g. book consultation, WhatsApp, form)?
9. Which contact channels are approved for public use?

### Compliance / investment-claim policy
10. Confirm: no guaranteed returns / performance promises in marketing — any additional hard bans?
11. Any regulator, licensing, or disclosure text that must appear on materials?

## Important
12. Positioning: how should LOTIN be described vs a generic “real-estate advisory”?
13. Any developer brands or projects you are allowed to reference by name?
14. Language priorities (EN / AR / TR) and tone (formal, discreet, etc.)?
15. Lead qualification: what makes a lead “qualified” vs reject?
16. Channel strategy near-term: which 1–2 channels matter first?

## Enhancement
17. Founder voice: any phrases or stories that are approved to use?
18. Content preferences: formats you want / formats to avoid?
19. Competitor set (names ok for internal strategy only)?
20. Visual preferences or brand kit location?
21. Historical learnings: what marketing has worked or failed before?

---
After answers: operator VERIFY → promote fields; re-run readiness.
`,
  );

  // Apply leaf provenance fields from ledgers
  for (const [id, slug] of [
    ["VILLA_GLORY", "villa-glory"],
    ["NOX_FORM", "nox-form"],
    ["NOX_TECH", "nox-tech"],
  ] as const) {
    const ledger = EvidenceLedgerSchema.parse(
      JSON.parse(readFileSync(join(ROOT, "brands", slug, "EVIDENCE_LEDGER.json"), "utf8")),
    );
    const r = applyEvidenceLedger(id, ledger, {
      brandsRoot: join(ROOT, "brands"),
      write: true,
    });
    console.log(id, "apply", r);
  }

  const ledgers = (["villa-glory", "nox-form", "nox-tech", "lotin"] as const).map((slug) =>
    EvidenceLedgerSchema.parse(
      JSON.parse(readFileSync(join(ROOT, "brands", slug, "EVIDENCE_LEDGER.json"), "utf8")),
    ),
  );
  const queue = buildHumanReviewQueue(ledgers);
  writeReviewArtifacts(queue, join(ROOT, "reports/onboarding"));

  const queuePath = join(ROOT, "reports/onboarding/HUMAN_REVIEW_QUEUE.json");
  const q = JSON.parse(readFileSync(queuePath, "utf8")) as {
    items: Array<Record<string, unknown>>;
    generated_at: string;
  };
  q.items.push({
    review_id: `rev-${q.items.length + 1}`,
    brand_id: "VILLA_GLORY",
    action: "APPROVE_CROSS_BRAND_RELATIONSHIP",
    priority: "IMPORTANT",
    field_path: "relationships",
    candidate_value: "RELATED_COMPANY ↔ NOX_FORM (no memory merge)",
    question:
      "Confirm Villa Glory ↔ NOX FORM related-company relationship and isolation rules (no merge of tone/audiences/products/CTAs).",
    source_context:
      "brands/_shared/RELATIONSHIPS.json — memory merge forbidden; usage_permission=false",
    evidence_candidate_ids: [],
  });
  writeFileSync(queuePath, JSON.stringify(q, null, 2) + "\n");

  // Strengthen relationship description without fabricating verification
  const relPath = join(ROOT, "brands/_shared/RELATIONSHIPS.json");
  const rel = JSON.parse(readFileSync(relPath, "utf8")) as {
    updated_at: string;
    relationships: Array<Record<string, unknown>>;
  };
  rel.updated_at = new Date().toISOString();
  if (rel.relationships[0]) {
    rel.relationships[0].description =
      "Villa Glory (furniture / product / quote-first retail) is related in group context to NOX FORM (architecture / interior design / turnkey studio). Knowledge, tone, audiences, services, products, CTAs, and pillars must not merge. Asset reuse requires SHARED_ASSET_WITH_PERMISSION and usage_permission=true. Pending APPROVE_CROSS_BRAND_RELATIONSHIP.";
  }
  writeFileSync(relPath, JSON.stringify(rel, null, 2) + "\n");

  const audit = new InMemoryAuditSink();
  const after: Record<string, unknown> = {};
  const guardian = guardianReviewAllBrands({
    brandsRoot: join(ROOT, "brands"),
    audit,
  });

  for (const id of ["LOTIN", "VILLA_GLORY", "NOX_FORM", "NOX_TECH"] as BrandId[]) {
    const pack = loadBrandPack(id, audit, { brandsRoot: join(ROOT, "brands") });
    const onboarding = loadOnboardingRecord(id, { brandsRoot: join(ROOT, "brands") });
    const g = verifyBrandIntelligence(pack, audit);
    after[id] = computeBrandReadiness(id, pack, onboarding.state, g);
  }

  writeFileSync(
    join(ROOT, "reports/onboarding/PHASE_2B_SCORES.json"),
    JSON.stringify({ before: BEFORE, after, guardian, lotin_empty: lotinIsEmpty }, null, 2) +
      "\n",
  );

  const scoreOf = (id: BrandId) => {
    const r = after[id] as {
      overall_score: number;
      readiness_status: string;
      verified: string[];
    };
    return {
      score: r.overall_score,
      status: r.readiness_status,
      verified_count: r.verified?.length ?? 0,
    };
  };

  const report = `# PHASE 2B — Brand Population Report

Generated: ${new Date().toISOString()}

Phase 2 commit: \`17ea6a2\` (\`feat: add Marketing OS brand intelligence foundation\`).
Phase 3 was **not** started.
Sibling repositories were inspected **read-only**. No secrets copied. No production integration.

## LOTIN

### Before
Score **${BEFORE.LOTIN.score}** · ${BEFORE.LOTIN.status} · verified ${BEFORE.LOTIN.verified}

### After
Score **${scoreOf("LOTIN").score}** · ${scoreOf("LOTIN").status} · verified ${scoreOf("LOTIN").verified_count}

### Newly supported facts
None from repositories (Lotin folder empty).

### Remaining missing
Identity, services, markets, CTA, compliance — all critical fields.

### Unverified
N/A (nothing ingested).

### Conflicts
None.

### Human approvals required
Complete \`brands/lotin/OPERATOR_QUESTIONNAIRE.md\` (~21 questions), then VERIFY answers into the Brand Brain.

### Source quality
No authoritative local sources.

---

## Villa Glory

### Before
Score **${BEFORE.VILLA_GLORY.score}** · ${BEFORE.VILLA_GLORY.status} · verified ${BEFORE.VILLA_GLORY.verified}

### After
Score **${scoreOf("VILLA_GLORY").score}** · ${scoreOf("VILLA_GLORY").status} · verified ${scoreOf("VILLA_GLORY").verified_count}

### Newly supported facts
- **Identity:** official name, description, markets (UNVERIFIED from About)
- **Positioning:** luxury furniture & interiors; showrooms; quote-first differentiators
- **Audiences:** private clients, developers, design professionals
- **Offerings:** room collections Living→Custom Made (CRM-test rejected)
- **CTA:** Request Private Quote; Private Concierge; Contact

### Remaining missing
Legal entity, formal website URL field, approved claims, visual kit, personas.

### Unverified
All newly populated fields (pending VERIFY).

### Conflicts
None expected from AI_INFERENCE → website upgrades.

### Human approvals required
VERIFY website-derived identity/positioning; APPROVE_CROSS_BRAND_RELATIONSHIP with NOX FORM.

### Source quality
Strong public About + collection/product commerce docs; QA/CRM-test filtered.

---

## NOX FORM

### Before
Score **${BEFORE.NOX_FORM.score}** · ${BEFORE.NOX_FORM.status} · verified ${BEFORE.NOX_FORM.verified}

### After
Score **${scoreOf("NOX_FORM").score}** · ${scoreOf("NOX_FORM").status} · verified ${scoreOf("NOX_FORM").verified_count}

### Newly supported facts
- **Identity:** NOX FORM; Woodex Global LLC division; Dubai description; website; contacts
- **Services:** eight studio services including Luxury Furnishing (studio FF&E — not VG retail)
- **Visual:** default noir/bronze + Archivo/Fraunces
- **CTA:** Start a Project; WhatsApp
- **Isolation note** retained vs Villa Glory

### Remaining missing
Portfolio confidentiality rules, formal ICP depth, competitor set, approved claims.

### Unverified
All newly populated fields.

### Conflicts
None.

### Human approvals required
VERIFY legal relationship Woodex Global LLC; VERIFY services; confirm isolation from Villa Glory.

### Source quality
High — \`siteConfig\` + brand-kit defaults.

---

## NOX TECH

### Before
Score **${BEFORE.NOX_TECH.score}** · ${BEFORE.NOX_TECH.status} · verified ${BEFORE.NOX_TECH.verified}

### After
Score **${scoreOf("NOX_TECH").score}** · ${scoreOf("NOX_TECH").status} · verified ${scoreOf("NOX_TECH").verified_count}

### Newly supported facts
- Product identity/description from README (DOCUMENTED, not marketing-approved)
- Sample seed modules recorded as **OBSERVED_IN_CODE** in \`CAPABILITIES.json\`
- ROI-style copy flagged **PUBLICLY_CLAIMED** → APPROVE_MARKETING_CLAIM
- Forbidden-claim guardrails populated

### Remaining missing
Marketing-approved product list, ICP, case studies, verified claims.

### Unverified
All commercial capability claims.

### Conflicts
None.

### Human approvals required
APPROVE_MARKETING_CLAIM for any module or ROI statement before campaigns.

### Source quality
Mixed — README useful; seeds = technical presence only; marketing-data claims not auto-approved.

---

## Guardian

\`\`\`json
${JSON.stringify(guardian, null, 2)}
\`\`\`

## Artifacts
- \`brands/*/EVIDENCE_LEDGER.json\`
- \`brands/lotin/OPERATOR_QUESTIONNAIRE.md\`
- \`brands/nox-tech/CAPABILITIES.json\`
- \`reports/onboarding/HUMAN_REVIEW_QUEUE.md\`
- \`reports/onboarding/PHASE_2B_SCORES.json\`

## STOP
Phase 2B population complete pending operator review. Do not start Phase 3. Do not auto-commit unless requested.
`;
  writeFileSync(
    join(ROOT, "reports/onboarding/PHASE_2B_BRAND_POPULATION_REPORT.md"),
    report,
  );
  console.log("\nScores:", JSON.stringify(after, null, 2));
  console.log("Guardian:", JSON.stringify(guardian, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
