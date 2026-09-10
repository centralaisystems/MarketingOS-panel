import {
  AnalyticsSnapshotSchema,
  type AnalyticsMetricRow,
  type AnalyticsProvider,
  type AnalyticsProviderReport,
  type AnalyticsSnapshot,
  type BrandId,
  type EmptyWriteScopes,
} from "@marketing-os/contracts";
import { assertRegisteredBrandId, brandsRootOpt } from "./brand-registry.js";
import { assertWaveEnabled } from "./phase-gates.js";
import { fixtureAnalyticsRows } from "./fixtures/wave4-analytics.js";

export class AnalyticsWriteBlockedError extends Error {
  readonly write_scopes: EmptyWriteScopes = [];
  constructor(action: string) {
    super(
      `Analytics adapters are read-only (${action} blocked). write_scopes is empty.`,
    );
    this.name = "AnalyticsWriteBlockedError";
  }
}

export interface AnalyticsReadAdapter {
  readonly provider: AnalyticsProvider;
  readonly write_scopes: EmptyWriteScopes;
  readonly mode: "FIXTURE" | "STUB";
  readonly connected: false;
  read(brand_id: BrandId): AnalyticsProviderReport;
}

export function assertNoWriteScopes(adapter: {
  write_scopes: readonly string[];
}): void {
  if (adapter.write_scopes.length !== 0) {
    throw new AnalyticsWriteBlockedError("non-empty write_scopes");
  }
}

export function rejectAnalyticsWrite(action = "write"): never {
  throw new AnalyticsWriteBlockedError(action);
}

function reportFromRows(
  provider: AnalyticsProvider,
  brand_id: BrandId,
  rows: AnalyticsMetricRow[],
): AnalyticsProviderReport {
  const scoped = rows.filter((r) => r.brand_id === brand_id);
  return {
    provider,
    mode: "FIXTURE",
    write_scopes: [],
    connected: false,
    rows: scoped,
  };
}

export class FixtureAnalyticsAdapter implements AnalyticsReadAdapter {
  readonly write_scopes: EmptyWriteScopes = [];
  readonly mode = "FIXTURE" as const;
  readonly connected = false as const;

  constructor(readonly provider: AnalyticsProvider) {}

  read(brand_id: BrandId): AnalyticsProviderReport {
    assertNoWriteScopes(this);
    return reportFromRows(
      this.provider,
      brand_id,
      fixtureAnalyticsRows().filter((r) => r.provider === this.provider),
    );
  }
}

const PROVIDERS: AnalyticsProvider[] = ["GA4", "GSC", "SOCIAL", "ADS"];

export function createReadOnlyAnalyticsAdapters(): AnalyticsReadAdapter[] {
  return PROVIDERS.map((provider) => new FixtureAnalyticsAdapter(provider));
}

export function readAnalyticsSnapshot(
  brand_id: string,
  opts?: { brandsRoot?: string },
): AnalyticsSnapshot {
  assertWaveEnabled("WAVE_4_ANALYTICS_ASSETS", brandsRootOpt(opts?.brandsRoot));
  const id = assertRegisteredBrandId(brand_id, brandsRootOpt(opts?.brandsRoot));
  const adapters = createReadOnlyAnalyticsAdapters();
  for (const adapter of adapters) {
    assertNoWriteScopes(adapter);
  }
  const providers = adapters.map((adapter) => adapter.read(id));
  const allRows = providers.flatMap((p) => p.rows);
  const valid = allRows.filter((r) => r.utm_valid).length;
  const invalid = allRows.length - valid;
  const issues = allRows.flatMap((r) =>
    r.utm_issues.map((issue) => `${r.provider}/${r.metric_key}: ${issue}`),
  );
  return AnalyticsSnapshotSchema.parse({
    brand_id: id,
    generated_at: new Date().toISOString(),
    status: "FIXTURE",
    write_scopes: [],
    live_keys_used: false,
    providers,
    utm_health: {
      rows_with_valid_utm: valid,
      rows_missing_or_invalid_utm: invalid,
      issues,
    },
    notes: [
      "FIXTURE — not live GA4/GSC/social/ads. Values are placeholders, not observed traffic.",
      "FACT: adapters expose write_scopes=[]. ASSUMPTION: live keys are absent in CI.",
      "RECOMMENDATION: connect read-only credentials later; do not invent VERIFIED ROI or spend.",
    ],
  });
}
