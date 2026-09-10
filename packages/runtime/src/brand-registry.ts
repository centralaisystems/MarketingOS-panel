import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BrandIdSchema,
  BrandRegistryEntrySchema,
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

export function registryLocalPath(brandsRoot?: string): string {
  return join(resolveRoot(brandsRoot), "_shared", "REGISTRY.local.json");
}

/**
 * Optional overlay (gitignored `REGISTRY.local.json` or Railway env).
 * Patches existing registry entries only — it cannot add a brand or
 * change brand_id. Use this for a real Villa Glory Drive folder /
 * owner inbox without committing tokens or live folder ids.
 */
export function applyRegistryLocalOverlay(
  registry: BrandRegistry,
  overlay: unknown,
): BrandRegistry {
  if (!overlay || typeof overlay !== "object" || Array.isArray(overlay)) {
    return registry;
  }
  const rawBrands = (overlay as { brands?: unknown }).brands;
  if (!Array.isArray(rawBrands) || rawBrands.length === 0) {
    return registry;
  }
  const patches = new Map<string, Record<string, unknown>>();
  for (const item of rawBrands) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const rec = item as Record<string, unknown>;
    if (typeof rec.brand_id !== "string") continue;
    patches.set(rec.brand_id, rec);
  }
  if (patches.size === 0) return registry;
  return BrandRegistrySchema.parse({
    ...registry,
    brands: registry.brands.map((entry) => {
      const patch = patches.get(entry.brand_id);
      if (!patch) return entry;
      const { brand_id: _ignored, ...rest } = patch;
      return BrandRegistryEntrySchema.parse({ ...entry, ...rest });
    }),
  });
}

export const REGISTRY_LOCAL_JSON_ENV = "MOS_REGISTRY_LOCAL_JSON";

export type RegistryEnvMap = Record<string, string | undefined>;

function parseRegistryLocalJsonEnv(env: RegistryEnvMap): unknown | undefined {
  const raw = env[REGISTRY_LOCAL_JSON_ENV]?.trim();
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new Error(
      `${REGISTRY_LOCAL_JSON_ENV} is not valid JSON (expected { brands: [{ brand_id, ...patch }] })`,
    );
  }
}

/**
 * Per-brand convenience vars for hosts that cannot ship `REGISTRY.local.json`
 * (Railway). Only registered brand_ids are considered — no closed brand enum.
 */
export function registryConvenienceOverlayFromEnv(
  registry: BrandRegistry,
  env: RegistryEnvMap = process.env,
): { brands: Array<Record<string, unknown>> } | null {
  const brands: Array<Record<string, unknown>> = [];
  for (const entry of registry.brands) {
    const id = entry.brand_id;
    const patch: Record<string, unknown> = { brand_id: id };
    const ownerEmail = env[`MOS_OWNER_EMAIL_${id}`]?.trim();
    const ownerCc = env[`MOS_OWNER_CC_${id}`]?.trim();
    const driveUrl = env[`MOS_DRIVE_FOLDER_URL_${id}`]?.trim();
    const driveId = env[`MOS_DRIVE_FOLDER_ID_${id}`]?.trim();
    if (ownerEmail) patch.owner_email = ownerEmail;
    if (ownerCc) {
      const cc = ownerCc
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean);
      if (cc.length) patch.owner_cc = cc;
    }
    if (driveUrl) patch.asset_drive_folder_url = driveUrl;
    if (driveId) patch.asset_drive_folder_id = driveId;
    if (Object.keys(patch).length > 1) brands.push(patch);
  }
  return brands.length > 0 ? { brands } : null;
}

/**
 * Apply Railway / `.env.local` registry patches via {@link applyRegistryLocalOverlay}.
 * Order: per-brand convenience vars, then `MOS_REGISTRY_LOCAL_JSON` (wins).
 */
export function applyRegistryEnvOverlay(
  registry: BrandRegistry,
  env: RegistryEnvMap = process.env,
): BrandRegistry {
  const convenience = registryConvenienceOverlayFromEnv(registry, env);
  let next = convenience
    ? applyRegistryLocalOverlay(registry, convenience)
    : registry;
  const json = parseRegistryLocalJsonEnv(env);
  if (json !== undefined) {
    next = applyRegistryLocalOverlay(next, json);
  }
  return next;
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
  let registry = BrandRegistrySchema.parse(raw);
  const localPath = registryLocalPath(root);
  if (existsSync(localPath)) {
    const localRaw = JSON.parse(readFileSync(localPath, "utf8")) as unknown;
    registry = applyRegistryLocalOverlay(registry, localRaw);
  }
  // Env wins over the gitignored file so Railway can overlay without a checkout file.
  registry = applyRegistryEnvOverlay(registry);
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
