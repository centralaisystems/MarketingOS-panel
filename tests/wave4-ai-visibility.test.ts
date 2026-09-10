import { describe, expect, it } from "vitest";
import { AiSearchVisibilityReportSchema } from "@marketing-os/contracts";
import {
  AiSearchWriteBlockedError,
  assertNoVerifiedCommercialClaims,
  rejectAiSearchWrite,
  runAiSearchVisibilityCheck,
} from "@marketing-os/runtime";

describe("Wave 4 AI search visibility (read-only)", () => {
  it("records Villa Glory fixture probes without VERIFIED commercial claims", () => {
    const report = runAiSearchVisibilityCheck("VILLA_GLORY");
    expect(report.brand_id).toBe("VILLA_GLORY");
    expect(report.live_probe).toBe(false);
    expect(report.invented_verified_claims).toBe(false);
    expect(report.write_scopes).toEqual([]);
    expect(report.probes.length).toBeGreaterThanOrEqual(3);
    expect(report.probes.every((p) => p.brand_id === "VILLA_GLORY")).toBe(true);
    expect(report.probes.every((p) => p.source_type === "AI_INFERENCE")).toBe(true);
    expect(
      report.probes.every((p) => p.observation.kind === "OBSERVATION"),
    ).toBe(true);
    expect(
      report.probes.every((p) =>
        p.recommendations.every((r) => r.kind === "RECOMMENDATION"),
      ),
    ).toBe(true);
    expect(report.summary).not.toMatch(/VERIFIED (ROI|SKU|price)/i);
    assertNoVerifiedCommercialClaims(report);
    expect(() =>
      AiSearchVisibilityReportSchema.parse({
        ...report,
        invented_verified_claims: true,
      }),
    ).toThrow();
  });

  it("serves other brands through the same API without mixing Villa Glory probes", () => {
    const lotin = runAiSearchVisibilityCheck("LOTIN");
    expect(lotin.brand_id).toBe("LOTIN");
    expect(lotin.probes.every((p) => p.brand_id === "LOTIN")).toBe(true);
    expect(lotin.probes.some((p) => p.question.includes("Villa Glory"))).toBe(
      false,
    );
    expect(lotin.invented_verified_claims).toBe(false);
  });

  it("blocks live probe / write attempts", () => {
    expect(() => rejectAiSearchWrite("live ChatGPT probe")).toThrow(
      AiSearchWriteBlockedError,
    );
  });
});
