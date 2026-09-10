import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BrandIdSchema,
  BrandRegistrySchema,
  type BrandId,
  type BrandRegistry,
  type BrandRegistryEntry,
} from "@marketing-os/contracts";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Omit `brandsRoot` when unset. Required under exactOptionalPropertyTypes
 * (`{ brandsRoot: string | undefined }` is not assignable to `{ brandsRoot?: string }`).
 */
export function brandsRootOpt(
  brandsRoot?: string,
): { brandsRoot: string } | Record<string, never> {
  return brandsRoot === undefined ? {} : { brandsRoot };
}

/** Local path helper — avoid circular import with brand-loader. */
function resolveRoot(override?: string): string {
  if (override) return override;
  return join(__dirname, "../../../brands");
}

let cached: BrandRegistry | null = null;
let cachedRoot: string | null = null;

export function registryPath(brandsRoot?: string): string {
  return join(resolveRoot(brandsRoot), "_shared", "REGISTRY.json");
}

export function loadBrandRegistry(opts?: {
  brandsRoot?: string;
  forceReload?: boolean;
}): BrandRegistry {
  const root = resolveRoot(opts?.brandsRoot);
  if (!opts?.forceReload && cached && cachedRoot === root) return cached;

  const path = join(root, "_shared", "REGISTRY.json");
  if (!existsSync(path)) {
    throw new Error(`Brand registry not found: ${path}`);
  }
  const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
  const registry = BrandRegistrySchema.parse(raw);
  const ids = new Set<string>();
  const slugs = new Set<string>();
  for (const b of registry.brands) {
    if (ids.has(b.brand_id)) {
      throw new Error(`Duplicate brand_id in registry: ${b.brand_id}`);
    }
    if (slugs.has(b.slug)) {
      throw new Error(`Duplicate slug in registry: ${b.slug}`);
    }
    ids.add(b.brand_id);
    slugs.add(b.slug);
  }
  cached = registry;
  cachedRoot = root;
  return registry;
}

export function clearBrandRegistryCache(): void {
  cached = null;
  cachedRoot = null;
}

export function saveBrandRegistry(
  registry: BrandRegistry,
  opts?: { brandsRoot?: string },
): void {
  const parsed = BrandRegistrySchema.parse(registry);
  const path = registryPath(opts?.brandsRoot);
  writeFileSync(path, JSON.stringify(parsed, null, 2) + "\n");
  clearBrandRegistryCache();
}

export function listBrandEntries(opts?: {
  brandsRoot?: string;
  activeOnly?: boolean;
}): BrandRegistryEntry[] {
  const reg = loadBrandRegistry(opts);
  if (opts?.activeOnly === false) return [...reg.brands];
  return reg.brands.filter((b) => b.status === "ACTIVE");
}

export function listBrandIds(opts?: {
  brandsRoot?: string;
  activeOnly?: boolean;
}): BrandId[] {
  return listBrandEntries(opts).map((b) => b.brand_id);
}

export function getBrandEntry(
  brandId: string,
  opts?: { brandsRoot?: string },
): BrandRegistryEntry {
  const id = BrandIdSchema.parse(brandId);
  const entry = loadBrandRegistry(opts).brands.find((b) => b.brand_id === id);
  if (!entry) {
    throw new Error(`Unknown brand_id (not in registry): ${id}`);
  }
  return entry;
}

export function assertRegisteredBrandId(
  brandId: string,
  opts?: { brandsRoot?: string },
): BrandId {
  const entry = getBrandEntry(brandId, opts);
  if (entry.status === "ARCHIVED") {
    throw new Error(`Brand is ARCHIVED: ${entry.brand_id}`);
  }
  return entry.brand_id;
}

export function slugForBrandId(
  brandId: string,
  opts?: { brandsRoot?: string },
): string {
  return getBrandEntry(brandId, opts).slug;
}

export function displayNameForBrandId(
  brandId: string,
  opts?: { brandsRoot?: string },
): string {
  return getBrandEntry(brandId, opts).display_name;
}

export function brandDisplayNames(opts?: {
  brandsRoot?: string;
}): Record<string, string> {
  const out: Record<string, string> = {};
  for (const b of listBrandEntries(opts)) {
    out[b.brand_id] = b.display_name;
  }
  return out;
}

export function buildBrandAliasMap(opts?: {
  brandsRoot?: string;
}): Record<string, BrandId> {
  const map: Record<string, BrandId> = {};
  for (const b of listBrandEntries({ ...opts, activeOnly: false })) {
    map[b.brand_id.toLowerCase()] = b.brand_id;
    map[b.slug] = b.brand_id;
    map[b.display_name.toLowerCase()] = b.brand_id;
    for (const a of b.aliases) {
      map[a.trim().toLowerCase()] = b.brand_id;
      map[a.trim().toLowerCase().replace(/[\s-]/g, "")] = b.brand_id;
    }
  }
  return map;
}
