import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  PhaseGateStateSchema,
  type AgencyWave,
  type PhaseGateState,
} from "@marketing-os/contracts";
import { resolveBrandsRoot } from "./brand-loader.js";

const DEFAULT_GATES: PhaseGateState = PhaseGateStateSchema.parse({
  updated_at: new Date().toISOString(),
  enabled_waves: [
    "WAVE_1_REGISTRY",
    "WAVE_2_CONTENT_FACTORY",
    "WAVE_3_DB_PANEL",
    "WAVE_4_ANALYTICS_ASSETS",
    "WAVE_4B_ASSET_PIPELINE",
    "WAVE_5_SOCIAL_PUBLISH",
    "WAVE_6_PAID_ADS",
    "WAVE_7_CRM",
    "WAVE_8_AUTOMATION_DASHBOARD",
  ],
  live_publish_allowed: false,
  live_ads_allowed: false,
  notes:
    "Waves 1–8 enabled: registry, draft content factory, ops panel, read-only analytics/assets + AI visibility, Drive/Figma/Higgsfield/video pipeline (fixture), Instagram dry-run social publish, Meta/Google paid staging, CRM leads + attribution (opaque pii_ref), scheduled automation digests + executive dashboard. live_publish_allowed and live_ads_allowed stay false. Live publish/ads stay OFF until explicit operator approval.",
});

function gatesPath(brandsRoot?: string): string {
  return join(
    resolveBrandsRoot(brandsRoot),
    "..",
    "reports",
    "agency",
    "PHASE_GATES.json",
  );
}

export function loadPhaseGates(opts?: {
  brandsRoot?: string;
}): PhaseGateState {
  const path = gatesPath(opts?.brandsRoot);
  if (!existsSync(path)) return DEFAULT_GATES;
  return PhaseGateStateSchema.parse(
    JSON.parse(readFileSync(path, "utf8")) as unknown,
  );
}

export function savePhaseGates(
  state: PhaseGateState,
  opts?: { brandsRoot?: string },
): void {
  const path = gatesPath(opts?.brandsRoot);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(
    path,
    JSON.stringify(PhaseGateStateSchema.parse(state), null, 2) + "\n",
  );
}

export function isWaveEnabled(
  wave: AgencyWave,
  opts?: { brandsRoot?: string },
): boolean {
  return loadPhaseGates(opts).enabled_waves.includes(wave);
}

export function assertWaveEnabled(
  wave: AgencyWave,
  opts?: { brandsRoot?: string },
): void {
  if (!isWaveEnabled(wave, opts)) {
    throw new Error(
      `Agency wave ${wave} is not enabled. Update reports/agency/PHASE_GATES.json after explicit operator approval.`,
    );
  }
}

/** Explicit operator flag. Defaults false. Never inferred from WAVE_5 alone. */
export function isLivePublishOperatorFlagOn(): boolean {
  const raw = (process.env.MOS_LIVE_PUBLISH ?? "false").trim().toLowerCase();
  return raw === "true" || raw === "1" || raw === "yes";
}

export function assertLivePublishAllowed(opts?: {
  brandsRoot?: string;
}): void {
  const g = loadPhaseGates(opts);
  if (
    !g.live_publish_allowed ||
    !g.enabled_waves.includes("WAVE_5_SOCIAL_PUBLISH") ||
    !isLivePublishOperatorFlagOn()
  ) {
    throw new Error(
      "Live social publish is blocked. Enable WAVE_5_SOCIAL_PUBLISH, live_publish_allowed, and MOS_LIVE_PUBLISH after operator approval.",
    );
  }
}

/** Explicit operator flag. Defaults false. Never inferred from WAVE_6 alone. */
export function isLiveAdsOperatorFlagOn(): boolean {
  const raw = (process.env.MOS_LIVE_ADS ?? "false").trim().toLowerCase();
  return raw === "true" || raw === "1" || raw === "yes";
}

export function assertLiveAdsAllowed(opts?: { brandsRoot?: string }): void {
  const g = loadPhaseGates(opts);
  if (
    !g.live_ads_allowed ||
    !g.enabled_waves.includes("WAVE_6_PAID_ADS") ||
    !isLiveAdsOperatorFlagOn()
  ) {
    throw new Error(
      "Live ad launch/budget is blocked. Enable WAVE_6_PAID_ADS, live_ads_allowed, and MOS_LIVE_ADS after operator approval.",
    );
  }
}
