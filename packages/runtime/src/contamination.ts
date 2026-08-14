import type { BrandId, AgentResult } from "@marketing-os/contracts";
import { foreignBrandTokens } from "./brand-loader.js";
import type { AuditSink } from "./audit.js";

export type ContaminationFinding = {
  field: string;
  token: string;
  snippet: string;
};

/**
 * Detect cross-brand contamination in free text or agent results.
 * Intentional: adversarial fixtures should be caught.
 */
export function scanTextForForeignBrands(
  text: string,
  activeBrand: BrandId,
): ContaminationFinding[] {
  const findings: ContaminationFinding[] = [];
  const tokens = foreignBrandTokens(activeBrand);
  const lower = text.toLowerCase();

  for (const token of tokens) {
    const t = token.toLowerCase();
    if (t.length < 3) continue;
    const idx = lower.indexOf(t);
    if (idx >= 0) {
      // Avoid matching partial noise for short tokens
      const snippet = text.slice(Math.max(0, idx - 20), idx + t.length + 20);
      findings.push({ field: "text", token, snippet });
    }
  }
  return findings;
}

export function scanAgentResultContamination(
  result: AgentResult,
  activeBrand: BrandId,
  audit?: AuditSink,
): ContaminationFinding[] {
  if (result.brand_id !== activeBrand) {
    const finding: ContaminationFinding = {
      field: "brand_id",
      token: result.brand_id,
      snippet: `Result brand_id ${result.brand_id} != active ${activeBrand}`,
    };
    audit?.append({
      brand_id: activeBrand,
      task_id: result.task_id,
      agent_id: result.agent,
      event_type: "CONTAMINATION_DETECTED",
      message: finding.snippet,
      metadata: { finding },
    });
    return [finding];
  }

  const blobs: string[] = [
    result.summary,
    result.recommended_next_action,
    ...result.assumptions,
    ...result.risks,
    ...result.missing_information,
    ...result.statements.map((s) => s.text),
    ...result.evidence.map((e) => e.summary),
    JSON.stringify(result.deliverables),
  ];

  const findings: ContaminationFinding[] = [];
  for (const blob of blobs) {
    findings.push(...scanTextForForeignBrands(blob, activeBrand));
  }

  if (findings.length && audit) {
    audit.append({
      brand_id: activeBrand,
      task_id: result.task_id,
      agent_id: result.agent,
      event_type: "CONTAMINATION_DETECTED",
      message: `Detected ${findings.length} contamination signal(s)`,
      metadata: { findings: findings.slice(0, 10) },
    });
  }

  return findings;
}

/** Detect secret-shaped strings in config/fixtures. */
export const SECRET_PATTERN =
  /(?:api[_-]?key|secret|password|token|private[_-]?key)\s*[:=]\s*['"]?[A-Za-z0-9_\-]{16,}/i;

export function findSecretShapedStrings(text: string): string[] {
  const matches = text.match(new RegExp(SECRET_PATTERN, "gi"));
  return matches ?? [];
}
