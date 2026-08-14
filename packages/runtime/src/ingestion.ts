import { createHash, randomUUID } from "node:crypto";
import {
  IngestionEnvelopeSchema,
  NormalizedFactCandidateSchema,
  type BrandId,
  type IngestionEnvelope,
  type IngestionFormat,
  type NormalizedFactCandidate,
  type SourceType,
  type FutureConnectorKind,
} from "@marketing-os/contracts";

/**
 * Phase 2 ingestion foundation.
 * Accepts local markdown/yaml/json/text/operator input with provenance.
 * Future connectors exist as typed kinds only — never connected here.
 */
export function createIngestionEnvelope(input: {
  brand_id: BrandId;
  format: IngestionFormat;
  source_type: SourceType;
  source_reference: string;
  content: string;
  observed_at?: string;
  future_connector?: FutureConnectorKind;
}): IngestionEnvelope {
  if (input.future_connector) {
    // Explicit: designing the interface does not connect the service
  }
  return IngestionEnvelopeSchema.parse({
    ingestion_id: randomUUID(),
    brand_id: input.brand_id,
    format: input.format,
    source_type: input.source_type,
    source_reference: input.source_reference,
    observed_at: input.observed_at ?? new Date().toISOString(),
    content: input.content,
    content_sha256: createHash("sha256").update(input.content).digest("hex"),
    future_connector: input.future_connector,
    connector_connected: false,
  });
}

/**
 * Normalize a structured operator JSON object into fact candidates.
 * Does not invent values — only maps supplied keys.
 */
export function normalizeStructuredOperatorInput(
  envelope: IngestionEnvelope,
  structured: Record<string, unknown>,
): NormalizedFactCandidate[] {
  const out: NormalizedFactCandidate[] = [];
  for (const [path, value] of Object.entries(structured)) {
    out.push(
      NormalizedFactCandidateSchema.parse({
        path,
        value,
        source_type: envelope.source_type,
        source_reference: envelope.source_reference,
        observed_at: envelope.observed_at,
        brand_id: envelope.brand_id,
        ingestion_id: envelope.ingestion_id,
      }),
    );
  }
  return out;
}

/** Parse JSON content while preserving envelope provenance on each candidate. */
export function normalizeJsonIngestion(
  envelope: IngestionEnvelope,
): NormalizedFactCandidate[] {
  if (envelope.format !== "JSON") {
    throw new Error("normalizeJsonIngestion requires JSON format");
  }
  const parsed = JSON.parse(envelope.content) as unknown;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return [
      NormalizedFactCandidateSchema.parse({
        path: "root",
        value: parsed,
        source_type: envelope.source_type,
        source_reference: envelope.source_reference,
        observed_at: envelope.observed_at,
        brand_id: envelope.brand_id,
        ingestion_id: envelope.ingestion_id,
      }),
    ];
  }
  return normalizeStructuredOperatorInput(
    envelope,
    parsed as Record<string, unknown>,
  );
}

export const FUTURE_CONNECTORS_DISABLED: Record<FutureConnectorKind, false> = {
  WEBSITE: false,
  PDF: false,
  GOOGLE_DRIVE: false,
  SOCIAL_ACCOUNT: false,
  CRM: false,
  ANALYTICS: false,
};
