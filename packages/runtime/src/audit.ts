import { randomUUID } from "node:crypto";
import type {
  ApprovalLevel,
  AuditEvent,
  BrandId,
  Capability,
  AgentId,
} from "@marketing-os/contracts";
import { AuditEventSchema } from "@marketing-os/contracts";

/**
 * Portable audit sink. Phase 1: in-memory.
 * Phase 4+: replace with Supabase audit_log without changing callers.
 */
export interface AuditSink {
  append(event: Omit<AuditEvent, "event_id" | "timestamp"> & { timestamp?: string }): AuditEvent;
  list(filter?: { brand_id?: BrandId; task_id?: string }): AuditEvent[];
  clear(): void;
}

export class InMemoryAuditSink implements AuditSink {
  private events: AuditEvent[] = [];

  append(
    partial: Omit<AuditEvent, "event_id" | "timestamp"> & { timestamp?: string },
  ): AuditEvent {
    const event = AuditEventSchema.parse({
      ...partial,
      event_id: randomUUID(),
      timestamp: partial.timestamp ?? new Date().toISOString(),
      metadata: partial.metadata ?? {},
    });
    this.events.push(event);
    return event;
  }

  list(filter?: { brand_id?: BrandId; task_id?: string }): AuditEvent[] {
    return this.events.filter((e) => {
      if (filter?.brand_id && e.brand_id !== filter.brand_id) return false;
      if (filter?.task_id && e.task_id !== filter.task_id) return false;
      return true;
    });
  }

  clear(): void {
    this.events = [];
  }
}

export function denyCapability(
  audit: AuditSink,
  input: {
    brand_id?: BrandId | undefined;
    agent_id?: AgentId | undefined;
    task_id?: string | undefined;
    capability: Capability;
    reason: string;
  },
): void {
  audit.append({
    ...(input.brand_id ? { brand_id: input.brand_id } : {}),
    ...(input.agent_id ? { agent_id: input.agent_id } : {}),
    ...(input.task_id ? { task_id: input.task_id } : {}),
    event_type: "CAPABILITY_DENIED",
    message: input.reason,
    capability: input.capability,
    metadata: {},
  });
}

export function blockExecution(
  audit: AuditSink,
  input: {
    brand_id?: BrandId | undefined;
    agent_id?: AgentId | undefined;
    task_id?: string | undefined;
    approval_level: ApprovalLevel;
    reason: string;
  },
): void {
  audit.append({
    ...(input.brand_id ? { brand_id: input.brand_id } : {}),
    ...(input.agent_id ? { agent_id: input.agent_id } : {}),
    ...(input.task_id ? { task_id: input.task_id } : {}),
    event_type: "EXECUTION_BLOCKED",
    message: input.reason,
    approval_level: input.approval_level,
    metadata: {},
  });
}
