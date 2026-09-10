import type { BrandId, StillAspect } from "@marketing-os/contracts";

export const VILLA_GLORY_HIGGSFIELD_FIXTURE_MODEL = "fixture-still";

export function fixtureHiggsfieldModelForBrand(brand_id: BrandId): string {
  if (brand_id === "VILLA_GLORY") return VILLA_GLORY_HIGGSFIELD_FIXTURE_MODEL;
  return `fixture-still-${brand_id.toLowerCase().replace(/_/g, "-")}`;
}

export function fixtureHiggsfieldMediaId(
  brand_id: BrandId,
  job_id: string,
  usage_tag: string,
  aspect: StillAspect,
): string {
  return `fixture-${brand_id.toLowerCase()}-${usage_tag}-${aspect.replace(":", "x")}-${job_id.slice(0, 8)}`;
}
