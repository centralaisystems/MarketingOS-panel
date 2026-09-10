/**
 * Villa Glory first. Wave 8 digests are count-only — no inbound contact fixtures.
 * Lead PII stays in the Wave 7 process-local vault.
 */
export const WAVE8_VILLA_GLORY_BRAND = "VILLA_GLORY" as const;
export const WAVE8_DEFAULT_PERIOD = "daily" as const;
export const WAVE8_EMAIL_TEMPLATE = "AUTOMATION_DIGEST" as const;

export const WAVE8_DIGEST_SECTIONS = [
  "today",
  "campaigns",
  "approvals",
  "leads",
  "analytics",
  "costs",
] as const;
