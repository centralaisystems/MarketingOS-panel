import { randomUUID } from "node:crypto";
import {
  ClassifiedFieldSchema,
  type BrandId,
  type ClassifiedField,
} from "@marketing-os/contracts";

const EMAIL_PATTERN = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const E164_LIKE_PATTERN = /\+\d{8,}/;
const BARE_PHONE_PATTERN = /^\+?\d{8,}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Email or phone-like contact data — not a vault handle or UUID. */
export const RAW_PII_PATTERN = /[^\s@]+@[^\s@]+\.[^\s@]+|\+\d{8,}|^\+?\d{8,}$/;

export function looksLikeRawPii(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || UUID_PATTERN.test(trimmed)) return false;
  if (EMAIL_PATTERN.test(trimmed)) return true;
  if (E164_LIKE_PATTERN.test(trimmed)) return true;
  if (BARE_PHONE_PATTERN.test(trimmed)) return true;
  return false;
}

export function assertOpaquePiiRef(pii_ref: string): void {
  if (!pii_ref.trim() || looksLikeRawPii(pii_ref)) {
    throw new Error(
      "pii_ref looks like raw contact data — use an opaque vault reference instead",
    );
  }
}

function walkForRawPii(value: unknown, found: string[]): void {
  if (typeof value === "string") {
    if (looksLikeRawPii(value)) found.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) walkForRawPii(item, found);
    return;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value as Record<string, unknown>)) {
      walkForRawPii(item, found);
    }
  }
}

/** True when a payload still contains email-like or phone-like strings. */
export function containsRawPii(value: unknown): boolean {
  const found: string[] = [];
  walkForRawPii(value, found);
  return found.length > 0;
}

export function collectRawPii(value: unknown): string[] {
  const found: string[] = [];
  walkForRawPii(value, found);
  return found;
}

export type SealedContact = {
  brand_id: BrandId;
  email?: string;
  phone?: string;
};

/**
 * Process-local vault. Raw contact fields never enter ops snapshots,
 * agent summaries, audit metadata, or global memory.
 */
export class SealedPiiVault {
  private readonly raw = new Map<string, SealedContact>();

  seal(input: {
    brand_id: BrandId;
    email?: string;
    phone?: string;
    pii_ref?: string;
  }): { pii_ref: string; classified: ClassifiedField[] } {
    const pii_ref = input.pii_ref?.trim() || `vault:${randomUUID()}`;
    assertOpaquePiiRef(pii_ref);
    this.raw.set(pii_ref, {
      brand_id: input.brand_id,
      ...(input.email ? { email: input.email } : {}),
      ...(input.phone ? { phone: input.phone } : {}),
    });
    return { pii_ref, classified: this.classify(pii_ref) };
  }

  classify(pii_ref: string): ClassifiedField[] {
    const row = this.raw.get(pii_ref);
    const fields: ClassifiedField[] = [];
    if (row?.email) {
      fields.push(
        ClassifiedFieldSchema.parse({
          name: "email",
          classification: "PII",
          value_present: true,
          redacted_placeholder: "[REDACTED_EMAIL]",
        }),
      );
    }
    if (row?.phone) {
      fields.push(
        ClassifiedFieldSchema.parse({
          name: "phone",
          classification: "PII",
          value_present: true,
          redacted_placeholder: "[REDACTED_PHONE]",
        }),
      );
    }
    return fields;
  }

  has(pii_ref: string): boolean {
    return this.raw.has(pii_ref);
  }

  /** Test helper only — never call from agent/prompt/audit paths. */
  peekRawForTest(pii_ref: string): SealedContact | undefined {
    return this.raw.get(pii_ref);
  }
}

export const defaultPiiVault = new SealedPiiVault();
