import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { AgentContractSchema } from "@marketing-os/contracts";
import {
  InMemoryAuditSink,
  runMarketingDirector,
  findSecretShapedStrings,
} from "@marketing-os/runtime";

describe("Phase 1 scenarios", () => {
  it("A LOTIN investor campaign", () => {
    const audit = new InMemoryAuditSink();
    const r = runMarketingDirector(
      {
        brand_id: "LOTIN",
        objective: "Prepare an investor acquisition campaign.",
        requested_by: "demo",
      },
      audit,
    );
    expect(r.loaded_brand_ids).toEqual(["LOTIN"]);
    expect(r.missing_brand_fields.length).toBeGreaterThan(0);
    expect(r.tasks.length).toBeGreaterThanOrEqual(4);
    expect(r.external_side_effects).toBe(false);
    expect(r.execution_blocked).toBe(false);
  });

  it("B Villa Glory social campaign", () => {
    const audit = new InMemoryAuditSink();
    const r = runMarketingDirector(
      {
        brand_id: "VILLA_GLORY",
        objective: "Prepare a social campaign for a furniture collection.",
        requested_by: "demo",
      },
      audit,
    );
    expect(r.loaded_brand_ids).toEqual(["VILLA_GLORY"]);
    expect(r.external_side_effects).toBe(false);
  });

  it("C NOX FORM lead-gen campaign", () => {
    const audit = new InMemoryAuditSink();
    const r = runMarketingDirector(
      {
        brand_id: "NOX_FORM",
        objective:
          "Prepare a premium residential interior design lead-generation campaign.",
        requested_by: "demo",
      },
      audit,
    );
    expect(r.loaded_brand_ids).toEqual(["NOX_FORM"]);
  });

  it("D NOX TECH thought leadership", () => {
    const audit = new InMemoryAuditSink();
    const r = runMarketingDirector(
      {
        brand_id: "NOX_TECH",
        objective: "Prepare a B2B AI automation thought-leadership campaign.",
        requested_by: "demo",
      },
      audit,
    );
    expect(r.loaded_brand_ids).toEqual(["NOX_TECH"]);
  });

  it("E blocks Meta launch with AED 10,000", () => {
    const audit = new InMemoryAuditSink();
    const r = runMarketingDirector(
      {
        brand_id: "LOTIN",
        objective: "Launch this Meta campaign with AED 10,000.",
        requested_by: "demo",
      },
      audit,
    );
    expect(r.requested_approval_level).toBe("LEVEL_3");
    expect(r.execution_blocked).toBe(true);
    expect(r.external_side_effects).toBe(false);
    expect(r.root_task.workflow_state).not.toBe("PUBLISHED");
  });
});

describe("agent contracts", () => {
  it("all 14 agent contract.json files validate", () => {
    const root = join(process.cwd(), "agents");
    const dirs = readdirSync(root);
    const contracts = dirs
      .map((d) => join(root, d, "contract.json"))
      .map((p) => JSON.parse(readFileSync(p, "utf8")) as unknown);
    expect(contracts.length).toBe(14);
    for (const c of contracts) {
      expect(() => AgentContractSchema.parse(c)).not.toThrow();
    }
    const implemented = contracts.filter(
      (c) => (c as { phase1_implemented: boolean }).phase1_implemented,
    );
    expect(implemented.length).toBe(5);
  });
});

describe("secret safety across brand fixtures", () => {
  it("brand profiles do not contain secret-shaped assignments", () => {
    const brands = ["lotin", "villa-glory", "nox-form", "nox-tech"];
    for (const slug of brands) {
      const text = readFileSync(
        join(process.cwd(), "brands", slug, "profile.json"),
        "utf8",
      );
      expect(findSecretShapedStrings(text)).toEqual([]);
    }
  });
});
