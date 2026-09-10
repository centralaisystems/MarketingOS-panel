import { createHash, randomUUID } from "node:crypto";
import {
  AgentResultSchema,
  HiggsfieldGenerateJobListSchema,
  HiggsfieldGenerateJobSchema,
  HiggsfieldLayoutBriefSchema,
  HiggsfieldPromptSchema,
  StillAspectSchema,
  StillGapReportSchema,
  type AgentResult,
  type AssetRecord,
  type BrandId,
  type HiggsfieldGenerateJob,
  type HiggsfieldGenerateJobList,
  type HiggsfieldLayoutBrief,
  type HiggsfieldPrompt,
  type StillAspect,
  type StillGapNeed,
  type StillGapReport,
} from "@marketing-os/contracts";
import {
  assertRegisteredBrandId,
  brandsRootOpt,
} from "./brand-registry.js";
import { loadBrandContext } from "./brand-loader.js";
import { loadBrandPack } from "./brand-pack.js";
import {
  extractPackDraftSignals,
  isVerifiedFact,
  renderCited,
  renderCitedValue,
  verifiedOfferingNames,
} from "./pack-draft-signals.js";
import { runBrandGuardian } from "./agents/brand-guardian.js";
import { assertWaveEnabled } from "./phase-gates.js";
import { InMemoryAuditSink, type AuditSink } from "./audit.js";
import { OpsAuditSink, type OpsStore } from "./ops-store.js";
import type { AssetCatalog } from "./assets.js";
import { listBrandKitAssets } from "./figma-arrange.js";
import {
  createHiggsfieldAdapter,
  type HiggsfieldAdapter,
} from "./higgsfield-adapter.js";
import {
  createHiggsfieldGenerateJobStore,
  type HiggsfieldGenerateJobStore,
} from "./higgsfield-jobs.js";

const HIGGSFIELD_ASSET_NS = Buffer.from("c3d4e5f678901234cdef123456789012", "hex");

const ASPECT_ALIASES: Array<{ re: RegExp; aspect: StillAspect }> = [
  { re: /\b9\s*[:x]\s*16\b|\bstory\b|\breel\b|\bvertical\b/, aspect: "9:16" },
  { re: /\b1\s*[:x]\s*1\b|\bsquare\b|\binstagram(?:\s+grid)?\b/, aspect: "1:1" },
  { re: /\b16\s*[:x]\s*9\b|\bhero\b|\blandscape\b|\bbanner\b/, aspect: "16:9" },
  { re: /\b4\s*[:x]\s*3\b/, aspect: "4:3" },
  { re: /\b3\s*[:x]\s*4\b/, aspect: "3:4" },
];

const USAGE_ALIASES: Array<{ re: RegExp; tag: string }> = [
  { re: /\bliving(?:[-\s]?room)?\b/, tag: "living-room" },
  { re: /\bterrace\b|\boutdoor\b/, tag: "outdoor" },
  { re: /\bbedroom\b/, tag: "bedroom" },
  { re: /\bdining\b/, tag: "dining" },
  { re: /\blighting\b/, tag: "lighting" },
  { re: /\boffice\b/, tag: "office" },
  { re: /\bd[eé]cor\b/, tag: "decor" },
  { re: /\bstory\b|\breel\b/, tag: "story" },
  { re: /\bhero\b/, tag: "hero" },
  { re: /\binstagram\b/, tag: "instagram" },
];

const DEFAULT_GAP: StillGapNeed = {
  usage_tag: "story",
  aspect: "9:16",
  reason: "No approved still covers story / 9:16 for the brief.",
};

export function higgsfieldGeneratedAssetId(
  brand_id: BrandId,
  job_id: string,
): string {
  const name = Buffer.from(`higgsfield:${brand_id}:${job_id}`, "utf8");
  const hash = createHash("sha1").update(HIGGSFIELD_ASSET_NS).update(name).digest();
  hash[6] = (hash[6]! & 0x0f) | 0x50;
  hash[8] = (hash[8]! & 0x3f) | 0x80;
  const h = hash.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

export class HiggsfieldGenerateInputError extends Error {
  readonly status = 400;
  constructor(message: string) {
    super(message);
    this.name = "HiggsfieldGenerateInputError";
  }
}

export function listApprovedStillsForGaps(
  catalog: AssetCatalog,
  brand_id: BrandId,
): AssetRecord[] {
  return catalog.listMetadata(brand_id).filter((asset) => {
    if (asset.folder_role === "generated") return false;
    if (asset.source === "figma" || asset.source === "higgsfield") return false;
    if (asset.kind !== "IMAGE") return false;
    if (asset.approval_status !== "APPROVED") return false;
    return (
      asset.folder_role === "approved-stills" || asset.folder_role === undefined
    );
  });
}

function listCoverageAssets(
  catalog: AssetCatalog,
  brand_id: BrandId,
): AssetRecord[] {
  const approved = listApprovedStillsForGaps(catalog, brand_id);
  const kit = listBrandKitAssets(catalog, brand_id).filter(
    (asset) => asset.kind === "IMAGE",
  );
  const generatedDrafts = catalog.listMetadata(brand_id).filter((asset) => {
    if (asset.kind !== "IMAGE") return false;
    if (asset.folder_role !== "generated" && asset.source !== "higgsfield") {
      return false;
    }
    return asset.source === "higgsfield" || asset.usage_tags.includes("higgsfield");
  });
  const seen = new Set<string>();
  const out: AssetRecord[] = [];
  for (const row of [...approved, ...kit, ...generatedDrafts]) {
    if (seen.has(row.asset_id)) continue;
    seen.add(row.asset_id);
    out.push(row);
  }
  return out;
}

function normalizeTag(raw: string): string {
  return raw.trim().toLowerCase().replace(/[_\s]+/g, "-");
}

function assetTags(asset: AssetRecord): string[] {
  return [
    ...asset.usage_tags,
    ...asset.platform_suitability,
    asset.folder_role ?? "",
    asset.title,
  ]
    .map(normalizeTag)
    .filter(Boolean);
}

function impliedAspects(asset: AssetRecord): StillAspect[] {
  const fromMeta = asset.metadata.aspect;
  const parsed =
    typeof fromMeta === "string" ? StillAspectSchema.safeParse(fromMeta) : null;
  const aspects: StillAspect[] = parsed?.success ? [parsed.data] : [];
  const hay = `${asset.usage_tags.join(" ")} ${asset.platform_suitability.join(" ")}`.toLowerCase();
  if (/\bstory\b|\breel\b/.test(hay)) aspects.push("9:16");
  if (/\binstagram\b|\bsquare\b/.test(hay) && !/\bstory\b/.test(hay)) {
    aspects.push("1:1");
  }
  if (/\bhero\b|\bbanner\b/.test(hay)) aspects.push("16:9");
  return [...new Set(aspects)];
}

function assetCoversUsage(asset: AssetRecord, tag: string): boolean {
  const needed = normalizeTag(tag);
  if (!needed) return false;
  const tags = assetTags(asset);
  if (tags.includes(needed)) return true;
  if (needed === "living-room" && tags.some((t) => t.includes("living"))) return true;
  if (needed === "outdoor" && tags.some((t) => t.includes("terrace"))) return true;
  return tags.some((t) => t === needed || t.includes(needed));
}

function assetCoversAspect(asset: AssetRecord, aspect: StillAspect): boolean {
  return impliedAspects(asset).includes(aspect);
}

function inferNeedsFromText(text: string): {
  usage_tags: string[];
  aspects: StillAspect[];
} {
  const usage_tags: string[] = [];
  const aspects: StillAspect[] = [];
  const hay = text.toLowerCase();
  for (const { re, tag } of USAGE_ALIASES) {
    if (re.test(hay)) usage_tags.push(tag);
  }
  for (const { re, aspect } of ASPECT_ALIASES) {
    if (re.test(hay)) aspects.push(aspect);
  }
  return {
    usage_tags: [...new Set(usage_tags)],
    aspects: [...new Set(aspects)],
  };
}

export function resolveHiggsfieldBrief(
  raw: unknown,
  campaign?: { campaign_id: string; pack_id: string; objective: string } | null,
): HiggsfieldLayoutBrief {
  const inferredFromCampaign = campaign
    ? inferNeedsFromText(campaign.objective)
    : { usage_tags: [], aspects: [] };

  if (typeof raw === "string" && raw.trim()) {
    const description = raw.trim();
    const inferred = inferNeedsFromText(description);
    return HiggsfieldLayoutBriefSchema.parse({
      title: campaign ? `Fill gaps: ${campaign.objective}` : "Fill still gaps",
      description,
      needed_usage_tags: inferred.usage_tags,
      needed_aspects: inferred.aspects,
      ...(campaign
        ? { campaign_id: campaign.campaign_id, pack_id: campaign.pack_id }
        : {}),
    });
  }

  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const rec = raw as Record<string, unknown>;
    const description =
      typeof rec.description === "string" && rec.description.trim()
        ? rec.description.trim()
        : typeof rec.brief === "string" && rec.brief.trim()
          ? rec.brief.trim()
          : campaign
            ? campaign.objective
            : "Story still 9:16. No commercial claims.";
    const inferred = inferNeedsFromText(
      `${typeof rec.title === "string" ? rec.title : ""} ${description}`,
    );
    const explicitTags = Array.isArray(rec.needed_usage_tags)
      ? rec.needed_usage_tags.filter(
          (t): t is string => typeof t === "string" && t.trim().length > 0,
        )
      : [];
    const explicitAspects = Array.isArray(rec.needed_aspects)
      ? rec.needed_aspects.flatMap((a) => {
          const parsed = StillAspectSchema.safeParse(a);
          return parsed.success ? [parsed.data] : [];
        })
      : [];
    return HiggsfieldLayoutBriefSchema.parse({
      title:
        typeof rec.title === "string" && rec.title.trim()
          ? rec.title.trim()
          : campaign
            ? `Fill gaps: ${campaign.objective}`
            : "Fill still gaps",
      description,
      needed_usage_tags: [...new Set([...explicitTags, ...inferred.usage_tags])],
      needed_aspects: [...new Set([...explicitAspects, ...inferred.aspects])],
      ...(typeof rec.campaign_id === "string"
        ? { campaign_id: rec.campaign_id }
        : campaign
          ? { campaign_id: campaign.campaign_id }
          : {}),
      ...(typeof rec.pack_id === "string"
        ? { pack_id: rec.pack_id }
        : campaign
          ? { pack_id: campaign.pack_id }
          : {}),
    });
  }

  return HiggsfieldLayoutBriefSchema.parse({
    title: campaign ? `Fill gaps: ${campaign.objective}` : "Fill still gaps",
    description: campaign
      ? campaign.objective
      : "Story still 9:16. No commercial claims.",
    needed_usage_tags: inferredFromCampaign.usage_tags,
    needed_aspects: inferredFromCampaign.aspects.length
      ? inferredFromCampaign.aspects
      : campaign
        ? []
        : ["9:16"],
    ...(campaign
      ? { campaign_id: campaign.campaign_id, pack_id: campaign.pack_id }
      : {}),
  });
}

export function detectApprovedStillGaps(
  catalog: AssetCatalog,
  brand_id: BrandId,
  brief: HiggsfieldLayoutBrief,
): StillGapReport {
  const coverage = listCoverageAssets(catalog, brand_id);
  const neededTags = [...brief.needed_usage_tags];
  const neededAspects = [...brief.needed_aspects];

  if (neededTags.length === 0 && neededAspects.length === 0) {
    neededTags.push(DEFAULT_GAP.usage_tag!);
    neededAspects.push(DEFAULT_GAP.aspect!);
  }

  const covered_usage_tags = neededTags.filter((tag) =>
    coverage.some((asset) => assetCoversUsage(asset, tag)),
  );
  const covered_aspects = neededAspects.filter((aspect) =>
    coverage.some((asset) => assetCoversAspect(asset, aspect)),
  );

  const needs: StillGapNeed[] = [];
  for (const tag of neededTags) {
    if (covered_usage_tags.includes(tag)) continue;
    needs.push({
      usage_tag: tag,
      reason: `No approved still or brand-kit image covers usage_tag=${tag}.`,
    });
  }
  for (const aspect of neededAspects) {
    if (covered_aspects.includes(aspect)) continue;
    needs.push({
      aspect,
      reason: `No approved still or brand-kit image covers aspect=${aspect}.`,
    });
  }

  const paired =
    neededTags.length === 1 &&
    neededAspects.length === 1 &&
    needs.length > 0;
  const reportNeeds = paired
    ? [
        {
          usage_tag: neededTags[0],
          aspect: neededAspects[0],
          reason:
            needs.length === 2
              ? `No approved still covers ${neededTags[0]} / ${neededAspects[0]} for the brief.`
              : needs[0]!.reason,
        },
      ]
    : needs;

  const has_gap = reportNeeds.length > 0;
  return StillGapReportSchema.parse({
    has_gap,
    needs: reportNeeds,
    reason: has_gap
      ? reportNeeds.map((n) => n.reason).join(" ")
      : "Approved stills and brand-kit already cover the brief. No Higgsfield generate.",
    covered_usage_tags,
    covered_aspects,
  });
}

export function buildHiggsfieldPrompt(input: {
  brand_id: BrandId;
  brief: HiggsfieldLayoutBrief;
  gap: StillGapNeed;
  brandsRoot?: string;
}): HiggsfieldPrompt {
  const pack = loadBrandPack(input.brand_id, undefined, brandsRootOpt(input.brandsRoot));
  const signals = extractPackDraftSignals(pack);
  const verified: string[] = [];
  const unverified: string[] = [];

  const cite = (
    field: Parameters<typeof isVerifiedFact>[0],
    label: string,
  ): void => {
    if (!field) return;
    const rendered = renderCited(field);
    if (isVerifiedFact(field)) {
      verified.push(`${label}: ${renderCitedValue(field.value)}`);
    } else {
      unverified.push(`${label}: ${rendered}`);
    }
  };

  cite(signals.tone, "voice.tone");
  cite(signals.positioning_statement, "positioning.positioning_statement");
  cite(signals.category, "positioning.category");
  cite(signals.differentiation, "positioning.differentiation");

  const offerings = verifiedOfferingNames(signals);
  if (offerings.length) {
    verified.push(`offerings (categories, not SKUs): ${offerings.join(", ")}`);
  }
  for (const item of signals.offerings) {
    if (item.name_status !== "VERIFIED") {
      unverified.push(`offering ${item.id}: ${item.name} [${item.name_status}]`);
    }
  }

  const usage = input.gap.usage_tag ?? "story";
  const aspect = input.gap.aspect ?? "9:16";
  const lines = [
    `Photoreal still for ${input.brand_id}. Visual mood only.`,
    "No on-image text, prices, SKUs, ROI, partner logos, or invented commercial claims.",
    `Usage: ${usage}. Aspect: ${aspect}.`,
    `Layout brief: ${input.brief.description}`,
    verified.length
      ? `VERIFIED pack fields: ${verified.join("; ")}`
      : "VERIFIED pack voice/positioning/offering fields: none cited.",
    unverified.length
      ? `UNVERIFIED/MISSING (do not treat as fact): ${unverified.slice(0, 8).join("; ")}`
      : "",
    "Do not invent VERIFIED ROI, SKU, or partner claims.",
  ].filter(Boolean);

  return HiggsfieldPromptSchema.parse({
    text: lines.join(" "),
    verified_fields: verified,
    unverified_fields: unverified,
    forbidden_claims_note:
      "Do not invent VERIFIED ROI, SKU, or partner claims.",
  });
}

function collectOptionalSourceAssets(
  catalog: AssetCatalog,
  brand_id: BrandId,
  source_asset_ids: string[],
): AssetRecord[] {
  if (!source_asset_ids.length) return [];
  const unique = [...new Set(source_asset_ids)];
  const assets: AssetRecord[] = [];
  for (const asset_id of unique) {
    const row = catalog.getMetadata(brand_id, asset_id);
    if (!row) {
      throw new HiggsfieldGenerateInputError(
        `Source asset not found for ${brand_id}`,
      );
    }
    if (row.kind !== "IMAGE") {
      throw new HiggsfieldGenerateInputError(
        "Higgsfield fill-gaps accepts image source assets only.",
      );
    }
    assets.push(row);
  }
  return assets;
}

function brandKitChecks(brand_id: BrandId, brandKit: AssetRecord[]): string[] {
  if (brandKit.length === 0) {
    return [
      `brand-kit metadata MISSING for ${brand_id} — sync the Drive folder before marking generate ready for owner review.`,
    ];
  }
  return [];
}

function generateAgentResult(
  brand_id: BrandId,
  job_id: string,
  brief: HiggsfieldLayoutBrief,
  prompt: HiggsfieldPrompt,
  gap: StillGapNeed,
  now: string,
): AgentResult {
  return AgentResultSchema.parse({
    task_id: job_id,
    brand_id,
    agent: "A07_CREATIVE_DIRECTOR",
    summary: `Higgsfield still draft: ${brief.title}. Gap: ${gap.reason} Visual only — no commercial claims.`,
    deliverables: [
      {
        type: "higgsfield_still",
        headline: brief.title,
        body: prompt.text,
      },
    ],
    statements: [
      {
        text: "Generated Higgsfield still is UNVERIFIED metadata, not a VERIFIED commercial claim.",
        kind: "OBSERVATION",
        confidence: "HIGH",
        evidence_ids: [],
      },
    ],
    assumptions: [
      "Prompt uses VERIFIED pack voice/positioning/offerings only; UNVERIFIED fields are labeled and are not facts.",
    ],
    confidence: "LOW",
    recommended_next_action:
      "Send generated still for owner review after Guardian pass. Keep internal only.",
    recommended_approval_level: "LEVEL_1",
    missing_information: prompt.unverified_fields.slice(0, 6),
    capabilities_used: ["PRODUCE_CREATIVE_BRIEF"],
    created_at: now,
  });
}

function writeGeneratedAsset(input: {
  catalog: AssetCatalog;
  brand_id: BrandId;
  job_id: string;
  generated_asset_id: string;
  brief: HiggsfieldLayoutBrief;
  prompt: HiggsfieldPrompt;
  gap: StillGapNeed;
  source_assets: AssetRecord[];
  brand_kit: AssetRecord[];
  output: NonNullable<HiggsfieldGenerateJob["output"]>;
  source_mode: HiggsfieldGenerateJob["source"];
  now: string;
}): AssetRecord {
  const record: AssetRecord = {
    asset_id: input.generated_asset_id,
    brand_id: input.brand_id,
    title: `${input.brief.title} (${input.output.usage_tag} ${input.output.aspect})`,
    kind: "IMAGE",
    mime_type: "image/png",
    storage_uri: input.output.storage_uri,
    in_git: false,
    usage_tags: ["generated", "higgsfield", input.output.usage_tag],
    platform_suitability:
      input.output.aspect === "9:16"
        ? ["story"]
        : input.output.aspect === "1:1"
          ? ["instagram"]
          : input.output.aspect === "16:9"
            ? ["hero"]
            : [],
    approval_status: "DRAFT",
    knowledge_status: "UNVERIFIED",
    provenance: "GENERATED",
    source: "higgsfield",
    folder_role: "generated",
    metadata: {
      provenance: "GENERATED",
      generate_job_id: input.job_id,
      gap_reason: input.gap.reason,
      aspect: input.output.aspect,
      usage_tag: input.output.usage_tag,
      media_id: input.output.media_id,
      source_asset_ids: input.source_assets.map((a) => a.asset_id),
      brand_kit_asset_ids: input.brand_kit.map((a) => a.asset_id),
      source_mode: input.source_mode,
      verified_prompt_fields: input.prompt.verified_fields,
      unverified_prompt_fields: input.prompt.unverified_fields,
      knowledge_note:
        "GENERATED Higgsfield still is UNVERIFIED metadata — not a VERIFIED commercial claim.",
      ...(input.output.preview_url
        ? { preview_url: input.output.preview_url }
        : {}),
    },
    created_at: input.now,
    updated_at: input.now,
  };
  return input.catalog.putMetadata(input.brand_id, record);
}

export function generatedMaterialsForCampaign(
  jobs: HiggsfieldGenerateJobStore | undefined,
  brand_id: BrandId,
  campaign_id: string,
): { generated_asset_ids: string[]; higgsfield_job_ids: string[] } {
  if (!jobs) return { generated_asset_ids: [], higgsfield_job_ids: [] };
  const matched = jobs
    .list(brand_id)
    .filter((job) => job.layout_brief.campaign_id === campaign_id);
  return {
    higgsfield_job_ids: matched.map((job) => job.job_id),
    generated_asset_ids: matched
      .map((job) => job.generated_asset_id)
      .filter((id): id is string => typeof id === "string"),
  };
}

export function listHiggsfieldGenerateJobs(input: {
  brand_id: string;
  catalog: AssetCatalog;
  jobs: HiggsfieldGenerateJobStore;
  adapter?: HiggsfieldAdapter;
  layout_brief?: unknown;
  brandsRoot?: string;
}): HiggsfieldGenerateJobList {
  assertWaveEnabled("WAVE_4B_ASSET_PIPELINE", brandsRootOpt(input.brandsRoot));
  const brand_id = assertRegisteredBrandId(
    input.brand_id,
    brandsRootOpt(input.brandsRoot),
  );
  const adapter = input.adapter ?? createHiggsfieldAdapter();
  const brief = resolveHiggsfieldBrief(
    input.layout_brief ?? "Story still 9:16. No commercial claims.",
  );
  const gaps = detectApprovedStillGaps(input.catalog, brand_id, brief);
  return HiggsfieldGenerateJobListSchema.parse({
    brand_id,
    source: adapter.mode,
    jobs: input.jobs.list(brand_id),
    gaps,
    approved_stills: listApprovedStillsForGaps(input.catalog, brand_id),
    brand_kit: listBrandKitAssets(input.catalog, brand_id),
    live_publish: false,
    live_ads: false,
    message: gaps.has_gap
      ? `Higgsfield fill-gaps for ${brand_id} (${adapter.mode}): ${gaps.reason}`
      : `Higgsfield fill-gaps for ${brand_id} (${adapter.mode}): coverage sufficient. No generate.`,
  });
}

export async function fillHiggsfieldGaps(input: {
  brand_id: string;
  source_asset_ids?: string[];
  layout_brief?: unknown;
  campaign_id?: string;
  catalog: AssetCatalog;
  jobs: HiggsfieldGenerateJobStore;
  adapter?: HiggsfieldAdapter;
  store?: OpsStore;
  brandsRoot?: string;
  now?: string;
}): Promise<HiggsfieldGenerateJob> {
  assertWaveEnabled("WAVE_4B_ASSET_PIPELINE", brandsRootOpt(input.brandsRoot));
  const brand_id = assertRegisteredBrandId(
    input.brand_id,
    brandsRootOpt(input.brandsRoot),
  );
  const adapter = input.adapter ?? createHiggsfieldAdapter();
  const now = input.now ?? new Date().toISOString();
  const campaign =
    input.store && input.campaign_id
      ? input.store.getCampaign(brand_id, input.campaign_id)
      : null;
  if (input.campaign_id && input.store && !campaign) {
    throw new HiggsfieldGenerateInputError("campaign not found for this brand");
  }
  const brief = resolveHiggsfieldBrief(
    input.layout_brief,
    campaign
      ? {
          campaign_id: campaign.campaign_id,
          pack_id: campaign.pack_id,
          objective: campaign.objective,
        }
      : null,
  );
  const gap = detectApprovedStillGaps(input.catalog, brand_id, brief);
  const brand_kit = listBrandKitAssets(input.catalog, brand_id);
  const source_assets = collectOptionalSourceAssets(
    input.catalog,
    brand_id,
    input.source_asset_ids ?? [],
  );
  const job_id = randomUUID();
  const audit: AuditSink = input.store
    ? new OpsAuditSink(input.store, brand_id)
    : new InMemoryAuditSink();

  if (!gap.has_gap) {
    const job = HiggsfieldGenerateJobSchema.parse({
      job_id,
      brand_id,
      gap,
      layout_brief: brief,
      source_asset_ids: source_assets.map((a) => a.asset_id),
      brand_kit_asset_ids: brand_kit.map((a) => a.asset_id),
      status: "SKIPPED_NO_GAP",
      source: adapter.mode,
      guardian: {
        passed: true,
        reasons: [],
        reviewed: ["higgsfield-gap-detector"],
      },
      knowledge_status: "UNVERIFIED",
      provenance: "GENERATED",
      approval_status: "DRAFT",
      live_publish: false,
      live_ads: false,
      created_at: now,
      updated_at: now,
      message: `No Higgsfield generate for ${brand_id}. ${gap.reason}`,
    });
    input.jobs.put(brand_id, job);
    if (input.store) {
      input.store.appendAudit(brand_id, {
        brand_id,
        event_type: "HIGGSFIELD_GENERATE_SKIPPED",
        message: job.message,
        approval_level: "LEVEL_1",
        metadata: {
          job_id,
          gap_reason: gap.reason,
          live_publish: false,
          live_ads: false,
        },
      });
    }
    return job;
  }

  const primary = gap.needs[0]!;
  const prompt = buildHiggsfieldPrompt({
    brand_id,
    brief,
    gap: primary,
    ...brandsRootOpt(input.brandsRoot),
  });
  const generated_asset_id = higgsfieldGeneratedAssetId(brand_id, job_id);
  const kitReasons = brandKitChecks(brand_id, brand_kit);

  if (input.store) {
    input.store.appendAudit(brand_id, {
      brand_id,
      event_type: "HIGGSFIELD_GENERATE_REQUESTED",
      message: `Higgsfield fill-gaps requested: ${primary.reason}`,
      approval_level: "LEVEL_1",
      metadata: {
        job_id,
        usage_tag: primary.usage_tag ?? null,
        aspect: primary.aspect ?? null,
        campaign_id: brief.campaign_id ?? null,
        live_publish: false,
        live_ads: false,
      },
    });
  }

  const output = await adapter.generate({
    brand_id,
    job_id,
    prompt,
    layout_brief: brief,
    gap: primary,
    source_asset_ids: source_assets.map((a) => a.asset_id),
  });

  const { profile } = loadBrandContext(
    brand_id,
    audit,
    brandsRootOpt(input.brandsRoot),
  );
  const subject = generateAgentResult(
    brand_id,
    job_id,
    brief,
    prompt,
    primary,
    now,
  );
  const verdict = runBrandGuardian(subject, profile, audit);
  const reasons = [...kitReasons, ...verdict.reasons];
  const passed = kitReasons.length === 0 && verdict.passed;
  const status = passed ? "READY_FOR_OWNER_REVIEW" : "GUARDIAN_REJECTED";

  writeGeneratedAsset({
    catalog: input.catalog,
    brand_id,
    job_id,
    generated_asset_id,
    brief,
    prompt,
    gap: primary,
    source_assets,
    brand_kit,
    output,
    source_mode: adapter.mode,
    now,
  });

  for (const still of source_assets) {
    input.catalog.recordUsage(brand_id, {
      usage_id: randomUUID(),
      brand_id,
      asset_id: still.asset_id,
      used_at: now,
      channel: "higgsfield-generate",
      ...(brief.campaign_id ? { campaign_id: brief.campaign_id } : {}),
      note: `Reference for Higgsfield job ${job_id}`,
    });
  }

  const job = HiggsfieldGenerateJobSchema.parse({
    job_id,
    brand_id,
    gap,
    layout_brief: brief,
    prompt,
    source_asset_ids: source_assets.map((a) => a.asset_id),
    brand_kit_asset_ids: brand_kit.map((a) => a.asset_id),
    status,
    source: adapter.mode,
    output,
    generated_asset_id,
    guardian: {
      passed,
      reasons,
      reviewed: ["higgsfield-generate"],
    },
    knowledge_status: "UNVERIFIED",
    provenance: "GENERATED",
    approval_status: "DRAFT",
    live_publish: false,
    live_ads: false,
    created_at: now,
    updated_at: now,
    message: passed
      ? `Generated still for ${brand_id} (${output.usage_tag} ${output.aspect}). Guardian passed. Ready for owner review — not live publish.`
      : `Generated still for ${brand_id}. Guardian/brand-kit checks failed: ${reasons.join("; ")}`,
  });
  input.jobs.put(brand_id, job);

  if (input.store) {
    input.store.appendAudit(brand_id, {
      brand_id,
      event_type: "HIGGSFIELD_GENERATE_COMPLETED",
      message: job.message,
      approval_level: "LEVEL_1",
      metadata: {
        job_id,
        generated_asset_id,
        status,
        guardian_passed: passed,
        media_id: output.media_id,
        live_publish: false,
        live_ads: false,
      },
    });
  }

  return job;
}

export function createDefaultHiggsfieldRuntime(opts?: {
  backend?: "memory" | "file";
  dir?: string;
}): { adapter: HiggsfieldAdapter; jobs: HiggsfieldGenerateJobStore } {
  return {
    adapter: createHiggsfieldAdapter(),
    jobs: createHiggsfieldGenerateJobStore(opts),
  };
}
