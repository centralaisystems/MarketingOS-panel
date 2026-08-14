/**
 * One-shot generator for Phase 2 brand pack scaffolds.
 * Only UNVERIFIED orientation from the Marketing OS brief + MISSING elsewhere.
 * Run: pnpm exec tsx scripts/generate-brand-packs.ts
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const NOW = "2026-08-14T08:00:00.000Z";

function M(notes?: string) {
  return notes ? { status: "MISSING", notes } : { status: "MISSING" };
}

function U(
  value: unknown,
  notes: string,
  extra?: Record<string, unknown>,
) {
  return {
    status: "UNVERIFIED",
    value,
    notes,
    source_type: "AI_INFERENCE",
    source_reference: "marketing_os_master_brief_orientation",
    confidence: "LOW",
    observed_at: NOW,
    time_sensitive: false,
    ...extra,
  };
}

type BrandSpec = {
  id: "LOTIN" | "VILLA_GLORY" | "NOX_FORM" | "NOX_TECH";
  slug: string;
  display: string;
  category: string;
  direction: string;
  audiences: string[];
  markets?: string[];
  offerings: string[];
  locales: string[];
  claims: string[];
  ctaHints: { id: string; label: string; intent: string }[];
  separationNote?: string;
};

const BRANDS: BrandSpec[] = [
  {
    id: "LOTIN",
    slug: "lotin",
    display: "LOTIN",
    category: "real_estate",
    direction:
      "Real estate, investment opportunities, buyers/investors, sellers, developers, market intelligence and qualified lead generation. Orientation only — not verified.",
    audiences: ["property investors", "buyers", "sellers", "developers"],
    markets: ["Dubai", "UAE"],
    offerings: [
      "property investment opportunities",
      "buyer/seller support",
      "developer-related offerings",
      "market intelligence",
    ],
    locales: ["en", "ar"],
    claims: [
      "Do not invent ROI or guaranteed returns",
      "Do not fabricate inventory, pricing, or developer partnerships",
      "Time-sensitive property facts require fresh evidence",
      "Avoid unlicensed financial/regulatory claims",
    ],
    ctaHints: [
      { id: "enquiry", label: "Enquire", intent: "general enquiry" },
      { id: "whatsapp", label: "WhatsApp", intent: "conversation" },
      { id: "investor_report", label: "Request investor report", intent: "lead magnet" },
      { id: "viewing", label: "Property viewing", intent: "appointment" },
    ],
  },
  {
    id: "VILLA_GLORY",
    slug: "villa-glory",
    display: "Villa Glory",
    category: "furniture_interiors_lifestyle",
    direction:
      "Furniture, interiors, collections/products, craftsmanship, lifestyle inspiration and enquiries/sales. Product/furniture/lifestyle-led. Keep separate from NOX FORM (design/project studio).",
    audiences: ["customers", "enquiries", "sales prospects"],
    offerings: ["furniture", "interiors", "lifestyle products", "collections"],
    locales: ["en", "ar"],
    claims: [
      "Do not invent product specs, prices, or stock",
      "Do not claim materials/certifications without verification",
    ],
    ctaHints: [
      { id: "product_enquiry", label: "Product enquiry", intent: "sales" },
      { id: "whatsapp", label: "WhatsApp", intent: "conversation" },
      { id: "consultation", label: "Consultation", intent: "appointment" },
    ],
    separationNote:
      "Keep separate from NOX FORM. Villa Glory is product/furniture/lifestyle-led; NOX FORM is design/project/expertise-led.",
  },
  {
    id: "NOX_FORM",
    slug: "nox-form",
    display: "NOX FORM",
    category: "architecture_interior_design",
    direction:
      "Premium interior design, architecture/design services, residential/commercial/hospitality projects, design expertise and project acquisition. Professional design studio rather than a furniture retailer. Distinct from Villa Glory.",
    audiences: ["project clients", "residential prospects", "commercial prospects"],
    offerings: [
      "architecture",
      "interior design",
      "project acquisition",
      "design expertise",
    ],
    locales: ["en", "ar"],
    claims: [
      "Do not invent completed projects, awards, or client names",
      "Do not fabricate timelines or budgets",
    ],
    ctaHints: [
      { id: "project_brief", label: "Submit project brief", intent: "lead" },
      { id: "consultation", label: "Design consultation", intent: "appointment" },
      { id: "discovery_call", label: "Discovery call", intent: "qualification" },
    ],
    separationNote:
      "Position as a professional design studio rather than a furniture retailer. Distinct from Villa Glory — must not merge knowledge.",
  },
  {
    id: "NOX_TECH",
    slug: "nox-tech",
    display: "NOX TECH",
    category: "ai_software_automation_b2b",
    direction:
      "AI, software, automation, digital systems and B2B technology services/products. Authority, case studies, product/service understanding and qualified B2B opportunities.",
    audiences: ["B2B buyers", "technology decision-makers"],
    offerings: ["AI", "software", "automation", "B2B technology services/products"],
    locales: ["en", "ar", "tr"],
    claims: [
      "Do not invent product capabilities, SLAs, or customer logos",
      "Do not claim AI performance metrics without evidence",
    ],
    ctaHints: [
      { id: "demo", label: "Request demo", intent: "product" },
      { id: "discovery_call", label: "Discovery call", intent: "qualification" },
      { id: "enquiry", label: "Contact", intent: "general" },
    ],
  },
];

function write(brand: BrandSpec) {
  const dir = join("brands", brand.slug);
  mkdirSync(dir, { recursive: true });

  const identity = {
    brand_id: brand.id,
    module: "identity",
    updated_at: NOW,
    official_name: U(brand.display, "Display name from brief only — legal name MISSING"),
    short_name: U(brand.display, "Short name assumed from display — unverified"),
    legal_operating_relationship: M("Legal/operating relationship unknown"),
    description: M("Approved brand description required"),
    location_markets: brand.markets
      ? U(brand.markets, "Geographic focus from brief orientation only")
      : M("Markets unknown"),
    website: M("Official website URL required"),
    contact_channels: M("Contact channels unknown"),
    languages: U(brand.locales, "Default locales from brief orientation"),
  };

  const positioning = {
    brand_id: brand.id,
    module: "positioning",
    updated_at: NOW,
    category: U(brand.category, "Category orientation from master brief"),
    positioning_statement: M("Approved positioning statement required"),
    differentiation: M(),
    value_proposition: M(),
    desired_perception: M(),
    market_level: brand.id === "NOX_FORM" || brand.id === "VILLA_GLORY"
      ? U("premium_hint", "Hint from brief only — not a verified market level")
      : M(),
    geographic_positioning: brand.markets
      ? U(brand.markets, "From brief orientation")
      : M(),
    marketing_direction_note: brand.separationNote
      ? `${brand.direction} ${brand.separationNote}`
      : brand.direction,
  };

  const offerings = {
    brand_id: brand.id,
    module: "offerings",
    updated_at: NOW,
    items: brand.offerings.map((name, i) => ({
      id: `offer-${i + 1}`,
      name: U(name, "Offer label from brief — not a verified catalog item"),
      category: M(),
      description: M(),
      audience: M(),
      geography: M(),
      pricing: M("Pricing must be verified; time-sensitive"),
      cta: M(),
    })),
  };

  const audiences = {
    brand_id: brand.id,
    module: "audiences",
    updated_at: NOW,
    segments: brand.audiences.map((label, i) => ({
      id: `aud-${i + 1}`,
      role: i === 0 ? "PRIMARY" : "SECONDARY",
      label: U(label, "Audience label from brief — not persona-validated"),
      geography: M(),
      needs: M(),
      pain_points: M(),
      motivations: M(),
      objections: M(),
      buying_triggers: M(),
      preferred_channels: M(),
    })),
    personas: M("Do not fabricate personas"),
  };

  const voice = {
    brand_id: brand.id,
    module: "voice",
    updated_at: NOW,
    personality: M(),
    tone: M(),
    vocabulary: M(),
    preferred_terminology: M(),
    prohibited_terminology: M(),
    writing_examples: M(),
    cta_style: M(),
    language_differences: M("EN/AR/TR tone differences unknown"),
    locale_guidance: [],
  };

  const visual = {
    brand_id: brand.id,
    module: "visual",
    updated_at: NOW,
    logo: M("Do not manufacture a design system"),
    colors: M(),
    typography: M(),
    imagery: M(),
    photography: M(),
    graphic_style: M(),
    layout_characteristics: M(),
    prohibited_treatments: M(),
  };

  const channels = {
    brand_id: brand.id,
    module: "channels",
    updated_at: NOW,
    channels: [],
  };

  const pillars = {
    brand_id: brand.id,
    module: "content_pillars",
    updated_at: NOW,
    pillars: [],
  };

  const claims = {
    brand_id: brand.id,
    module: "claims",
    updated_at: NOW,
    approved_claims: M("No approved claims yet"),
    claims_requiring_evidence: M(),
    prohibited_claims: U(
      brand.claims,
      "Precautionary restrictions from Phase 1/brief — expand with legal review",
    ),
    regulatory_considerations: M(),
    pricing_restrictions: M(),
    investment_financial_restrictions:
      brand.id === "LOTIN"
        ? U(
            ["No ROI guarantees", "No fabricated returns", "Fresh evidence for property facts"],
            "LOTIN financial claim care from brief",
          )
        : M(),
    client_confidentiality_restrictions: M(),
  };

  const cta = {
    brand_id: brand.id,
    module: "cta",
    updated_at: NOW,
    items: brand.ctaHints.map((c) => ({
      id: c.id,
      label: U(c.label, "CTA hint — confirm brand-appropriate wording"),
      intent: U(c.intent, "Intent orientation"),
      brand_appropriate: true,
    })),
  };

  const competitors = {
    brand_id: brand.id,
    module: "competitors",
    updated_at: NOW,
    competitors: [],
  };

  const learnings = {
    brand_id: brand.id,
    module: "learnings",
    updated_at: NOW,
    items: [],
  };

  const sources = {
    brand_id: brand.id,
    module: "sources",
    updated_at: NOW,
    sources: [
      {
        id: "src-brief",
        title: "Marketing OS master build / Phase 2 orientation brief",
        source_type: "AI_INFERENCE",
        reference: "internal://marketing-os/orientation",
        observed_at: NOW,
        notes: "Orientation only — not verified company documentation",
      },
    ],
  };

  const onboarding = {
    brand_id: brand.id,
    state: "GAP_ANALYSIS",
    updated_at: NOW,
    notes: "Phase 2 scaffold complete — awaiting human document ingest",
  };

  const files: Record<string, unknown> = {
    "IDENTITY.json": identity,
    "POSITIONING.json": positioning,
    "OFFERINGS.json": offerings,
    "AUDIENCES.json": audiences,
    "VOICE.json": voice,
    "VISUAL.json": visual,
    "CHANNELS.json": channels,
    "CONTENT_PILLARS.json": pillars,
    "CLAIMS.json": claims,
    "CTA.json": cta,
    "COMPETITORS.json": competitors,
    "LEARNINGS.json": learnings,
    "SOURCES.json": sources,
    "ONBOARDING.json": onboarding,
  };

  for (const [name, data] of Object.entries(files)) {
    writeFileSync(join(dir, name), JSON.stringify(data, null, 2) + "\n");
  }

  writeFileSync(
    join(dir, "MISSING.md"),
    `# ${brand.display} — Brand Intelligence gaps (Phase 2)

## Orientation (not verified)

${brand.direction}

${brand.separationNote ? `## Separation\n\n${brand.separationNote}\n` : ""}

## Do not invent

- Official legal identity, website, contacts
- Positioning statement and differentiation
- Product/service catalog details, pricing, stock
- Personas (unless supplied and verified)
- Visual design system
- Channel handles/URLs
- Historical performance learnings
- Competitor list without evidence

## Next inputs needed

1. Internal brand/legal identity sheet
2. Approved messaging / positioning
3. Current offerings with CTAs
4. Tone & visual kits if they exist
5. Active channels
6. Compliance/claims list signed by an operator

Run: \`pnpm onboard-brand -- ${brand.id}\`
`,
  );

  console.log("Wrote", brand.slug);
}

for (const b of BRANDS) write(b);

mkdirSync("brands/_shared", { recursive: true });
writeFileSync(
  "brands/_shared/RELATIONSHIPS.json",
  JSON.stringify(
    {
      updated_at: NOW,
      relationships: [
        {
          relationship_id: "rel-vg-nf-orientation",
          from_brand_id: "VILLA_GLORY",
          to_brand_id: "NOX_FORM",
          type: "RELATED_COMPANY",
          description:
            "Orientation note: brands are related in the group context but knowledge must not merge. Asset reuse requires SHARED_ASSET_WITH_PERMISSION and usage_permission=true.",
          usage_permission: false,
          source_type: "AI_INFERENCE",
          source_reference: "marketing_os_phase2_orientation",
          confidence: "LOW",
          status: "UNVERIFIED",
          created_at: NOW,
        },
      ],
    },
    null,
    2,
  ) + "\n",
);
console.log("Wrote relationships");
