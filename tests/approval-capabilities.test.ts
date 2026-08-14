import { describe, expect, it } from "vitest";
import {
  agentHasCapability,
  isExternalWriteCapability,
} from "@marketing-os/contracts";
import {
  InMemoryAuditSink,
  assertAgentCapability,
  assertExecutableApprovalLevel,
  detectRequestedApprovalLevel,
} from "@marketing-os/runtime";

describe("approval and capabilities", () => {
  it("blocks Level 2 and Level 3 execution in Phase 1", () => {
    const audit = new InMemoryAuditSink();
    expect(assertExecutableApprovalLevel("LEVEL_0", audit).ok).toBe(true);
    expect(assertExecutableApprovalLevel("LEVEL_1", audit).ok).toBe(true);
    expect(assertExecutableApprovalLevel("LEVEL_2", audit).ok).toBe(false);
    expect(assertExecutableApprovalLevel("LEVEL_3", audit).ok).toBe(false);
  });

  it("detects high-risk objectives as Level 3", () => {
    expect(
      detectRequestedApprovalLevel("Launch this Meta campaign with AED 10,000."),
    ).toBe("LEVEL_3");
    expect(
      detectRequestedApprovalLevel("Prepare an investor acquisition campaign."),
    ).toBe("LEVEL_1");
  });

  it("denies Research LAUNCH_AD and Paid Growth write caps in Phase 1 matrix", () => {
    expect(agentHasCapability("A03_RESEARCH_INTELLIGENCE", "LAUNCH_AD")).toBe(
      false,
    );
    expect(agentHasCapability("A10_PAID_GROWTH", "LAUNCH_AD")).toBe(false);
    expect(agentHasCapability("A10_PAID_GROWTH", "CHANGE_AD_BUDGET")).toBe(
      false,
    );
    expect(isExternalWriteCapability("PUBLISH_SOCIAL")).toBe(true);
  });

  it("enforces capability checks with audit", () => {
    const audit = new InMemoryAuditSink();
    const denied = assertAgentCapability(
      "A03_RESEARCH_INTELLIGENCE",
      "PUBLISH_SOCIAL",
      audit,
      { brand_id: "LOTIN" },
    );
    expect(denied.ok).toBe(false);
    expect(audit.list().some((e) => e.event_type === "CAPABILITY_DENIED")).toBe(
      true,
    );
  });
});
