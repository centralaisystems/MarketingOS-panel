import {
  type AnalyticsMetricRow,
  type BrandId,
  type UtmParams,
} from "@marketing-os/contracts";
import { evaluateUtmContract } from "../utm-contract.js";

const PERIOD_START = "2026-09-01T00:00:00.000Z";
const PERIOD_END = "2026-09-08T00:00:00.000Z";

function row(
  brand_id: BrandId,
  provider: AnalyticsMetricRow["provider"],
  metric_key: string,
  unit: string,
  utmRaw: unknown,
): AnalyticsMetricRow {
  const utmEval = evaluateUtmContract(brand_id, utmRaw);
  return {
    brand_id,
    provider,
    metric_key,
    value: 0,
    unit,
    period_start: PERIOD_START,
    period_end: PERIOD_END,
    knowledge_status: "MISSING",
    ...(utmEval.utm ? { utm: utmEval.utm } : {}),
    utm_valid: utmEval.utm_valid,
    utm_issues: utmEval.utm_issues,
  };
}

function validUtm(brand_id: BrandId, campaign: string, extra: Partial<UtmParams> = {}): UtmParams {
  return {
    brand_id,
    utm_source: extra.utm_source ?? "google",
    utm_medium: extra.utm_medium ?? "organic_social",
    utm_campaign: campaign,
    channel: extra.channel ?? "organic_search",
  };
}

/**
 * Deterministic per-brand fixture rows. Values are 0 / MISSING — not live traffic.
 * Includes one valid UTM and one missing UTM per brand so contract health is exercisable.
 */
export function fixtureAnalyticsRows(): AnalyticsMetricRow[] {
  return [
    row(
      "VILLA_GLORY",
      "GA4",
      "sessions",
      "count",
      validUtm("VILLA_GLORY", "villa_glory_2026_enquiry_organic_search", {
        utm_source: "google",
        utm_medium: "organic_social",
        channel: "organic_search",
      }),
    ),
    row("VILLA_GLORY", "GSC", "impressions", "count", undefined),
    row(
      "VILLA_GLORY",
      "SOCIAL",
      "reach",
      "count",
      validUtm("VILLA_GLORY", "villa_glory_2026_enquiry_instagram", {
        utm_source: "instagram",
        utm_medium: "organic_social",
        channel: "organic_social",
      }),
    ),
    row("VILLA_GLORY", "ADS", "impressions", "count", undefined),
    row(
      "LOTIN",
      "GA4",
      "sessions",
      "count",
      validUtm("LOTIN", "lotin_2026_enquiry_organic_search", {
        utm_source: "google",
        channel: "organic_search",
      }),
    ),
    row("LOTIN", "GSC", "impressions", "count", undefined),
    row("LOTIN", "SOCIAL", "reach", "count", undefined),
    row("LOTIN", "ADS", "impressions", "count", undefined),
    row(
      "NOX_FORM",
      "GA4",
      "sessions",
      "count",
      validUtm("NOX_FORM", "nox_form_2026_enquiry_organic_search", {
        utm_source: "google",
        channel: "organic_search",
      }),
    ),
    row("NOX_FORM", "GSC", "impressions", "count", undefined),
    row("NOX_FORM", "SOCIAL", "reach", "count", undefined),
    row("NOX_FORM", "ADS", "impressions", "count", undefined),
    row(
      "NOX_TECH",
      "GA4",
      "sessions",
      "count",
      validUtm("NOX_TECH", "nox_tech_2026_enquiry_organic_search", {
        utm_source: "google",
        channel: "organic_search",
      }),
    ),
    row("NOX_TECH", "GSC", "impressions", "count", undefined),
    row("NOX_TECH", "SOCIAL", "reach", "count", undefined),
    row("NOX_TECH", "ADS", "impressions", "count", undefined),
  ];
}
