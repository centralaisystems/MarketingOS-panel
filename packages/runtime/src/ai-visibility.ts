import {
  AiSearchVisibilityReportSchema,
  type AiSearchVisibilityReport,
  type BrandId,
} from "@marketing-os/contracts";
import { assertRegisteredBrandId, brandsRootOpt } from "./brand-registry.js";
import { assertWaveEnabled } from "./phase-gates.js";
import { fixtureAiSearchProbes } from "./fixtures/wave4-ai-visibility.js";

export class AiSearchWriteBlockedError extends Error {
  readonly write_scopes = [] as const;
  constructor(action = "live probe / write") {
    super(
      `AI search visibility is read-only (${action} blocked). No live probes or verified commercial claims.`,
    );
    this.name = "AiSearchWriteBlockedError";
  }
}

export function rejectAiSearchWrite(action = "live probe / write"): never {
  throw new AiSearchWriteBlockedError(action);
}

export function runAiSearchVisibilityCheck(
  brand_id: string,
  opts?: { brandsRoot?: string },
): AiSearchVisibilityReport {
  assertWaveEnabled("WAVE_4_ANALYTICS_ASSETS", brandsRootOpt(opts?.brandsRoot));
  const id = assertRegisteredBrandId(brand_id, brandsRootOpt(opts?.brandsRoot));
  const probes = fixtureAiSearchProbes(id);
  const present = probes.filter((p) => p.presence === "PRESENT").length;
  const absent = probes.filter((p) => p.presence === "ABSENT").length;
  const unclear = probes.filter((p) => p.presence === "UNCLEAR").length;
  return AiSearchVisibilityReportSchema.parse({
    brand_id: id,
    generated_at: new Date().toISOString(),
    mode: "FIXTURE",
    write_scopes: [],
    live_probe: false,
    invented_verified_claims: false,
    probes,
    summary:
      `Read-only fixture check for ${id}: ${present} PRESENT, ${absent} ABSENT, ${unclear} UNCLEAR. ` +
      "Observations are AI_INFERENCE fixtures — not VERIFIED commercial claims. No live AI-answer probe was sent.",
  });
}

export function assertNoVerifiedCommercialClaims(
  report: AiSearchVisibilityReport,
): void {
  if (report.invented_verified_claims) {
    throw new Error("AI visibility report must not invent VERIFIED commercial claims");
  }
  for (const probe of report.probes) {
    if (probe.observation.confidence === ("VERIFIED" as string)) {
      throw new Error("Probe observation cannot be VERIFIED");
    }
    for (const rec of probe.recommendations) {
      if (rec.confidence === ("VERIFIED" as string)) {
        throw new Error("Recommendation cannot be VERIFIED");
      }
    }
    if (probe.live_probe) {
      throw new Error("Live AI-answer probes are not enabled in Wave 4");
    }
  }
}
