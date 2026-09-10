import type { AiSearchProbe, BrandId } from "@marketing-os/contracts";

const OBSERVED_AT = "2026-09-10T08:00:00.000Z";

function probe(
  brand_id: BrandId,
  probe_id: string,
  question: string,
  surface: AiSearchProbe["surface"],
  presence: AiSearchProbe["presence"],
  observation: string,
  recommendations: string[],
): AiSearchProbe {
  return {
    probe_id,
    brand_id,
    question,
    surface,
    observed_at: OBSERVED_AT,
    presence,
    observation: {
      text: observation,
      kind: "OBSERVATION",
      confidence: "LOW",
      evidence_ids: [],
    },
    recommendations: recommendations.map((text) => ({
      text,
      kind: "RECOMMENDATION" as const,
      confidence: "LOW" as const,
      evidence_ids: [],
    })),
    source_type: "AI_INFERENCE",
    live_probe: false,
    mode: "FIXTURE",
  };
}

const GENERIC_ABSENT =
  "Fixture probe only — no live AI-answer request was sent. Presence is ABSENT in this deterministic stub.";

const GENERIC_RECS = [
  "RECOMMENDATION: treat AI-answer mentions as UNVERIFIED until an official source is recorded in the brand pack.",
  "RECOMMENDATION: do not invent VERIFIED product, price, ROI, or SKU claims from this check.",
];

/**
 * Villa Glory gets the first Wave 4+ parked module fixtures.
 * Other registered brands share the same read-only API with a thinner default set.
 */
export function fixtureAiSearchProbes(brand_id: BrandId): AiSearchProbe[] {
  if (brand_id === "VILLA_GLORY") {
    return [
      probe(
        brand_id,
        "c1d2e3f4-a5b6-4789-8c01-11aa22bb3301",
        "What is Villa Glory?",
        "CHATGPT",
        "ABSENT",
        "OBSERVATION: fixture recorded ABSENT for this question. Official name Villa Glory is a brand-pack FACT (VERIFIED identity) but this check did not observe an AI-answer citation.",
        [
          "RECOMMENDATION: keep official-site evidence in the brand pack before expecting AI answers to cite Villa Glory.",
          "RECOMMENDATION: do not invent product specs, prices, or stock (prohibited claims are VERIFIED operating restrictions).",
        ],
      ),
      probe(
        brand_id,
        "c1d2e3f4-a5b6-4789-8c01-11aa22bb3302",
        "Villa Glory luxury furniture UAE",
        "GOOGLE_AI_OVERVIEW",
        "UNCLEAR",
        "OBSERVATION: fixture recorded UNCLEAR presence. This is not a live ranking or a VERIFIED SEO result.",
        [
          "RECOMMENDATION: confirm official website crawlability separately; do not treat this fixture as search performance.",
        ],
      ),
      probe(
        brand_id,
        "c1d2e3f4-a5b6-4789-8c01-11aa22bb3303",
        "Villa Glory sofa prices",
        "PERPLEXITY",
        "ABSENT",
        "OBSERVATION: fixture recorded ABSENT. Pricing fields in the brand pack are MISSING — any AI-quoted prices would be UNVERIFIED.",
        [
          "RECOMMENDATION: do not invent prices, stock, or materials. Leave commercial figures MISSING until operator-verified.",
        ],
      ),
    ];
  }

  return [
    probe(
      brand_id,
      "d2e3f4a5-b6c7-4890-9d12-22bb33cc4401",
      `What is ${brand_id.replaceAll("_", " ")}?`,
      "CHATGPT",
      "ABSENT",
      GENERIC_ABSENT,
      GENERIC_RECS,
    ),
    probe(
      brand_id,
      "d2e3f4a5-b6c7-4890-9d12-22bb33cc4402",
      `${brand_id.replaceAll("_", " ")} official website`,
      "PERPLEXITY",
      "UNCLEAR",
      "OBSERVATION: fixture recorded UNCLEAR. Not a live crawl and not a VERIFIED citation.",
      GENERIC_RECS,
    ),
  ];
}
