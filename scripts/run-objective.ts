#!/usr/bin/env tsx
import { InMemoryAuditSink, runMarketingDirector } from "@marketing-os/runtime";
import { BrandIdSchema, type BrandId } from "@marketing-os/contracts";

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0) return process.argv[idx + 1];
  return undefined;
}

const brandRaw = arg("brand");
const objective = arg("objective");

if (!brandRaw || !objective) {
  console.error(
    'Usage: pnpm run-objective -- --brand LOTIN --objective "Prepare investor campaign"',
  );
  process.exit(1);
}

const brand_id = BrandIdSchema.parse(brandRaw) as BrandId;
const audit = new InMemoryAuditSink();
const result = runMarketingDirector(
  {
    brand_id,
    objective,
    requested_by: "operator:cursor",
  },
  audit,
);

console.log(
  JSON.stringify(
    {
      brand_id: result.brand_id,
      loaded_brand_ids: result.loaded_brand_ids,
      missing_brand_fields: result.missing_brand_fields,
      requested_approval_level: result.requested_approval_level,
      execution_blocked: result.execution_blocked,
      block_reasons: result.block_reasons,
      external_side_effects: result.external_side_effects,
      workflow_state: result.root_task.workflow_state,
      guardian: result.guardian.map((g) => ({
        passed: g.passed,
        reasons: g.reasons,
      })),
      consolidated_summary: result.consolidated.summary,
      recommended_next_action: result.consolidated.recommended_next_action,
      task_count: result.tasks.length,
      audit_event_count: result.audit_event_count,
    },
    null,
    2,
  ),
);
