/**
 * Ad write-token boundary.
 * Research (A03) must never receive Meta/Google write credentials.
 * Tokens may exist in process.env for an optional live-labeled adapter,
 * but that adapter still refuses while live_ads_allowed is false.
 */
export const AD_WRITE_TOKEN_ENV_KEYS = [
  "META_ADS_ACCESS_TOKEN",
  "GOOGLE_ADS_DEVELOPER_TOKEN",
] as const;

export type AdWriteTokenEnvKey = (typeof AD_WRITE_TOKEN_ENV_KEYS)[number];

/** Strip ad write tokens before any research-agent context is built. */
export function sanitizeEnvForResearchAgent(
  env: NodeJS.Dict<string>,
): Record<string, string | undefined> {
  const next: Record<string, string | undefined> = { ...env };
  for (const key of AD_WRITE_TOKEN_ENV_KEYS) {
    delete next[key];
  }
  return next;
}

export function envForResearchAgent(
  env: NodeJS.Dict<string> = process.env,
): Record<string, string | undefined> {
  return sanitizeEnvForResearchAgent(env);
}

export function researchAgentReceivedAdWriteTokens(
  env: NodeJS.Dict<string>,
): AdWriteTokenEnvKey[] {
  return AD_WRITE_TOKEN_ENV_KEYS.filter((key) => {
    const value = env[key];
    return typeof value === "string" && value.trim().length > 0;
  });
}
