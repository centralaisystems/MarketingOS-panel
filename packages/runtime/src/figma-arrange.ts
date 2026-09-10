import { createHash, randomUUID } from "node:crypto";
import {
  AgentResultSchema,
  FigmaArrangeJobListSchema,
  FigmaArrangeJobSchema,
  FigmaLayoutBriefSchema,
  type AgentResult,
  type AssetRecord,
  type BrandId,
  type FigmaArrangeJob,
  type FigmaArrangeJobList,
  type FigmaLayoutBrief,
} from "@marketing-os/contracts";
import {
  assertRegisteredBrandId,
  brandsRootOpt,
} from "./brand-registry.js";
import { loadBrandContext } from "./brand-loader.js";
import { runBrandGuardian } from "./agents/brand-guardian.js";
import { assertWaveEnabled } from "./phase-gates.js";
import { InMemoryAuditSink, type AuditSink } from "./audit.js";
import { OpsAuditSink, type OpsStore } from "./ops-store.js";
import type { AssetCatalog } from "./assets.js";
import {
  createFigmaArrangeAdapter,
  type FigmaArrangeAdapter,
} from "./figma-adapter.js";
import {
  createFigmaArrangeJobStore,
  type FigmaArrangeJobStore,
} from "./figma-jobs.js";

const FIGMA_ASSET_NS = Buffer.from("b2c3d4e5f6789012bcdef12345678901", "hex");

export function figmaGeneratedAssetId(brand_id: BrandId, job_id: string): string {
  const name = Buffer.from(`figma:${brand_id}:${job_id}`, "utf8");
  const hash = createHash("sha1").update(FIGMA_ASSET_NS).update(name).digest();
  hash[6] = (hash[6]! & 0x0f) | 0x50;
  hash[8] = (hash[8]! & 0x3f) | 0x80;
  const h = hash.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

export class FigmaArrangeInputError extends Error {
  readonly status = 400;
  constructor(message: string) {
    super(message);
    this.name = "FigmaArrangeInputError";
  }
}

export function listApprovedStillsForArrange(
  catalog: AssetCatalog,
  brand_id: BrandId,
): AssetRecord[] {
  return catalog.listMetadata(brand_id).filter((asset) => {
    if (asset.source === "figma" || asset.folder_role === "generated") return false;
    if (asset.kind !== "IMAGE") return false;
    if (asset.approval_status !== "APPROVED") return false;
    return asset.folder_role === "approved-stills" || asset.folder_role === undefined;
  });
}

export function listBrandKitAssets(
  catalog: AssetCatalog,
  brand_id: BrandId,
): AssetRecord[] {
  return catalog.listMetadata(brand_id, { folder_role: "brand-kit" });
}

function hintFromText(text: string): string | undefined {
  const lower = text.toLowerCase();
  if (lower.includes("story")) return "story";
  if (lower.includes("grid") || lower.includes("instagram")) return "instagram-grid";
  return undefined;
}

function resolveLayoutBrief(
  raw: unknown,
  campaign?: { campaign_id: string; pack_id: string; objective: string } | null,
): FigmaLayoutBrief {
  if (typeof raw === "string" && raw.trim()) {
    const description = raw.trim();
    const hint = hintFromText(description);
    return FigmaLayoutBriefSchema.parse({
      title: campaign ? `Arrange: ${campaign.objective}` : "Arrange approved stills",
      description,
      ...(hint ? { template_hint: hint } : {}),
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
            : "Place approved stills on the brand-kit layout. No commercial claims.";
    const hint =
      typeof rec.template_hint === "string" && rec.template_hint.trim()
        ? rec.template_hint.trim()
        : hintFromText(`${typeof rec.title === "string" ? rec.title : ""} ${description}`);
    return FigmaLayoutBriefSchema.parse({
      title:
        typeof rec.title === "string" && rec.title.trim()
          ? rec.title.trim()
          : campaign
            ? `Arrange: ${campaign.objective}`
            : "Arrange approved stills",
      description,
      ...(hint ? { template_hint: hint } : {}),
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
  return FigmaLayoutBriefSchema.parse({
    title: campaign ? `Arrange: ${campaign.objective}` : "Arrange approved stills",
    description: campaign
      ? campaign.objective
      : "Place approved stills on the brand-kit layout. No commercial claims.",
    ...(campaign
      ? { campaign_id: campaign.campaign_id, pack_id: campaign.pack_id }
      : {}),
  });
}

function collectSourceAssets(
  catalog: AssetCatalog,
  brand_id: BrandId,
  source_asset_ids: string[],
): AssetRecord[] {
  if (!source_asset_ids.length) {
    throw new FigmaArrangeInputError(
      "source_asset_ids required — select approved stills for this brand only.",
    );
  }
  const unique = [...new Set(source_asset_ids)];
  const assets: AssetRecord[] = [];
  for (const asset_id of unique) {
    const row = catalog.getMetadata(brand_id, asset_id);
    if (!row) {
      throw new FigmaArrangeInputError(
        `Source asset not found for ${brand_id}`,
      );
    }
    if (row.kind !== "IMAGE" || row.approval_status !== "APPROVED") {
      throw new FigmaArrangeInputError(
        "Figma arrange accepts approved image stills only.",
      );
    }
    if (row.folder_role && row.folder_role !== "approved-stills") {
      throw new FigmaArrangeInputError(
        "Figma arrange accepts approved-stills (or catalog approved images) only.",
      );
    }
    assets.push(row);
  }
  return assets;
}

function brandKitChecks(
  brand_id: BrandId,
  brandKit: AssetRecord[],
): string[] {
  if (brandKit.length === 0) {
    return [
      `brand-kit metadata MISSING for ${brand_id} — sync the Drive folder before marking arrange ready for owner review.`,
    ];
  }
  return [];
}

function arrangeAgentResult(
  brand_id: BrandId,
  job_id: string,
  brief: FigmaLayoutBrief,
  source_assets: AssetRecord[],
  now: string,
): AgentResult {
  return AgentResultSchema.parse({
    task_id: job_id,
    brand_id,
    agent: "A07_CREATIVE_DIRECTOR",
    summary: `Figma arrange draft: ${brief.title}. ${source_assets.length} approved still(s). Layout only — no commercial claims.`,
    deliverables: [
      {
        type: "figma_arrange",
        headline: brief.title,
        body: brief.description,
      },
    ],
    statements: [
      {
        text: "Generated Figma layout is UNVERIFIED metadata, not a VERIFIED commercial claim.",
        kind: "OBSERVATION",
        confidence: "HIGH",
        evidence_ids: [],
      },
    ],
    assumptions: [
      "Selected stills are operator-approved folder-contract or catalog stills, not VERIFIED product claims.",
    ],
    confidence: "LOW",
    recommended_next_action:
      "Send arranged materials for owner review after Guardian pass. Keep internal only.",
    recommended_approval_level: "LEVEL_1",
    missing_information: [],
    capabilities_used: ["PRODUCE_CREATIVE_BRIEF"],
    created_at: now,
  });
}

function writeGeneratedAsset(input: {
  catalog: AssetCatalog;
  brand_id: BrandId;
  job_id: string;
  generated_asset_id: string;
  brief: FigmaLayoutBrief;
  source_assets: AssetRecord[];
  brand_kit: AssetRecord[];
  output: FigmaArrangeJob["output"];
  source_mode: FigmaArrangeJob["source"];
  now: string;
}): AssetRecord {
  const record: AssetRecord = {
    asset_id: input.generated_asset_id,
    brand_id: input.brand_id,
    title: input.brief.title,
    kind: "OTHER",
    mime_type: "application/vnd.figma.document",
    storage_uri: `mos://figma/${input.brand_id}/${input.job_id}`,
    in_git: false,
    usage_tags: ["generated", "figma-arrange"],
    platform_suitability: [],
    approval_status: "DRAFT",
    knowledge_status: "UNVERIFIED",
    provenance: "GENERATED",
    source: "figma",
    folder_role: "generated",
    metadata: {
      provenance: "GENERATED",
      arrange_job_id: input.job_id,
      source_asset_ids: input.source_assets.map((a) => a.asset_id),
      brand_kit_asset_ids: input.brand_kit.map((a) => a.asset_id),
      figma_file_key: input.output.file_key,
      figma_file_url: input.output.file_url,
      figma_node_id: input.output.node_id,
      figma_node_url: input.output.node_url,
      template_id: input.output.template_id,
      source_mode: input.source_mode,
      knowledge_note:
        "GENERATED Figma layout is UNVERIFIED metadata — not a VERIFIED commercial claim.",
    },
    created_at: input.now,
    updated_at: input.now,
  };
  return input.catalog.putMetadata(input.brand_id, record);
}

export function arrangedMaterialsForCampaign(
  jobs: FigmaArrangeJobStore | undefined,
  brand_id: BrandId,
  campaign_id: string,
): { arranged_asset_ids: string[]; figma_job_ids: string[] } {
  if (!jobs) return { arranged_asset_ids: [], figma_job_ids: [] };
  const matched = jobs
    .list(brand_id)
    .filter((job) => job.layout_brief.campaign_id === campaign_id);
  return {
    figma_job_ids: matched.map((job) => job.job_id),
    arranged_asset_ids: matched.map((job) => job.generated_asset_id),
  };
}

export function listFigmaArrangeJobs(input: {
  brand_id: string;
  catalog: AssetCatalog;
  jobs: FigmaArrangeJobStore;
  adapter?: FigmaArrangeAdapter;
  brandsRoot?: string;
}): FigmaArrangeJobList {
  assertWaveEnabled("WAVE_4B_ASSET_PIPELINE", brandsRootOpt(input.brandsRoot));
  const brand_id = assertRegisteredBrandId(
    input.brand_id,
    brandsRootOpt(input.brandsRoot),
  );
  const adapter = input.adapter ?? createFigmaArrangeAdapter();
  return FigmaArrangeJobListSchema.parse({
    brand_id,
    source: adapter.mode,
    jobs: input.jobs.list(brand_id),
    approved_stills: listApprovedStillsForArrange(input.catalog, brand_id),
    brand_kit: listBrandKitAssets(input.catalog, brand_id),
    live_publish: false,
    live_ads: false,
    message: `Figma arrange jobs for ${brand_id} (${adapter.mode}). Generated rows stay UNVERIFIED until approved.`,
  });
}

export async function arrangeInFigma(input: {
  brand_id: string;
  source_asset_ids: string[];
  layout_brief?: unknown;
  campaign_id?: string;
  catalog: AssetCatalog;
  jobs: FigmaArrangeJobStore;
  adapter?: FigmaArrangeAdapter;
  store?: OpsStore;
  brandsRoot?: string;
  now?: string;
}): Promise<FigmaArrangeJob> {
  assertWaveEnabled("WAVE_4B_ASSET_PIPELINE", brandsRootOpt(input.brandsRoot));
  const brand_id = assertRegisteredBrandId(
    input.brand_id,
    brandsRootOpt(input.brandsRoot),
  );
  const adapter = input.adapter ?? createFigmaArrangeAdapter();
  const now = input.now ?? new Date().toISOString();
  const campaign =
    input.store && input.campaign_id
      ? input.store.getCampaign(brand_id, input.campaign_id)
      : null;
  if (input.campaign_id && input.store && !campaign) {
    throw new FigmaArrangeInputError("campaign not found for this brand");
  }
  const brief = resolveLayoutBrief(
    input.layout_brief,
    campaign
      ? {
          campaign_id: campaign.campaign_id,
          pack_id: campaign.pack_id,
          objective: campaign.objective,
        }
      : null,
  );
  const source_assets = collectSourceAssets(
    input.catalog,
    brand_id,
    input.source_asset_ids,
  );
  const brand_kit = listBrandKitAssets(input.catalog, brand_id);
  const kitReasons = brandKitChecks(brand_id, brand_kit);

  const job_id = randomUUID();
  const generated_asset_id = figmaGeneratedAssetId(brand_id, job_id);
  const audit: AuditSink = input.store
    ? new OpsAuditSink(input.store, brand_id)
    : new InMemoryAuditSink();

  if (input.store) {
    input.store.appendAudit(brand_id, {
      brand_id,
      event_type: "FIGMA_ARRANGE_REQUESTED",
      message: `Figma arrange requested for ${source_assets.length} still(s)`,
      approval_level: "LEVEL_1",
      metadata: {
        job_id,
        source_asset_ids: source_assets.map((a) => a.asset_id),
        campaign_id: brief.campaign_id ?? null,
        live_publish: false,
        live_ads: false,
      },
    });
  }

  const output = await adapter.arrange({
    brand_id,
    job_id,
    source_assets,
    brand_kit,
    layout_brief: brief,
  });

  const { profile } = loadBrandContext(
    brand_id,
    audit,
    brandsRootOpt(input.brandsRoot),
  );
  const subject = arrangeAgentResult(brand_id, job_id, brief, source_assets, now);
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
      channel: "figma-arrange",
      ...(brief.campaign_id ? { campaign_id: brief.campaign_id } : {}),
      note: `Arranged in Figma job ${job_id}`,
    });
  }

  const job = FigmaArrangeJobSchema.parse({
    job_id,
    brand_id,
    source_asset_ids: source_assets.map((a) => a.asset_id),
    brand_kit_asset_ids: brand_kit.map((a) => a.asset_id),
    layout_brief: brief,
    status,
    source: adapter.mode,
    output,
    generated_asset_id,
    guardian: {
      passed,
      reasons,
      reviewed: ["figma-arrange"],
    },
    knowledge_status: "UNVERIFIED",
    provenance: "GENERATED",
    approval_status: "DRAFT",
    live_publish: false,
    live_ads: false,
    created_at: now,
    updated_at: now,
    message: passed
      ? `Arranged ${source_assets.length} still(s) for ${brand_id}. Guardian passed. Ready for owner review — not live publish.`
      : `Arranged ${source_assets.length} still(s) for ${brand_id}. Guardian/brand-kit checks failed: ${reasons.join("; ")}`,
  });
  input.jobs.put(brand_id, job);

  if (input.store) {
    input.store.appendAudit(brand_id, {
      brand_id,
      event_type: "FIGMA_ARRANGE_COMPLETED",
      message: job.message,
      approval_level: "LEVEL_1",
      metadata: {
        job_id,
        generated_asset_id,
        status,
        guardian_passed: passed,
        figma_file_url: output.file_url,
        figma_node_url: output.node_url,
        live_publish: false,
        live_ads: false,
      },
    });
  }

  return job;
}

export function createDefaultFigmaRuntime(opts?: {
  backend?: "memory" | "file";
  dir?: string;
}): { adapter: FigmaArrangeAdapter; jobs: FigmaArrangeJobStore } {
  return {
    adapter: createFigmaArrangeAdapter(),
    jobs: createFigmaArrangeJobStore(opts),
  };
}
