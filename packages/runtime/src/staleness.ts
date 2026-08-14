import type { ProvenancedField } from "@marketing-os/contracts";
import { isStaleField } from "@marketing-os/contracts";

/**
 * Apply staleness: time-sensitive fields past review_after_days become STALE.
 * Does not invent expiry for non-time-sensitive facts.
 */
export function applyStaleness(
  field: ProvenancedField,
  now: Date = new Date(),
): ProvenancedField {
  if (field.status === "MISSING" || field.status === "CONFLICTING") {
    return field;
  }
  if (isStaleField(field, now)) {
    return {
      ...field,
      status: "STALE",
      notes: [
        field.notes,
        `Marked STALE at ${now.toISOString()} (review_after_days=${field.review_after_days}).`,
      ]
        .filter(Boolean)
        .join(" "),
    };
  }
  return field;
}

export function warnIfStalePresentedAsCurrent(field: ProvenancedField): string[] {
  const warnings: string[] = [];
  if (field.status === "STALE") {
    warnings.push(
      "STALE fact must not be presented as current without human re-verification.",
    );
  }
  if (isStaleField(field) && field.status !== "STALE") {
    warnings.push(
      "Time-sensitive fact is past review window — treat as STALE.",
    );
  }
  return warnings;
}
