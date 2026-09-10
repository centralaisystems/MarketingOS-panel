import type {
  BrandPack,
  KnowledgeStatus,
  ProvenancedField,
} from "@marketing-os/contracts";

/**
 * Pack-derived draft signals. Never invent values; never treat UNVERIFIED as VERIFIED.
 * Do not surface positioning.marketing_direction_note (orientation text; contamination risk).
 */

export type CitedField = {
  path: string;
  status: KnowledgeStatus;
  value?: unknown;
};

export type CitedOffering = {
  id: string;
  name: string;
  name_status: KnowledgeStatus;
};

export type CitedAudience = {
  id: string;
  role: "PRIMARY" | "SECONDARY";
  label: string;
  label_status: KnowledgeStatus;
  geography?: CitedField;
  preferred_channels?: CitedField;
};

export type CitedCta = {
  id: string;
  label: string;
  label_status: KnowledgeStatus;
  intent?: CitedField;
};

export type PackDraftSignals = {
  brand_id: BrandPack["brand_id"];
  official_name?: CitedField;
  description?: CitedField;
  markets?: CitedField;
  category?: CitedField;
  positioning_statement?: CitedField;
  differentiation?: CitedField;
  geographic_positioning?: CitedField;
  tone?: CitedField;
  prohibited_claims?: CitedField;
  approved_claims?: CitedField;
  offerings: CitedOffering[];
  audiences: CitedAudience[];
  ctas: CitedCta[];
  channel_count: number;
  pillar_count: number;
  visual_kit_present: boolean;
  missing_paths: string[];
};

function citeField(
  field: ProvenancedField | undefined,
  path: string,
): CitedField | undefined {
  if (!field || field.status === "MISSING") return undefined;
  return { path, status: field.status, value: field.value };
}

function noteMissing(
  field: ProvenancedField | undefined,
  path: string,
  missing: string[],
): void {
  if (!field || field.status === "MISSING") missing.push(path);
}

export function renderCitedValue(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item : renderCitedValue(item)))
      .filter(Boolean)
      .join(", ");
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

export function renderCited(field: CitedField): string {
  const text = renderCitedValue(field.value);
  if (field.status === "VERIFIED") return text;
  return text ? `${text} [${field.status}]` : `[${field.status}]`;
}

export function humanizeToken(raw: string): string {
  return raw.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

export function isVerifiedFact(field: CitedField | undefined): field is CitedField {
  return field?.status === "VERIFIED" && field.value !== undefined;
}

export function packDisplayName(signals: PackDraftSignals, fallback: string): string {
  if (typeof signals.official_name?.value === "string" && signals.official_name.value.trim()) {
    return signals.official_name.value;
  }
  return fallback;
}

export function packCategoryLabel(signals: PackDraftSignals): string | undefined {
  if (!signals.category?.value) return undefined;
  const raw = renderCitedValue(signals.category.value);
  return raw ? humanizeToken(raw) : undefined;
}

export function primaryCta(signals: PackDraftSignals): CitedCta | undefined {
  return (
    signals.ctas.find((cta) => cta.label_status === "VERIFIED") ?? signals.ctas[0]
  );
}

export function verifiedOfferingNames(signals: PackDraftSignals): string[] {
  return signals.offerings
    .filter((item) => item.name_status === "VERIFIED")
    .map((item) => item.name);
}

export function verifiedAudienceLabels(signals: PackDraftSignals): string[] {
  return signals.audiences
    .filter((item) => item.label_status === "VERIFIED")
    .map((item) => item.label);
}

export function extractPackDraftSignals(pack: BrandPack): PackDraftSignals {
  const missing_paths: string[] = [];

  noteMissing(pack.identity.official_name, "identity.official_name", missing_paths);
  noteMissing(pack.identity.description, "identity.description", missing_paths);
  noteMissing(pack.identity.location_markets, "identity.location_markets", missing_paths);
  noteMissing(pack.identity.contact_channels, "identity.contact_channels", missing_paths);

  noteMissing(pack.positioning.category, "positioning.category", missing_paths);
  noteMissing(
    pack.positioning.positioning_statement,
    "positioning.positioning_statement",
    missing_paths,
  );
  noteMissing(pack.positioning.differentiation, "positioning.differentiation", missing_paths);
  noteMissing(pack.positioning.value_proposition, "positioning.value_proposition", missing_paths);
  noteMissing(
    pack.positioning.geographic_positioning,
    "positioning.geographic_positioning",
    missing_paths,
  );

  noteMissing(pack.voice.tone, "voice.tone", missing_paths);
  noteMissing(pack.voice.personality, "voice.personality", missing_paths);
  noteMissing(pack.voice.vocabulary, "voice.vocabulary", missing_paths);

  noteMissing(pack.claims.prohibited_claims, "claims.prohibited_claims", missing_paths);
  noteMissing(pack.claims.approved_claims, "claims.approved_claims", missing_paths);

  noteMissing(pack.visual.colors, "visual.colors", missing_paths);
  noteMissing(pack.visual.imagery, "visual.imagery", missing_paths);
  noteMissing(pack.visual.photography, "visual.photography", missing_paths);

  noteMissing(pack.audiences.personas, "audiences.personas", missing_paths);

  if (pack.channels.channels.length === 0) missing_paths.push("channels.channels");
  if (pack.content_pillars.pillars.length === 0) {
    missing_paths.push("content_pillars.pillars");
  }

  const offerings: CitedOffering[] = [];
  for (const item of pack.offerings.items) {
    if (item.name.status === "MISSING" || item.name.value === undefined) continue;
    const name = renderCitedValue(item.name.value);
    if (!name) continue;
    offerings.push({
      id: item.id,
      name,
      name_status: item.name.status,
    });
  }
  if (offerings.length === 0) missing_paths.push("offerings.items");

  const audiences: CitedAudience[] = [];
  for (const segment of pack.audiences.segments) {
    if (segment.label.status === "MISSING" || segment.label.value === undefined) {
      continue;
    }
    const label = renderCitedValue(segment.label.value);
    if (!label) continue;
    const cited: CitedAudience = {
      id: segment.id,
      role: segment.role,
      label,
      label_status: segment.label.status,
    };
    const geography = citeField(
      segment.geography,
      `audiences.segments.${segment.id}.geography`,
    );
    const preferred = citeField(
      segment.preferred_channels,
      `audiences.segments.${segment.id}.preferred_channels`,
    );
    if (geography) cited.geography = geography;
    if (preferred) cited.preferred_channels = preferred;
    audiences.push(cited);
  }
  if (audiences.length === 0) missing_paths.push("audiences.segments");

  const ctas: CitedCta[] = [];
  for (const item of pack.cta.items) {
    if (item.label.status === "MISSING" || item.label.value === undefined) continue;
    const label = renderCitedValue(item.label.value);
    if (!label) continue;
    const cited: CitedCta = {
      id: item.id,
      label,
      label_status: item.label.status,
    };
    const intent = citeField(item.intent, `cta.items.${item.id}.intent`);
    if (intent) cited.intent = intent;
    ctas.push(cited);
  }
  if (ctas.length === 0) missing_paths.push("cta.items");

  const visual_kit_present =
    pack.visual.colors.status !== "MISSING" ||
    pack.visual.imagery.status !== "MISSING" ||
    pack.visual.photography.status !== "MISSING";

  return {
    brand_id: pack.brand_id,
    official_name: citeField(pack.identity.official_name, "identity.official_name"),
    description: citeField(pack.identity.description, "identity.description"),
    markets: citeField(pack.identity.location_markets, "identity.location_markets"),
    category: citeField(pack.positioning.category, "positioning.category"),
    positioning_statement: citeField(
      pack.positioning.positioning_statement,
      "positioning.positioning_statement",
    ),
    differentiation: citeField(
      pack.positioning.differentiation,
      "positioning.differentiation",
    ),
    geographic_positioning: citeField(
      pack.positioning.geographic_positioning,
      "positioning.geographic_positioning",
    ),
    tone: citeField(pack.voice.tone, "voice.tone"),
    prohibited_claims: citeField(
      pack.claims.prohibited_claims,
      "claims.prohibited_claims",
    ),
    approved_claims: citeField(pack.claims.approved_claims, "claims.approved_claims"),
    offerings,
    audiences,
    ctas,
    channel_count: pack.channels.channels.length,
    pillar_count: pack.content_pillars.pillars.length,
    visual_kit_present,
    missing_paths,
  };
}

export function citedPathsUsed(signals: PackDraftSignals): string[] {
  const paths: string[] = [];
  for (const field of [
    signals.official_name,
    signals.description,
    signals.markets,
    signals.category,
    signals.positioning_statement,
    signals.differentiation,
    signals.tone,
    signals.prohibited_claims,
  ]) {
    if (field) paths.push(field.path);
  }
  if (signals.offerings.length) paths.push("offerings.items.name");
  if (signals.audiences.length) paths.push("audiences.segments.label");
  if (signals.ctas.length) paths.push("cta.items.label");
  return paths;
}
