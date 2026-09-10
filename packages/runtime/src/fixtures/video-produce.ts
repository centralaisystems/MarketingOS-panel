import type { BrandId, VideoProducerSourceMode } from "@marketing-os/contracts";

export const VILLA_GLORY_VIDEO_FIXTURE_ADAPTER = "fixture-video-package";

export function fixtureVideoAdapterLabel(
  brand_id: BrandId,
  mode: VideoProducerSourceMode,
): string {
  if (mode === "capcut") return "capcut-stub-export-package";
  if (mode === "adobe_premiere") return "adobe-premiere-stub-export-package";
  if (brand_id === "VILLA_GLORY") return VILLA_GLORY_VIDEO_FIXTURE_ADAPTER;
  return `fixture-video-package-${brand_id.toLowerCase().replace(/_/g, "-")}`;
}

export function fixtureVideoRecipeId(
  brand_id: BrandId,
  job_id: string,
  target_format: string,
): string {
  return `fixture-${brand_id.toLowerCase()}-${target_format}-${job_id.slice(0, 8)}`;
}

export function videoImportHint(mode: VideoProducerSourceMode): string {
  if (mode === "capcut") {
    return "CapCut stub: export package / project recipe for human import or future automation. Marketing OS does not control the CapCut desktop app and did not render or upload a video.";
  }
  if (mode === "adobe_premiere") {
    return "Adobe Premiere stub: export package / project recipe for human import or future automation. Marketing OS does not control Premiere and did not render or upload a video.";
  }
  return "Fixture export package / project recipe. Not a rendered video. Not uploaded to Instagram. No CapCut or Adobe desktop control.";
}
