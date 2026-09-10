import { assertWaveEnabled } from "./phase-gates.js";
import { listBrandIds } from "./brand-registry.js";

export type DigestItem = {
  brand_id: string;
  headline: string;
  severity: "INFO" | "WARN";
};

/**
 * Wave 8 — scheduled digest stub (kill switch via phase gates).
 */
export function buildDailyDigest(opts?: {
  brandsRoot?: string;
}): { generated_at: string; items: DigestItem[]; kill_switch: false } {
  assertWaveEnabled("WAVE_8_AUTOMATION_DASHBOARD", opts);
  const items: DigestItem[] = listBrandIds(opts).map((brand_id) => ({
    brand_id,
    headline: `Brand ${brand_id}: review drafts and readiness in operator panel`,
    severity: "INFO" as const,
  }));
  return {
    generated_at: new Date().toISOString(),
    items,
    kill_switch: false,
  };
}
