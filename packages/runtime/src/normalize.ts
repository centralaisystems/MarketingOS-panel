/**
 * Conservative entity name normalization for brand aliases.
 * Does not aggressively merge people/projects/companies when uncertain.
 */

const BRAND_ALIAS_MAP: Record<string, string> = {
  "nox form": "NOX_FORM",
  noxform: "NOX_FORM",
  "nox-form": "NOX_FORM",
  "nox tech": "NOX_TECH",
  noxtech: "NOX_TECH",
  "nox-tech": "NOX_TECH",
  "nox tech ai": "NOX_TECH",
  "villa glory": "VILLA_GLORY",
  villaglory: "VILLA_GLORY",
  "villa-glory": "VILLA_GLORY",
  lotin: "LOTIN",
};

export function normalizeBrandAlias(raw: string): string | undefined {
  const key = raw.trim().toLowerCase().replace(/\s+/g, " ");
  return BRAND_ALIAS_MAP[key] ?? BRAND_ALIAS_MAP[key.replace(/[\s-]/g, "")];
}

export function areLikelySameBrandName(a: string, b: string): boolean {
  const na = normalizeBrandAlias(a);
  const nb = normalizeBrandAlias(b);
  if (na && nb) return na === nb;
  const compact = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  return compact(a) === compact(b) && compact(a).length >= 4;
}
