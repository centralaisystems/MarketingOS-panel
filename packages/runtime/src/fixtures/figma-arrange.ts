import type { BrandId } from "@marketing-os/contracts";

export const VILLA_GLORY_FIGMA_FIXTURE_FILE_KEY = "fixture-villa-glory-arrange";
export const VILLA_GLORY_FIGMA_FIXTURE_FILE_NAME = "Villa-Glory-Arrange";

export type FigmaFixtureTemplate = {
  template_id: string;
  node_prefix: string;
};

export const VILLA_GLORY_FIGMA_TEMPLATES: Record<string, FigmaFixtureTemplate> = {
  "instagram-grid": {
    template_id: "villa-glory-instagram-grid",
    node_prefix: "1",
  },
  story: {
    template_id: "villa-glory-story",
    node_prefix: "2",
  },
};

export const VILLA_GLORY_DEFAULT_TEMPLATE = VILLA_GLORY_FIGMA_TEMPLATES["instagram-grid"]!;

export function fixtureFileKeyForBrand(brand_id: BrandId): string {
  if (brand_id === "VILLA_GLORY") return VILLA_GLORY_FIGMA_FIXTURE_FILE_KEY;
  return `fixture-${brand_id.toLowerCase().replace(/_/g, "-")}-arrange`;
}

export function fixtureFileNameForBrand(brand_id: BrandId): string {
  if (brand_id === "VILLA_GLORY") return VILLA_GLORY_FIGMA_FIXTURE_FILE_NAME;
  return `${brand_id}-Arrange`;
}

export function resolveFixtureTemplate(
  brand_id: BrandId,
  template_hint?: string,
): FigmaFixtureTemplate {
  const hint = (template_hint ?? "").trim().toLowerCase();
  if (brand_id === "VILLA_GLORY") {
    if (hint.includes("story")) return VILLA_GLORY_FIGMA_TEMPLATES.story!;
    if (hint.includes("grid") || hint.includes("instagram") || !hint) {
      return VILLA_GLORY_DEFAULT_TEMPLATE;
    }
    return VILLA_GLORY_DEFAULT_TEMPLATE;
  }
  return {
    template_id: `${brand_id.toLowerCase()}-generic-grid`,
    node_prefix: "1",
  };
}
