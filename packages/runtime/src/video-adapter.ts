import {
  VideoExportPackageSchema,
  type BrandId,
  type VideoBrief,
  type VideoCaption,
  type VideoExportPackage,
  type VideoPackageAssetRef,
  type VideoProducerSourceMode,
  type VideoTargetFormat,
  type VideoTimelineClip,
} from "@marketing-os/contracts";
import {
  fixtureVideoAdapterLabel,
  fixtureVideoRecipeId,
  videoImportHint,
} from "./fixtures/video-produce.js";

export const VIDEO_FORMAT_ASPECT = {
  reel: "9:16",
  story: "9:16",
  feed: "1:1",
} as const satisfies Record<VideoTargetFormat, "9:16" | "1:1">;

export const VIDEO_FORMAT_DURATION_MS = {
  reel: 15_000,
  story: 15_000,
  feed: 15_000,
} as const satisfies Record<VideoTargetFormat, number>;

export type VideoProduceAdapterInput = {
  brand_id: BrandId;
  job_id: string;
  brief: VideoBrief;
  clips: VideoTimelineClip[];
  captions: VideoCaption[];
  asset_list: VideoPackageAssetRef[];
};

/**
 * Assembles an export package / project recipe from approved stills.
 * Fixture mode is deterministic. CapCut / Adobe Premiere are labeled stubs
 * that emit the same package — they do not drive desktop software.
 */
export interface VideoProducerAdapter {
  readonly mode: VideoProducerSourceMode;
  produce(input: VideoProduceAdapterInput): Promise<VideoExportPackage>;
}

function buildPackage(
  mode: VideoProducerSourceMode,
  input: VideoProduceAdapterInput,
): VideoExportPackage {
  const duration_ms = input.clips.reduce((sum, clip) => sum + clip.duration_ms, 0);
  return VideoExportPackageSchema.parse({
    package_kind: "export_package",
    recipe_id: fixtureVideoRecipeId(
      input.brand_id,
      input.job_id,
      input.brief.target_format,
    ),
    storage_uri: `mos://video/${input.brand_id}/${input.job_id}`,
    target_format: input.brief.target_format,
    aspect: VIDEO_FORMAT_ASPECT[input.brief.target_format],
    duration_ms,
    timeline: input.clips,
    captions: input.captions,
    asset_list: input.asset_list,
    import_hint: videoImportHint(mode),
    adapter_label: fixtureVideoAdapterLabel(input.brand_id, mode),
    rendered_video: false,
    desktop_control: false,
    published: false,
  });
}

export class FixtureVideoProducerAdapter implements VideoProducerAdapter {
  readonly mode = "fixture" as const;

  async produce(input: VideoProduceAdapterInput): Promise<VideoExportPackage> {
    return buildPackage(this.mode, input);
  }
}

/**
 * Optional CapCut-labeled stub. Emits an export package only.
 * Does not require CapCut installed. Does not claim desktop control.
 */
export class CapCutVideoProducerStub implements VideoProducerAdapter {
  readonly mode = "capcut" as const;

  async produce(input: VideoProduceAdapterInput): Promise<VideoExportPackage> {
    return buildPackage(this.mode, input);
  }
}

/**
 * Optional Adobe Premiere-labeled stub. Emits an export package only.
 * Does not require Premiere installed. Does not claim desktop control.
 */
export class AdobePremiereVideoProducerStub implements VideoProducerAdapter {
  readonly mode = "adobe_premiere" as const;

  async produce(input: VideoProduceAdapterInput): Promise<VideoExportPackage> {
    return buildPackage(this.mode, input);
  }
}

export function resolveVideoSourceMode(
  override?: VideoProducerSourceMode,
): VideoProducerSourceMode {
  if (override) return override;
  const env = process.env.MOS_VIDEO_SOURCE?.trim().toLowerCase();
  if (env === "capcut") return "capcut";
  if (env === "adobe_premiere" || env === "adobe" || env === "premiere") {
    return "adobe_premiere";
  }
  return "fixture";
}

export function createVideoProducerAdapter(opts?: {
  mode?: VideoProducerSourceMode;
}): VideoProducerAdapter {
  const mode = resolveVideoSourceMode(opts?.mode);
  if (mode === "capcut") return new CapCutVideoProducerStub();
  if (mode === "adobe_premiere") return new AdobePremiereVideoProducerStub();
  return new FixtureVideoProducerAdapter();
}
