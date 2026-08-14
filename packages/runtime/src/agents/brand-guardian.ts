import { randomUUID } from "node:crypto";
import {
  AgentResultSchema,
  APPROVAL_LEVEL_RANK,
  type AgentResult,
  type ApprovalLevel,
  type BrandProfile,
  type Task,
  PHASE1_MAX_EXECUTABLE_LEVEL,
} from "@marketing-os/contracts";
import { assertAgentCapability } from "../capabilities.js";
import { scanAgentResultContamination } from "../contamination.js";
import type { AuditSink } from "../audit.js";

export type GuardianVerdict = {
  passed: boolean;
  result: AgentResult;
  reasons: string[];
  required_approval_level: ApprovalLevel;
};

const UNSUPPORTED_CLAIM_PATTERNS = [
  /\bguaranteed?\b/i,
  /\b\d+%\s*(roi|return|growth|increase)\b/i,
  /\bbest\s+(in\s+the\s+world|ever)\b/i,
  /\brisk[- ]free\b/i,
  /\bno\s+risk\b/i,
];

/**
 * A14 Brand Guardian — can reject. Not a rubber stamp.
 */
export function runBrandGuardian(
  subject: AgentResult,
  profile: BrandProfile,
  audit: AuditSink,
  parentTask?: Task,
): GuardianVerdict {
  const taskId = parentTask?.task_id ?? subject.task_id;
  const cap = assertAgentCapability(
    "A14_BRAND_GUARDIAN",
    "VERIFY_OUTPUT",
    audit,
    { brand_id: profile.brand_id, task_id: taskId },
  );

  const reasons: string[] = [];

  if (!cap.ok) {
    reasons.push(cap.reason);
  }

  if (subject.brand_id !== profile.brand_id) {
    reasons.push(
      `Brand mismatch: result=${subject.brand_id} profile=${profile.brand_id}`,
    );
  }

  const contamination = scanAgentResultContamination(
    subject,
    profile.brand_id,
    audit,
  );
  if (contamination.length) {
    reasons.push(
      `Cross-brand contamination detected (${contamination.length} signal(s))`,
    );
  }

  // Unsupported claims in marketing-facing text (not compliance_notes)
  const marketingBlobs: string[] = [subject.summary];
  for (const d of subject.deliverables) {
    if (typeof d === "object" && d !== null) {
      const rec = d as Record<string, unknown>;
      if (typeof rec.body === "string") marketingBlobs.push(rec.body);
      if (typeof rec.headline === "string") marketingBlobs.push(rec.headline);
      // Ignore compliance_notes — may mention forbidden words as restrictions
    }
  }
  for (const s of subject.statements) {
    if (s.kind === "FACT") marketingBlobs.push(s.text);
  }
  const claimText = marketingBlobs.join("\n");

  for (const re of UNSUPPORTED_CLAIM_PATTERNS) {
    if (re.test(claimText)) {
      reasons.push(`Unsupported/risky claim pattern matched: ${re}`);
    }
  }

  // FACT statements without evidence
  for (const s of subject.statements) {
    if (s.kind === "FACT" && s.evidence_ids.length === 0 && s.confidence !== "VERIFIED") {
      // Phase 1 system facts (e.g. "integrations deferred") may be VERIFIED without external evidence
      if (s.confidence === "HIGH" || s.confidence === "MEDIUM" || s.confidence === "LOW") {
        reasons.push(`FACT without evidence: "${s.text.slice(0, 80)}"`);
      }
    }
  }

  // Tone: if tone is MISSING, flag production-ready claims
  if (
    profile.tone.status === "MISSING" &&
    subject.agent === "A05_CONTENT_COPY" &&
    subject.confidence === "HIGH"
  ) {
    reasons.push("Content confidence HIGH while brand tone is MISSING");
  }

  let required: ApprovalLevel = subject.recommended_approval_level;
  if (APPROVAL_LEVEL_RANK[required] < APPROVAL_LEVEL_RANK.LEVEL_1) {
    // Draft content should at least be Level 1 when producing copy
    if (subject.agent === "A05_CONTENT_COPY") required = "LEVEL_1";
  }

  // External action intent in recommended next action
  if (
    /\b(publish|launch ad|contact customer|go live)\b/i.test(
      subject.recommended_next_action,
    )
  ) {
    required = "LEVEL_3";
    reasons.push(
      "Recommended next action implies external/high-risk execution — elevating approval requirement",
    );
  }

  if (APPROVAL_LEVEL_RANK[required] > APPROVAL_LEVEL_RANK[PHASE1_MAX_EXECUTABLE_LEVEL]) {
    // Not an automatic reject — but must be flagged
    audit.append({
      brand_id: profile.brand_id,
      task_id: taskId,
      agent_id: "A14_BRAND_GUARDIAN",
      event_type: "APPROVAL_REQUIRED",
      message: `Guardian notes ${required} required; Phase 1 cannot execute`,
      approval_level: required,
      metadata: {},
    });
  }

  const passed = reasons.length === 0;

  const result = AgentResultSchema.parse({
    task_id: taskId,
    brand_id: profile.brand_id,
    agent: "A14_BRAND_GUARDIAN",
    summary: passed
      ? `Guardian PASSED for ${subject.agent} output on ${profile.brand_id}`
      : `Guardian REJECTED ${subject.agent} output: ${reasons.length} issue(s)`,
    deliverables: [
      {
        type: "guardian_verdict",
        subject_agent: subject.agent,
        subject_task_id: subject.task_id,
        passed,
        reasons,
        required_approval_level: required,
      },
    ],
    statements: reasons.map((r) => ({
      text: r,
      kind: "OBSERVATION" as const,
      confidence: "HIGH" as const,
      evidence_ids: [],
    })),
    assumptions: [],
    risks: passed ? [] : reasons,
    confidence: "HIGH",
    recommended_next_action: passed
      ? `Proceed as ${required} internal work only; no external side effects.`
      : "Revise rejected output; do not publish or spend.",
    recommended_approval_level: required,
    contamination_flags: contamination.map((c) => `${c.token}: ${c.snippet}`),
    rejected: !passed,
    rejection_reasons: passed ? undefined : reasons,
    capabilities_used: ["READ_BRAND_CONTEXT", "VERIFY_OUTPUT"],
    created_at: new Date().toISOString(),
  });

  audit.append({
    brand_id: profile.brand_id,
    task_id: taskId,
    agent_id: "A14_BRAND_GUARDIAN",
    event_type: passed ? "GUARDIAN_PASSED" : "GUARDIAN_REJECTED",
    message: result.summary,
    approval_level: required,
    metadata: { reasons },
  });

  return { passed, result, reasons, required_approval_level: required };
}

export function createGuardianTask(
  brandId: Task["brand_id"],
  objective: string,
  requestedBy: string,
  parentTaskId?: string,
): Task {
  return {
    task_id: randomUUID(),
    brand_id: brandId,
    objective,
    requested_by: requestedBy,
    assigned_agent: "A14_BRAND_GUARDIAN",
    input: { objective },
    expected_output: "Pass/fail verification with reasons",
    dependencies: parentTaskId ? [parentTaskId] : [],
    priority: "CRITICAL",
    approval_level: "LEVEL_0",
    status: "PENDING",
    workflow_state: "QA",
    required_capabilities: ["VERIFY_OUTPUT"],
    created_at: new Date().toISOString(),
    parent_task_id: parentTaskId,
  };
}
