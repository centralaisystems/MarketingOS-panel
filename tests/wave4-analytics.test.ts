import { describe, expect, it } from "vitest";
import {
  AnalyticsWriteBlockedError,
  assertNoWriteScopes,
  createReadOnlyAnalyticsAdapters,
  evaluateUtmContract,
  readAnalyticsSnapshot,
  rejectAnalyticsWrite,
} from "@marketing-os/runtime";

describe("Wave 4 read-only analytics", () => {
  it("returns a brand-scoped fixture snapshot with empty write scopes", () => {
    const snap = readAnalyticsSnapshot("VILLA_GLORY");
    expect(snap.brand_id).toBe("VILLA_GLORY");
    expect(snap.write_scopes).toEqual([]);
    expect(snap.live_keys_used).toBe(false);
    expect(snap.status).toBe("FIXTURE");
    expect(snap.providers.map((p) => p.provider)).toEqual([
      "GA4",
      "GSC",
      "SOCIAL",
      "ADS",
    ]);
    expect(snap.providers.every((p) => p.write_scopes.length === 0)).toBe(true);
    expect(snap.providers.every((p) => p.connected === false)).toBe(true);
    expect(snap.providers.every((p) => p.rows.every((r) => r.brand_id === "VILLA_GLORY"))).toBe(
      true,
    );
    expect(snap.providers.flatMap((p) => p.rows).every((r) => r.knowledge_status !== "VERIFIED")).toBe(
      true,
    );
    expect(snap.utm_health.rows_with_valid_utm).toBeGreaterThan(0);
    expect(snap.utm_health.rows_missing_or_invalid_utm).toBeGreaterThan(0);
  });

  it("does not mix LOTIN metrics into a Villa Glory snapshot", () => {
    const villa = readAnalyticsSnapshot("VILLA_GLORY");
    const lotin = readAnalyticsSnapshot("LOTIN");
    expect(lotin.brand_id).toBe("LOTIN");
    expect(
      villa.providers.flatMap((p) => p.rows).some((r) => r.brand_id === "LOTIN"),
    ).toBe(false);
    expect(
      lotin.providers.flatMap((p) => p.rows).some((r) => r.brand_id === "VILLA_GLORY"),
    ).toBe(false);
  });

  it("asserts adapters have no write scopes and blocks mutations", () => {
    const adapters = createReadOnlyAnalyticsAdapters();
    for (const adapter of adapters) {
      assertNoWriteScopes(adapter);
      expect(adapter.write_scopes).toEqual([]);
    }
    expect(() => rejectAnalyticsWrite("insert_event")).toThrow(
      AnalyticsWriteBlockedError,
    );
    expect(() =>
      assertNoWriteScopes({ write_scopes: ["analytics.edit"] }),
    ).toThrow(/write_scopes/);
  });

  it("flags UTM rows that belong to another brand", () => {
    const result = evaluateUtmContract("VILLA_GLORY", {
      brand_id: "LOTIN",
      utm_source: "meta",
      utm_medium: "paid_social",
      utm_campaign: "lotin_2026_enquiry_meta",
      channel: "meta",
    });
    expect(result.utm_valid).toBe(false);
    expect(result.utm_issues.join(" ")).toMatch(/does not match/);
  });
});
