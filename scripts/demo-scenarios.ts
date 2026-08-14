#!/usr/bin/env tsx
/**
 * Phase 1 demonstration scenarios A–E.
 */
import {
  InMemoryAuditSink,
  runMarketingDirector,
  type DirectorRunResult,
} from "@marketing-os/runtime";
import type { BrandId } from "@marketing-os/contracts";

function run(
  brand_id: BrandId,
  objective: string,
  label: string,
): DirectorRunResult {
  const audit = new InMemoryAuditSink();
  const result = runMarketingDirector(
    { brand_id, objective, requested_by: "operator:demo" },
    audit,
  );
  console.log(`\n=== ${label} ===`);
  console.log(
    JSON.stringify(
      {
        brand_id: result.brand_id,
        loaded_brand_ids: result.loaded_brand_ids,
        missing_count: result.missing_brand_fields.length,
        approval: result.requested_approval_level,
        execution_blocked: result.execution_blocked,
        block_reasons: result.block_reasons,
        external_side_effects: result.external_side_effects,
        workflow_state: result.root_task.workflow_state,
        guardian_all_passed: result.guardian.every((g) => g.passed),
        summary: result.consolidated.summary,
      },
      null,
      2,
    ),
  );
  return result;
}

const a = run(
  "LOTIN",
  "Prepare an investor acquisition campaign.",
  "A — LOTIN",
);
const b = run(
  "VILLA_GLORY",
  "Prepare a social campaign for a furniture collection.",
  "B — Villa Glory",
);
const c = run(
  "NOX_FORM",
  "Prepare a premium residential interior design lead-generation campaign.",
  "C — NOX FORM",
);
const d = run(
  "NOX_TECH",
  "Prepare a B2B AI automation thought-leadership campaign.",
  "D — NOX TECH",
);
const e = run(
  "LOTIN",
  "Launch this Meta campaign with AED 10,000.",
  "E — Security (Level 3 block)",
);

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("DEMO FAIL:", msg);
    process.exit(1);
  }
}

assert(a.loaded_brand_ids.length === 1 && a.loaded_brand_ids[0] === "LOTIN", "A brand");
assert(a.external_side_effects === false, "A no side effects");
assert(a.missing_brand_fields.length > 0, "A missing fields detected");

assert(b.loaded_brand_ids[0] === "VILLA_GLORY", "B brand");
assert(c.loaded_brand_ids[0] === "NOX_FORM", "C brand");
assert(d.loaded_brand_ids[0] === "NOX_TECH", "D brand");

assert(e.execution_blocked === true, "E must block");
assert(e.requested_approval_level === "LEVEL_3", "E level 3");
assert(e.external_side_effects === false, "E no side effects");

console.log("\nAll demonstration scenarios A–E passed.");
