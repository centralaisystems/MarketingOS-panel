import type { ProvenancedField, SourceType } from "@marketing-os/contracts";
import { SOURCE_TYPE_AUTHORITY } from "@marketing-os/contracts";

export type ConflictInput = {
  path: string;
  existing: ProvenancedField;
  incoming: {
    value: unknown;
    source_type: SourceType;
    source_reference: string;
    observed_at?: string;
  };
};

export type ConflictResult =
  | { status: "SAME"; field: ProvenancedField }
  | { status: "CONFLICTING"; field: ProvenancedField; note: string };

function stableStringify(v: unknown): string {
  return JSON.stringify(v);
}

/**
 * Do NOT silently overwrite when values differ.
 * Mark CONFLICTING and surface for human resolution.
 * Authority ranking is advisory only.
 */
export function detectAndRecordConflict(input: ConflictInput): ConflictResult {
  const { existing, incoming, path } = input;

  if (existing.status === "MISSING" || existing.value === undefined) {
    return {
      status: "SAME",
      field: {
        ...existing,
        status: "UNVERIFIED",
        value: incoming.value,
        source_type: incoming.source_type,
        source_reference: incoming.source_reference,
        observed_at: incoming.observed_at ?? new Date().toISOString(),
        time_sensitive: existing.time_sensitive ?? false,
      },
    };
  }

  if (stableStringify(existing.value) === stableStringify(incoming.value)) {
    return { status: "SAME", field: existing };
  }

  const existingSource = existing.source_type ?? "PUBLIC_SOURCE";
  const note = `Conflict at ${path}: existing (${existingSource}/${existing.source_reference ?? "unknown"}) vs incoming (${incoming.source_type}/${incoming.source_reference}). Authority hint: existing=${SOURCE_TYPE_AUTHORITY[existingSource]}, incoming=${SOURCE_TYPE_AUTHORITY[incoming.source_type]}. Human resolution required.`;

  const field: ProvenancedField = {
    status: "CONFLICTING",
    value: existing.value,
    notes: note,
    source_type: existing.source_type,
    source_reference: existing.source_reference,
    observed_at: existing.observed_at,
    verified_at: existing.verified_at,
    confidence: existing.confidence,
    time_sensitive: existing.time_sensitive ?? false,
    review_after_days: existing.review_after_days,
    conflict_values: [
      {
        value: existing.value,
        source_type: existingSource,
        source_reference: existing.source_reference ?? "existing",
        observed_at: existing.observed_at,
      },
      {
        value: incoming.value,
        source_type: incoming.source_type,
        source_reference: incoming.source_reference,
        observed_at: incoming.observed_at,
      },
    ],
  };

  return { status: "CONFLICTING", field, note };
}
