import { describe, expect, it } from "vitest";
import { canTransition } from "@marketing-os/contracts";
import { InMemoryAuditSink, transitionWorkflow } from "@marketing-os/runtime";

describe("workflow state machine", () => {
  it("allows legal transitions", () => {
    expect(canTransition("IDEA", "RESEARCHING")).toBe(true);
    expect(canTransition("QA", "AWAITING_APPROVAL")).toBe(true);
    expect(canTransition("AWAITING_APPROVAL", "APPROVED")).toBe(true);
  });

  it("rejects illegal transitions", () => {
    expect(canTransition("IDEA", "PUBLISHED")).toBe(false);
    expect(canTransition("RESEARCHING", "PUBLISHED")).toBe(false);
    expect(canTransition("LEARNING_CAPTURED", "IDEA")).toBe(false);
  });

  it("blocks Phase 1 transition to PUBLISHED even from APPROVED", () => {
    const audit = new InMemoryAuditSink();
    const result = transitionWorkflow("APPROVED", "PUBLISHED", {
      audit,
      brand_id: "LOTIN",
      approval_level: "LEVEL_2",
      phase1: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/Phase 1/);
    }
  });

  it("cannot skip approval to reach SCHEDULED from IN_PRODUCTION", () => {
    expect(canTransition("IN_PRODUCTION", "SCHEDULED")).toBe(false);
    const audit = new InMemoryAuditSink();
    const result = transitionWorkflow("IN_PRODUCTION", "SCHEDULED", {
      audit,
      brand_id: "LOTIN",
      approval_level: "LEVEL_2",
    });
    expect(result.ok).toBe(false);
  });
});
