/** Resolve the ops data-plane backend. Default is file (CI / local). */

export const OPS_STORE_BACKENDS = ["memory", "file", "supabase"] as const;
export type OpsBackend = (typeof OPS_STORE_BACKENDS)[number];

const SUPABASE_ENV = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

export function resolveOpsStoreBackend(
  raw?: string | undefined,
): OpsBackend {
  const value = (raw ?? process.env.MOS_OPS_STORE ?? process.env.MOS_OPS_BACKEND ?? "file")
    .trim()
    .toLowerCase();
  if (value === "memory" || value === "file" || value === "supabase") {
    return value;
  }
  if (!value) return "file";
  throw new Error(
    `Unknown ops store backend "${value}". Use MOS_OPS_STORE=file|memory|supabase.`,
  );
}

export function supabaseOpsEnvStatus(): {
  configured: boolean;
  missing: string[];
} {
  const missing = SUPABASE_ENV.filter((name) => !process.env[name]?.trim());
  return { configured: missing.length === 0, missing: [...missing] };
}

export function supabaseOpsEnvError(): Error {
  const { missing } = supabaseOpsEnvStatus();
  return new Error(
    `MOS_OPS_STORE=supabase requires ${missing.join(" and ") || "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"}. ` +
      "Default remains file/memory so `pnpm test` does not need a live Supabase project. " +
      "See docs/agency/PRODUCTION.md.",
  );
}
