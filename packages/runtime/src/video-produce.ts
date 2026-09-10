import { createHash, randomUUID } from "node:crypto";
import {
  AgentResultSchema,
  VideoBriefSchema,
  VideoProduceJobListSchema,
  VideoProduceJobSchema,
  VideoTargetFormatSchema,
  type AgentResult,
  type AssetRecord,
  type BrandId,
  type VideoBrief,
  type VideoCaption,
  type VideoPackageAssetRef,
  type VideoProduceJob,
  type VideoProduceJobList,
  type VideoTargetFormat,
  type VideoTimelineClip,
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
  renderCitedValue,
} from "./pack-draft-signals.js";
import { runBrandGuardian } from "./agents/brand-guardian.js";
import { assertWaveEnabled } from "./phase-gates.js";
import { InMemoryAuditSink, type AuditSink } from "./audit.js";
import { OpsAuditSink, type OpsStore } from "./ops-store.js";
import type { AssetCatalog } from "./assets.js";
import { listApprovedStillsForArrange, listBrandKitAssets } from "./figma-arrange.js";
import type { HiggsfieldGenerateJobStore } from "./higgsfield-jobs.js";
import {
  createVideoProducerAdapter,
  VIDEO_FORMAT_DURATION_MS,
  type VideoProducerAdapter,
} from "./video-adapter.js";
import {
  createVideoProduceJobStore,
  type VideoProduceJobStore,
} from "./video-jobs.js";

const VIDEO_ASSET_NS = Buffer.from("d4e5f67890123456def0123456789abc", "hex");

const FORMAT_ALIASES: Array<{ re: RegExp; format: VideoTargetFormat }> = [
  { re: /\bstory\b/, format: "story" },
  { re: /\breel\b|\b9\s*[:x]\s*16\b|\bvertical\b/, format: "reel" },
  { re: /\bfeed\b|\bsquare\b|\b1\s*[:x]\s*1\b|\binstagram(?:\s+grid)?\b/, format: "feed" },
];

export function videoPackageAssetId(brand_id: BrandId, job_id: string): string {
  const name = Buffer.from(`video:${brand_id}:${job_id}`, "utf8");
  const hash = createHash("sha1").update(VIDEO_ASSET_NS).update(name).digest();
  hash[6] = (hash[6]! & 0x0f) | 0x50;
  hash[8] = (hash[8]! & 0x3f) | 0x80;
  const h = hash.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

export class VideoProduceInputError extends Error {
  readonly status = 400;
  constructor(message: string) {
    super(message);
    this.name = "VideoProduceInputError";
  }
}

export function listApprovedStillsForVideo(
  catalog: AssetCatalog,
  brand_id: BrandId,
): AssetRecord[] {
  return listApprovedStillsForArrange(catalog, brand_id);
}

export function listGuardianReadyGeneratedStills(
  catalog: AssetCatalog,
  brand_id: BrandId,
  higgsfieldJobs?: HiggsfieldGenerateJobStore,
): AssetRecord[] {
  return catalog.listMetadata(brand_id).filter((asset) =>
    isGuardianReadyGeneratedStill(asset, brand_id, higgsfieldJobs).ok,
  );
}

function isGuardianReadyGeneratedStill(
  asset: AssetRecord,
  brand_id: BrandId,
  higgsfieldJobs?: HiggsfieldGenerateJobStore,
): { ok: boolean; reason?: string } {
  if (asset.kind !== "IMAGE") {
    return {
      ok: false,
      reason:
        "Video packages assemble IMAGE stills only — Figma layout documents are not clips.",
    };
  }
  if (asset.source !== "higgsfield" && asset.folder_role !== "generated") {
    return { ok: false, reason: "Generated still must come from the generated/ catalog." };
  }
  if (asset.source !== "higgsfield") {
    return {
      ok: false,
      reason: "Only Guardian-ready Higgsfield generated stills may be assembled.",
    };
  }
  const jobId =
    typeof asset.metadata.generate_job_id === "string"
      ? asset.metadata.generate_job_id
      : undefined;
  if (!jobId || !higgsfieldJobs) {
    return {
      ok: false,
      reason:
        "Cannot verify Guardian status for generated still — missing generate job.",
    };
  }
  const job = higgsfieldJobs.get(brand_id, jobId);
  if (!job || job.generated_asset_id !== asset.asset_id) {
    return { ok: false, reason: "Generated still is not linked to a Higgsfield job." };
  }
  if (!job.guardian.passed || job.status !== "READY_FOR_OWNER_REVIEW") {
    return {
      ok: false,
      reason: "Generated still is not Guardian-ready (rejected or incomplete).",
    };
  }
  return { ok: true };
}

function inferTargetFormat(text: string): VideoTargetFormat | undefined {
  const hay = text.toLowerCase();
  for (const { re, format } of FORMAT_ALIASES) {
    if (re.test(hay)) return format;
  }
  return undefined;
}

function packBriefText(pack: {
  video_briefs?: unknown[];
  creative_briefs?: unknown[];
  objective?: string;
} | null): string | undefined {
  const firstVideo = pack?.video_briefs?.[0];
  if (firstVideo && typeof firstVideo === "object" && firstVideo !== null) {
    const rec = firstVideo as Record<string, unknown>;
    for (const key of ["description", "body", "objective", "brief"] as const) {
      if (typeof rec[key] === "string" && rec[key].trim()) return rec[key].trim();
    }
  }
  const firstCreative = pack?.creative_briefs?.[0];
  if (firstCreative && typeof firstCreative === "object" && firstCreative !== null) {
    const rec = firstCreative as Record<string, unknown>;
    for (const key of ["objective", "visual_direction", "body"] as const) {
      if (typeof rec[key] === "string" && rec[key].trim()) return rec[key].trim();
    }
  }
  return pack?.objective?.trim() || undefined;
}

export function resolveVideoBrief(
  raw: unknown,
  campaign?: {
    campaign_id: string;
    pack_id: string;
    objective: string;
    pack?: { video_briefs?: unknown[]; creative_briefs?: unknown[]; objective?: string };
  } | null,
  explicitFormat?: unknown,
): VideoBrief {
  const parsedFormat = VideoTargetFormatSchema.safeParse(explicitFormat);
  const campaignText = campaign
    ? packBriefText(campaign.pack ?? { objective: campaign.objective }) ??
      campaign.objective
    : undefined;

  if (typeof raw === "string" && raw.trim()) {
    const description = raw.trim();
    return VideoBriefSchema.parse({
      title: campaign ? `Video package: ${campaign.objective}` : "Video package",
      description,
      target_format:
        parsedFormat.success
          ? parsedFormat.data
          : inferTargetFormat(description) ?? "reel",
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
          : campaignText ?? "Reel from approved stills. No commercial claims.";
    const fromRec = VideoTargetFormatSchema.safeParse(rec.target_format);
    return VideoBriefSchema.parse({
      title:
        typeof rec.title === "string" && rec.title.trim()
          ? rec.title.trim()
          : campaign
            ? `Video package: ${campaign.objective}`
            : "Video package",
      description,
      target_format:
        parsedFormat.success
          ? parsedFormat.data
          : fromRec.success
            ? fromRec.data
            : inferTargetFormat(`${typeof rec.title === "string" ? rec.title : ""} ${description}`) ??
              "reel",
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

  return VideoBriefSchema.parse({
    title: campaign ? `Video package: ${campaign.objective}` : "Video package",
    description:
      campaignText ?? "Reel from approved stills. No commercial claims.",
    target_format:
      parsedFormat.success
        ? parsedFormat.data
        : inferTargetFormat(campaignText ?? "") ?? "reel",
    ...(campaign
      ? { campaign_id: campaign.campaign_id, pack_id: campaign.pack_id }
      : {}),
  });
}

/**
 * On-screen captions from VERIFIED pack voice / positioning only.
 * UNVERIFIED fields are never written on screen. No invented commercial claims.
 */
export function buildVerifiedVideoCaptions(input: {
  brand_id: BrandId;
  brandsRoot?: string;
}): VideoCaption[] {
  const pack = loadBrandPack(input.brand_id, undefined, brandsRootOpt(input.brandsRoot));
  const signals = extractPackDraftSignals(pack);
  const captions: VideoCaption[] = [];
  let order = 0;

  const addIfVerified = (
    field: Parameters<typeof isVerifiedFact>[0],
    source_field: string,
  ): void => {
    if (!field || !isVerifiedFact(field)) return;
    const text = renderCitedValue(field.value).trim();
    if (!text) return;
    captions.push({
      order: order++,
      text,
      source_field,
      knowledge_status: "VERIFIED",
    });
  };

  addIfVerified(signals.tone, "voice.tone");
  addIfVerified(signals.positioning_statement, "positioning.positioning_statement");
  return captions;
}

function collectAssembleAssets(input: {
  catalog: AssetCatalog;
  brand_id: BrandId;
  source_asset_ids: string[];
  generated_asset_ids: string[];
  higgsfieldJobs?: HiggsfieldGenerateJobStore;
}): { approved: AssetRecord[]; generated: AssetRecord[] } {
  const approved: AssetRecord[] = [];
  const generated: AssetRecord[] = [];
  const seen = new Set<string>();

  const take = (asset_id: string, expectGenerated: boolean): void => {
    if (seen.has(asset_id)) return;
    const row = input.catalog.getMetadata(input.brand_id, asset_id);
    if (!row) {
      throw new VideoProduceInputError(
        `Source asset not found for ${input.brand_id}`,
      );
    }
    seen.add(asset_id);
    if (row.folder_role === "raw-inbox") {
      throw new VideoProduceInputError(
        "Video packages cannot assemble raw-inbox drops.",
      );
    }
    if (expectGenerated || row.source === "higgsfield" || row.folder_role === "generated") {
      const ready = isGuardianReadyGeneratedStill(
        row,
        input.brand_id,
        input.higgsfieldJobs,
      );
      if (!ready.ok) {
        throw new VideoProduceInputError(
          ready.reason ?? "Generated still is not Guardian-ready.",
        );
      }
      generated.push(row);
      return;
    }
    if (row.kind !== "IMAGE" || row.approval_status !== "APPROVED") {
      throw new VideoProduceInputError(
        "Video packages accept approved image stills or Guardian-ready generated stills only.",
      );
    }
    if (row.folder_role && row.folder_role !== "approved-stills") {
      throw new VideoProduceInputError(
        "Video packages accept approved-stills (or catalog approved images) only.",
      );
    }
    approved.push(row);
  };

  if (input.source_asset_ids.length || input.generated_asset_ids.length) {
    for (const id of input.source_asset_ids) take(id, false);
    for (const id of input.generated_asset_ids) take(id, true);
  } else {
    for (const row of listApprovedStillsForVideo(input.catalog, input.brand_id)) {
      approved.push(row);
    }
  }

  if (approved.length === 0 && generated.length === 0) {
    throw new VideoProduceInputError(
      "Select approved stills and/or Guardian-ready generated stills for this brand, or sync Drive approved-stills/ first.",
    );
  }
  return { approved, generated };
}

function buildTimeline(
  approved: AssetRecord[],
  generated: AssetRecord[],
  format: VideoTargetFormat,
): { clips: VideoTimelineClip[]; asset_list: VideoPackageAssetRef[] } {
  const frames: Array<{ asset: AssetRecord; role: "approved_still" | "generated_still" }> =
    [
      ...approved.map((asset) => ({ asset, role: "approved_still" as const })),
      ...generated.map((asset) => ({ asset, role: "generated_still" as const })),
    ];
  const duration_ms = Math.max(
    1,
    Math.floor(VIDEO_FORMAT_DURATION_MS[format] / frames.length),
  );
  const clips: VideoTimelineClip[] = frames.map((frame, order) => ({
    order,
    asset_id: frame.asset.asset_id,
    role: frame.role,
    duration_ms,
    storage_uri: frame.asset.storage_uri,
  }));
  const asset_list: VideoPackageAssetRef[] = frames.map((frame) => ({
    asset_id: frame.asset.asset_id,
    title: frame.asset.title,
    storage_uri: frame.asset.storage_uri,
    role: frame.role,
  }));
  return { clips, asset_list };
}

function brandKitChecks(brand_id: BrandId, brandKit: AssetRecord[]): string[] {
  if (brandKit.length === 0) {
    return [
      `brand-kit metadata MISSING for ${brand_id} — sync the Drive folder before marking the video package ready for owner review.`,
    ];
  }
  return [];
}

function produceAgentResult(
  brand_id: BrandId,
  job_id: string,
  brief: VideoBrief,
  captions: VideoCaption[],
  stillCount: number,
  now: string,
): AgentResult {
  const captionText = captions.length
    ? captions.map((c) => c.text).join(" ")
    : "No on-screen text — VERIFIED pack voice not cited.";
  return AgentResultSchema.parse({
    task_id: job_id,
    brand_id,
    agent: "A08_VIDEO_REELS",
    summary: `Video export package draft: ${brief.title}. ${stillCount} still(s). Recipe only — not rendered, not published.`,
    deliverables: [
      {
        type: "video_package",
        headline: brief.title,
        body: `${brief.description} On-screen captions (VERIFIED voice only): ${captionText}`,
      },
    ],
    statements: [
      {
        text: "Video export package is UNVERIFIED metadata, not a rendered video or a VERIFIED commercial claim.",
        kind: "OBSERVATION",
        confidence: "HIGH",
        evidence_ids: [],
      },
    ],
    assumptions: [
      "On-screen text uses VERIFIED pack voice/positioning only. UNVERIFIED fields are not shown.",
    ],
    confidence: "LOW",
    recommended_next_action:
      "Send the export package for owner review after Guardian pass. Keep internal only. Do not publish.",
    recommended_approval_level: "LEVEL_1",
    missing_information: captions.length ? [] : ["voice.tone or positioning.positioning_statement VERIFIED"],
    capabilities_used: ["PRODUCE_CREATIVE_BRIEF"],
    created_at: now,
  });
}

function writePackageAsset(input: {
  catalog: AssetCatalog;
  brand_id: BrandId;
  job_id: string;
  generated_asset_id: string;
  brief: VideoBrief;
  output: VideoProduceJob["output"];
  source_mode: VideoProduceJob["source"];
  approved: AssetRecord[];
  generated: AssetRecord[];
  now: string;
}): AssetRecord {
  const record: AssetRecord = {
    asset_id: input.generated_asset_id,
    brand_id: input.brand_id,
    title: `${input.brief.title} (${input.brief.target_format} package)`,
    kind: "DOCUMENT",
    mime_type: "application/json",
    storage_uri: input.output.storage_uri,
    in_git: false,
    usage_tags: ["generated", "video-package", input.brief.target_format],
    platform_suitability: [input.brief.target_format],
    approval_status: "DRAFT",
    knowledge_status: "UNVERIFIED",
    provenance: "GENERATED",
    source: "video",
    folder_role: "generated",
    metadata: {
      provenance: "GENERATED",
      produce_job_id: input.job_id,
      package_kind: "export_package",
      target_format: input.brief.target_format,
      aspect: input.output.aspect,
      recipe_id: input.output.recipe_id,
      adapter_label: input.output.adapter_label,
      source_mode: input.source_mode,
      rendered_video: false,
      desktop_control: false,
      published: false,
      approved_still_ids: input.approved.map((a) => a.asset_id),
      generated_still_ids: input.generated.map((a) => a.asset_id),
      caption_source_fields: input.output.captions.map((c) => c.source_field),
      knowledge_note:
        "GENERATED video export package is UNVERIFIED metadata — not a rendered video or a VERIFIED commercial claim.",
    },
    created_at: input.now,
    updated_at: input.now,
  };
  return input.catalog.putMetadata(input.brand_id, record);
}

export function videoMaterialsForCampaign(
  jobs: VideoProduceJobStore | undefined,
  brand_id: BrandId,
  campaign_id: string,
): { video_asset_ids: string[]; video_job_ids: string[] } {
  if (!jobs) return { video_asset_ids: [], video_job_ids: [] };
  const matched = jobs
    .list(brand_id)
    .filter((job) => job.brief.campaign_id === campaign_id);
  return {
    video_job_ids: matched.map((job) => job.job_id),
    video_asset_ids: matched.map((job) => job.generated_asset_id),
  };
}

export function listVideoProduceJobs(input: {
  brand_id: string;
  catalog: AssetCatalog;
  jobs: VideoProduceJobStore;
  adapter?: VideoProducerAdapter;
  higgsfieldJobs?: HiggsfieldGenerateJobStore;
  brandsRoot?: string;
}): VideoProduceJobList {
  assertWaveEnabled("WAVE_4B_ASSET_PIPELINE", brandsRootOpt(input.brandsRoot));
  const brand_id = assertRegisteredBrandId(
    input.brand_id,
    brandsRootOpt(input.brandsRoot),
  );
  const adapter = input.adapter ?? createVideoProducerAdapter();
  return VideoProduceJobListSchema.parse({
    brand_id,
    source: adapter.mode,
    jobs: input.jobs.list(brand_id),
    approved_stills: listApprovedStillsForVideo(input.catalog, brand_id),
    generated_stills: listGuardianReadyGeneratedStills(
      input.catalog,
      brand_id,
      input.higgsfieldJobs,
    ),
    live_publish: false,
    live_ads: false,
    message: `Video export packages for ${brand_id} (${adapter.mode}). Recipe only — not rendered, not published.`,
  });
}

export async function produceVideoPackage(input: {
  brand_id: string;
  source_asset_ids?: string[];
  generated_asset_ids?: string[];
  brief?: unknown;
  target_format?: unknown;
  campaign_id?: string;
  catalog: AssetCatalog;
  jobs: VideoProduceJobStore;
  adapter?: VideoProducerAdapter;
  higgsfieldJobs?: HiggsfieldGenerateJobStore;
  store?: OpsStore;
  brandsRoot?: string;
  now?: string;
}): Promise<VideoProduceJob> {
  assertWaveEnabled("WAVE_4B_ASSET_PIPELINE", brandsRootOpt(input.brandsRoot));
  const brand_id = assertRegisteredBrandId(
    input.brand_id,
    brandsRootOpt(input.brandsRoot),
  );
  const adapter = input.adapter ?? createVideoProducerAdapter();
  const now = input.now ?? new Date().toISOString();
  const campaign =
    input.store && input.campaign_id
      ? input.store.getCampaign(brand_id, input.campaign_id)
      : null;
  if (input.campaign_id && input.store && !campaign) {
    throw new VideoProduceInputError("campaign not found for this brand");
  }
  const brief = resolveVideoBrief(
    input.brief,
    campaign
      ? {
          campaign_id: campaign.campaign_id,
          pack_id: campaign.pack_id,
          objective: campaign.objective,
          pack: campaign.pack,
        }
      : null,
    input.target_format,
  );
  const { approved, generated } = collectAssembleAssets({
    catalog: input.catalog,
    brand_id,
    source_asset_ids: input.source_asset_ids ?? [],
    generated_asset_ids: input.generated_asset_ids ?? [],
    higgsfieldJobs: input.higgsfieldJobs,
  });
  const { clips, asset_list } = buildTimeline(approved, generated, brief.target_format);
  const captions = buildVerifiedVideoCaptions({
    brand_id,
    ...brandsRootOpt(input.brandsRoot),
  });
  const brand_kit = listBrandKitAssets(input.catalog, brand_id);
  const job_id = randomUUID();
  const generated_asset_id = videoPackageAssetId(brand_id, job_id);
  const kitReasons = brandKitChecks(brand_id, brand_kit);
  const audit: AuditSink = input.store
    ? new OpsAuditSink(input.store, brand_id)
    : new InMemoryAuditSink();

  if (input.store) {
    input.store.appendAudit(brand_id, {
      brand_id,
      event_type: "VIDEO_PRODUCE_REQUESTED",
      message: `Video export package requested: ${brief.target_format}`,
      approval_level: "LEVEL_1",
      metadata: {
        job_id,
        target_format: brief.target_format,
        campaign_id: brief.campaign_id ?? null,
        live_publish: false,
        live_ads: false,
      },
    });
  }

  const output = await adapter.produce({
    brand_id,
    job_id,
    brief,
    clips,
    captions,
    asset_list,
  });

  const { profile } = loadBrandContext(
    brand_id,
    audit,
    brandsRootOpt(input.brandsRoot),
  );
  const subject = produceAgentResult(
    brand_id,
    job_id,
    brief,
    captions,
    approved.length + generated.length,
    now,
  );
  const verdict = runBrandGuardian(subject, profile, audit);
  const reasons = [...kitReasons, ...verdict.reasons];
  const passed = kitReasons.length === 0 && verdict.passed;
  const status = passed ? "READY_FOR_OWNER_REVIEW" : "GUARDIAN_REJECTED";

  writePackageAsset({
    catalog: input.catalog,
    brand_id,
    job_id,
    generated_asset_id,
    brief,
    output,
    source_mode: adapter.mode,
    approved,
    generated,
    now,
  });

  for (const still of [...approved, ...generated]) {
    input.catalog.recordUsage(brand_id, {
      usage_id: randomUUID(),
      brand_id,
      asset_id: still.asset_id,
      used_at: now,
      channel: "video-produce",
      ...(brief.campaign_id ? { campaign_id: brief.campaign_id } : {}),
      note: `Source still for video package ${job_id}`,
    });
  }

  const job = VideoProduceJobSchema.parse({
    job_id,
    brand_id,
    brief,
    approved_still_ids: approved.map((a) => a.asset_id),
    generated_asset_ids: generated.map((a) => a.asset_id),
    target_format: brief.target_format,
    status,
    source: adapter.mode,
    output,
    generated_asset_id,
    guardian: {
      passed,
      reasons,
      reviewed: ["video-produce"],
    },
    knowledge_status: "UNVERIFIED",
    provenance: "GENERATED",
    approval_status: "DRAFT",
    live_publish: false,
    live_ads: false,
    created_at: now,
    updated_at: now,
    message: passed
      ? `Export package for ${brand_id} (${brief.target_format}). Guardian passed. Recipe only — not rendered, not published.`
      : `Export package for ${brand_id}. Guardian/brand-kit checks failed: ${reasons.join("; ")}`,
  });
  input.jobs.put(brand_id, job);

  if (input.store) {
    input.store.appendAudit(brand_id, {
      brand_id,
      event_type: "VIDEO_PRODUCE_COMPLETED",
      message: job.message,
      approval_level: "LEVEL_1",
      metadata: {
        job_id,
        generated_asset_id,
        status,
        guardian_passed: passed,
        recipe_id: output.recipe_id,
        rendered_video: false,
        published: false,
        live_publish: false,
        live_ads: false,
      },
    });
  }

  return job;
}

export function createDefaultVideoRuntime(opts?: {
  backend?: "memory" | "file";
  dir?: string;
}): { adapter: VideoProducerAdapter; jobs: VideoProduceJobStore } {
  return {
    adapter: createVideoProducerAdapter(),
    jobs: createVideoProduceJobStore(opts),
  };
}
