import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BrandIdSchema,
  BrandProfileSchema,
  listMissingKnowledge,
  type BrandId,
  type BrandProfile,
  type CrossBrandOperation,
} from "@marketing-os/contracts";
import type { AuditSink } from "./audit.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const BRAND_SLUG: Record<BrandId, string> = {
  LOTIN: "lotin",
  VILLA_GLORY: "villa-glory",
  NOX_FORM: "nox-form",
  NOX_TECH: "nox-tech",
};

/** Resolve brands directory: repo root /brands */
export function resolveBrandsRoot(override?: string): string {
  if (override) return override;
  // packages/runtime/src -> repo root
  return join(__dirname, "../../../brands");
}

export class BrandIsolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BrandIsolationError";
  }
}

/**
 * Load exactly one brand profile.
 * Never loads all brands unless an explicit CrossBrandOperation is authorized.
 */
export function loadBrandContext(
  brandId: BrandId,
  audit: AuditSink,
  opts?: {
    brandsRoot?: string;
    crossBrand?: CrossBrandOperation;
    additionalBrandIds?: BrandId[];
  },
): { profile: BrandProfile; loaded_brand_ids: BrandId[]; missing: string[] } {
  const parsedId = BrandIdSchema.parse(brandId);

  if (opts?.additionalBrandIds?.length) {
    if (!opts.crossBrand?.authorized) {
      throw new BrandIsolationError(
        "Refusing to load multiple brands without authorized CrossBrandOperation",
      );
    }
    for (const id of opts.additionalBrandIds) {
      if (!opts.crossBrand.brand_ids.includes(id)) {
        throw new BrandIsolationError(
          `Brand ${id} not listed in authorized CrossBrandOperation`,
        );
      }
    }
  }

  const root = resolveBrandsRoot(opts?.brandsRoot);
  const slug = BRAND_SLUG[parsedId];
  const path = join(root, slug, "profile.json");

  if (!existsSync(path)) {
    throw new BrandIsolationError(`Brand profile not found: ${path}`);
  }

  const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
  const profile = BrandProfileSchema.parse(raw);

  if (profile.brand_id !== parsedId) {
    throw new BrandIsolationError(
      `Profile brand_id mismatch: expected ${parsedId}, got ${profile.brand_id}`,
    );
  }

  const loaded: BrandId[] = [parsedId];
  if (opts?.crossBrand?.authorized && opts.additionalBrandIds) {
    // Explicit multi-brand only when authorized — still load separately, never merge silently
    for (const id of opts.additionalBrandIds) {
      if (id !== parsedId) loaded.push(id);
    }
  }

  audit.append({
    brand_id: parsedId,
    event_type: "BRAND_CONTEXT_LOADED",
    message: `Loaded brand context for ${parsedId} only`,
    metadata: { loaded_brand_ids: loaded, path },
  });

  const missing = listMissingKnowledge(profile);

  return { profile, loaded_brand_ids: loaded, missing };
}

export function brandDisplayNames(): Record<BrandId, string> {
  return {
    LOTIN: "LOTIN",
    VILLA_GLORY: "Villa Glory",
    NOX_FORM: "NOX FORM",
    NOX_TECH: "NOX TECH",
  };
}

/** Foreign brand tokens used for contamination scanning. */
export function foreignBrandTokens(active: BrandId): string[] {
  const names = brandDisplayNames();
  return (Object.keys(names) as BrandId[])
    .filter((id) => id !== active)
    .flatMap((id) => [
      id,
      names[id],
      names[id].toLowerCase(),
      BRAND_SLUG[id],
      BRAND_SLUG[id].replace("-", " "),
    ]);
}
