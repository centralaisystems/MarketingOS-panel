import { createHash } from "node:crypto";
import {
  HiggsfieldOutputPointerSchema,
  type BrandId,
  type HiggsfieldLayoutBrief,
  type HiggsfieldOutputPointer,
  type HiggsfieldPrompt,
  type HiggsfieldSourceMode,
  type StillAspect,
  type StillGapNeed,
} from "@marketing-os/contracts";
import {
  fixtureHiggsfieldMediaId,
  fixtureHiggsfieldModelForBrand,
} from "./fixtures/higgsfield-generate.js";

export class HiggsfieldCredentialsMissingError extends Error {
  constructor() {
    super(
      "MOS_HIGGSFIELD_SOURCE=higgsfield_api requires MOS_HIGGSFIELD_API_KEY. Use fixture mode for CI (`pnpm test`).",
    );
    this.name = "HiggsfieldCredentialsMissingError";
  }
}

export type HiggsfieldGenerateAdapterInput = {
  brand_id: BrandId;
  job_id: string;
  prompt: HiggsfieldPrompt;
  layout_brief: HiggsfieldLayoutBrief;
  gap: StillGapNeed;
  source_asset_ids: string[];
};

/**
 * Generates a net-new still for one coverage gap.
 * Fixture mode is deterministic. Live mode is optional and not used by tests.
 */
export interface HiggsfieldAdapter {
  readonly mode: HiggsfieldSourceMode;
  generate(input: HiggsfieldGenerateAdapterInput): Promise<HiggsfieldOutputPointer>;
}

function resolveGapUsage(gap: StillGapNeed): string {
  return gap.usage_tag?.trim() || "story";
}

function resolveGapAspect(gap: StillGapNeed): StillAspect {
  return gap.aspect ?? "9:16";
}

export function deterministicFixtureChecksum(
  brand_id: BrandId,
  job_id: string,
  usage_tag: string,
  aspect: StillAspect,
): string {
  return createHash("sha256")
    .update(`higgsfield:${brand_id}:${job_id}:${usage_tag}:${aspect}`)
    .digest("hex");
}

export class FixtureHiggsfieldAdapter implements HiggsfieldAdapter {
  readonly mode = "fixture" as const;

  async generate(input: HiggsfieldGenerateAdapterInput): Promise<HiggsfieldOutputPointer> {
    const usage_tag = resolveGapUsage(input.gap);
    const aspect = resolveGapAspect(input.gap);
    return HiggsfieldOutputPointerSchema.parse({
      media_id: fixtureHiggsfieldMediaId(
        input.brand_id,
        input.job_id,
        usage_tag,
        aspect,
      ),
      storage_uri: `mos://higgsfield/${input.brand_id}/${input.job_id}`,
      aspect,
      usage_tag,
      model: fixtureHiggsfieldModelForBrand(input.brand_id),
    });
  }
}

type HiggsfieldLiveResponse = {
  media_id?: string;
  id?: string;
  url?: string;
  preview_url?: string;
};

/**
 * Optional live Higgsfield client. Records generated pointers only.
 * It does not publish, spend, or invent commercial claims.
 * Not used by `pnpm test`.
 */
export class HiggsfieldApiAdapter implements HiggsfieldAdapter {
  readonly mode = "higgsfield_api" as const;

  constructor(
    private readonly apiKey: string,
    private readonly apiBase: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    if (!apiKey.trim()) {
      throw new HiggsfieldCredentialsMissingError();
    }
  }

  async generate(input: HiggsfieldGenerateAdapterInput): Promise<HiggsfieldOutputPointer> {
    const usage_tag = resolveGapUsage(input.gap);
    const aspect = resolveGapAspect(input.gap);
    const base = this.apiBase.replace(/\/$/, "");
    const res = await this.fetchImpl(`${base}/v1/images`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        prompt: input.prompt.text,
        aspect_ratio: aspect,
        brand_id: input.brand_id,
      }),
    });
    if (!res.ok) {
      throw new Error(
        `Higgsfield generate failed (${res.status}). Still stays unpublished; check MOS_HIGGSFIELD_API_KEY.`,
      );
    }
    const body = (await res.json()) as HiggsfieldLiveResponse;
    const media_id =
      body.media_id?.trim() ||
      body.id?.trim() ||
      fixtureHiggsfieldMediaId(input.brand_id, input.job_id, usage_tag, aspect);
    const preview = body.preview_url?.trim() || body.url?.trim();
    return HiggsfieldOutputPointerSchema.parse({
      media_id,
      storage_uri: `mos://higgsfield/${input.brand_id}/${input.job_id}`,
      ...(preview && /^https?:\/\//i.test(preview) ? { preview_url: preview } : {}),
      aspect,
      usage_tag,
      model: "higgsfield_api",
    });
  }
}

export function resolveHiggsfieldSourceMode(
  override?: HiggsfieldSourceMode,
): HiggsfieldSourceMode {
  if (override) return override;
  const env = process.env.MOS_HIGGSFIELD_SOURCE?.trim().toLowerCase();
  return env === "higgsfield_api" || env === "higgsfield" ? "higgsfield_api" : "fixture";
}

export function createHiggsfieldAdapter(opts?: {
  mode?: HiggsfieldSourceMode;
  apiKey?: string;
  apiBase?: string;
  fetchImpl?: typeof fetch;
}): HiggsfieldAdapter {
  const mode = resolveHiggsfieldSourceMode(opts?.mode);
  if (mode === "higgsfield_api") {
    const apiKey = opts?.apiKey ?? process.env.MOS_HIGGSFIELD_API_KEY ?? "";
    const apiBase =
      opts?.apiBase ??
      process.env.MOS_HIGGSFIELD_API_BASE ??
      "https://platform.higgsfield.ai";
    return new HiggsfieldApiAdapter(apiKey, apiBase, opts?.fetchImpl ?? fetch);
  }
  return new FixtureHiggsfieldAdapter();
}
