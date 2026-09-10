/**
 * Scaffold a new brand pack and register it.
 *
 * Usage:
 *   pnpm create-brand -- --id ACME --slug acme --name "Acme Co"
 *   pnpm create-brand -- --id ACME --slug acme --name "Acme Co" --locales en,ar
 *   pnpm create-brand -- --id ACME --slug acme --name "Acme Co" --drive-folder-url https://drive.google.com/drive/folders/...
  pnpm create-brand -- --id ACME --slug acme --name "Acme Co" --owner-email owner@example.test --enable-owner-email --enable-automation
 */
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BrandIdSchema,
  BrandRegistryEntrySchema,
} from "@marketing-os/contracts";
import {
  loadBrandRegistry,
  saveBrandRegistry,
  clearBrandRegistryCache,
  assertRegisteredBrandId,
} from "@marketing-os/runtime";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const NOW = new Date().toISOString();

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return undefined;
}

function M(notes?: string) {
  return notes ? { status: "MISSING", notes } : { status: "MISSING" };
}

function writeJson(path: string, data: unknown): void {
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
}

function main(): void {
  const idRaw = arg("--id");
  const slug = arg("--slug");
  const name = arg("--name");
  const localesRaw = arg("--locales") ?? "en";
  const driveFolderUrl = arg("--drive-folder-url");
  const driveFolderId = arg("--drive-folder-id");
  const ownerEmail = arg("--owner-email");
  const enableOwnerEmail = process.argv.includes("--enable-owner-email");
  const enableAutomation = process.argv.includes("--enable-automation");

  if (!idRaw || !slug || !name) {
    console.error(
      'Usage: pnpm create-brand -- --id ACME --slug acme --name "Acme Co" [--locales en,ar] [--drive-folder-url URL] [--drive-folder-id ID] [--owner-email EMAIL] [--enable-owner-email] [--enable-automation] [--brands-root DIR]',
    );
    process.exit(1);
  }

  const brand_id = BrandIdSchema.parse(idRaw);
  const locales = localesRaw.split(",").map((s) => s.trim()).filter(Boolean);
  const BRANDS = arg("--brands-root") ?? join(ROOT, "brands");

  const entry = BrandRegistryEntrySchema.parse({
    brand_id,
    slug,
    display_name: name,
    aliases: [name.toLowerCase(), slug],
    status: "ACTIVE",
    default_locales: locales,
    created_at: NOW,
    ...(driveFolderUrl ? { asset_drive_folder_url: driveFolderUrl } : {}),
    ...(driveFolderId ? { asset_drive_folder_id: driveFolderId } : {}),
    ...(ownerEmail ? { owner_email: ownerEmail } : {}),
    owner_email_enabled: enableOwnerEmail,
    automation_enabled: enableAutomation,
  });

  clearBrandRegistryCache();
  const registry = loadBrandRegistry({ brandsRoot: BRANDS });
  if (registry.brands.some((b) => b.brand_id === brand_id)) {
    console.error(`brand_id already registered: ${brand_id}`);
    process.exit(1);
  }
  if (registry.brands.some((b) => b.slug === slug)) {
    console.error(`slug already registered: ${slug}`);
    process.exit(1);
  }

  const dir = join(BRANDS, slug);
  if (existsSync(dir)) {
    console.error(`Brand folder already exists: ${dir}`);
    process.exit(1);
  }
  mkdirSync(dir, { recursive: true });

  const meta = { brand_id, updated_at: NOW };

  writeJson(join(dir, "profile.json"), {
    brand_id,
    slug,
    display_name: name,
    identity: M("Requires brand onboarding"),
    positioning: M("Requires brand onboarding"),
    products_services: M(),
    audiences: M(),
    personas: M(),
    markets: M(),
    competitors: M(),
    tone: M(),
    visual_guidelines: M(),
    content_pillars: M(),
    channels: M(),
    seo: M(),
    paid_media: M(),
    cta_library: M(),
    claims_restrictions: M("Add prohibited claims before marketing"),
    historical_learnings: M(),
    default_locales: locales,
    updated_at: NOW,
  });

  writeJson(join(dir, "ONBOARDING.json"), {
    brand_id,
    state: "DISCOVER",
    updated_at: NOW,
    notes: "Scaffolded by create-brand — awaiting evidence ingest",
  });

  writeJson(join(dir, "IDENTITY.json"), {
    ...meta,
    module: "identity",
    official_name: {
      status: "UNVERIFIED",
      value: name,
      notes: "Scaffold orientation from create-brand — not operator-verified",
      source_type: "AI_INFERENCE",
      source_reference: "create-brand scaffold",
      confidence: "LOW",
      observed_at: NOW,
      time_sensitive: false,
    },
    short_name: M(),
    legal_operating_relationship: M(),
    description: M(),
    location_markets: M(),
    website: M(),
    contact_channels: M(),
    languages: {
      status: "UNVERIFIED",
      value: locales,
      notes: "Default locales from create-brand flags",
      source_type: "AI_INFERENCE",
      source_reference: "create-brand scaffold",
      confidence: "LOW",
      observed_at: NOW,
      time_sensitive: false,
    },
  });

  writeJson(join(dir, "POSITIONING.json"), {
    ...meta,
    module: "positioning",
    category: M(),
    positioning_statement: M(),
    differentiation: M(),
    value_proposition: M(),
    desired_perception: M(),
    market_level: M(),
    geographic_positioning: M(),
  });

  writeJson(join(dir, "OFFERINGS.json"), {
    ...meta,
    module: "offerings",
    items: [],
  });

  writeJson(join(dir, "AUDIENCES.json"), {
    ...meta,
    module: "audiences",
    segments: [],
    personas: M(),
  });

  for (const [file, module] of [
    ["VOICE.json", "voice"],
    ["VISUAL.json", "visual"],
    ["CHANNELS.json", "channels"],
    ["CONTENT_PILLARS.json", "content_pillars"],
    ["COMPETITORS.json", "competitors"],
    ["LEARNINGS.json", "learnings"],
    ["SOURCES.json", "sources"],
  ] as const) {
    const body: Record<string, unknown> = { ...meta, module };
    if (module === "voice") {
      Object.assign(body, {
        personality: M(),
        tone: M(),
        vocabulary: M(),
        preferred_terminology: M(),
        prohibited_terminology: M(),
        writing_examples: M(),
        cta_style: M(),
        language_differences: M(),
        locale_guidance: [],
      });
    } else if (module === "visual") {
      Object.assign(body, {
        logo: M(),
        colors: M(),
        typography: M(),
        imagery: M(),
        photography: M(),
        graphic_style: M(),
        layout_characteristics: M(),
        prohibited_treatments: M(),
      });
    } else if (module === "channels") {
      Object.assign(body, { channels: [] });
    } else if (module === "content_pillars") {
      Object.assign(body, { pillars: [] });
    } else if (module === "competitors") {
      Object.assign(body, { competitors: [] });
    } else if (module === "learnings") {
      Object.assign(body, { items: [] });
    } else if (module === "sources") {
      Object.assign(body, { sources: [] });
    }
    writeJson(join(dir, file), body);
  }

  writeJson(join(dir, "CLAIMS.json"), {
    ...meta,
    module: "claims",
    approved_claims: M("No approved claims yet"),
    claims_requiring_evidence: M(),
    prohibited_claims: M("Add operating restrictions before marketing"),
    regulatory_considerations: M(),
    pricing_restrictions: M(),
    investment_financial_restrictions: M(),
    client_confidentiality_restrictions: M(),
  });

  writeJson(join(dir, "CTA.json"), {
    ...meta,
    module: "cta",
    items: [],
  });

  writeJson(join(dir, "EVIDENCE_LEDGER.json"), {
    brand_id,
    generated_at: NOW,
    pipeline: "PHASE_2B",
    candidates: [],
  });

  writeFileSync(
    join(dir, "MISSING.md"),
    `# ${name} — Missing brand intelligence\n\nScaffolded by \`create-brand\`. Fill evidence via onboarding before VERIFIED marketing claims.\n`,
  );

  registry.brands.push(entry);
  registry.updated_at = NOW;
  saveBrandRegistry(registry, { brandsRoot: BRANDS });

  // Sanity: registry + pack load
  clearBrandRegistryCache();
  assertRegisteredBrandId(brand_id, { brandsRoot: BRANDS });

  console.log(
    JSON.stringify(
      {
        created: true,
        brand_id,
        slug,
        path: dir,
        registry: "brands/_shared/REGISTRY.json",
        next: [
          `pnpm onboard-brand -- ${brand_id}`,
          "Ingest evidence; never invent VERIFIED commercial claims",
        ],
      },
      null,
      2,
    ),
  );
}

main();
