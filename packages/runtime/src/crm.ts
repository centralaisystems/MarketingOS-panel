import { randomUUID } from "node:crypto";
import {
  LeadRecordSchema,
  type LeadRecord,
} from "@marketing-os/contracts";
import { assertWaveEnabled } from "./phase-gates.js";
import { assertRegisteredBrandId } from "./brand-registry.js";

/**
 * Wave 7 CRM — store only opaque pii_ref. Never put raw PII into prompts/memory.
 */
export function createLeadDraft(input: {
  brand_id: string;
  pii_ref: string;
  source: LeadRecord["source"];
  campaign_id?: string;
}): LeadRecord {
  if (/@|\+?\d{8,}/.test(input.pii_ref)) {
    throw new Error(
      "pii_ref looks like raw contact data — use an opaque vault reference instead",
    );
  }
  assertWaveEnabled("WAVE_7_CRM");
  const brand_id = assertRegisteredBrandId(input.brand_id);
  return LeadRecordSchema.parse({
    lead_id: randomUUID(),
    brand_id,
    pii_ref: input.pii_ref,
    source: input.source,
    campaign_id: input.campaign_id,
    stage: "NEW",
    created_at: new Date().toISOString(),
  });
}
