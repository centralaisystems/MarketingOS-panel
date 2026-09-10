/**
 * Conservative entity name normalization for brand aliases.
 * Alias map is built from brands/_shared/REGISTRY.json.
 */

import { buildBrandAliasMap } from "./brand-registry.js";

export function normalizeBrandAlias(raw: string): string | undefined {
  const map = buildBrandAliasMap();
  const key = raw.trim().toLowerCase().replace(/\s+/g, " ");
  return map[key] ?? map[key.replace(/[\s-]/g, "")];
}

export function areLikelySameBrandName(a: string, b: string): boolean {
  const na = normalizeBrandAlias(a);
  const nb = normalizeBrandAlias(b);
  if (na && nb) return na === nb;
  const compact = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  return compact(a) === compact(b) && compact(a).length >= 4;
}
