#!/usr/bin/env tsx
import { readFileSync } from "node:fs";
import { AgentResultSchema, BrandIdSchema } from "@marketing-os/contracts";
import {
  InMemoryAuditSink,
  loadBrandContext,
  runBrandGuardian,
} from "@marketing-os/runtime";

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0) return process.argv[idx + 1];
  return undefined;
}

const brandRaw = arg("brand");
const file = arg("file");

if (!brandRaw || !file) {
  console.error(
    "Usage: pnpm verify-output -- --brand LOTIN --file path/to/result.json",
  );
  process.exit(1);
}

const brand_id = BrandIdSchema.parse(brandRaw);
const audit = new InMemoryAuditSink();
const { profile } = loadBrandContext(brand_id, audit);
const subject = AgentResultSchema.parse(
  JSON.parse(readFileSync(file, "utf8")) as unknown,
);
const verdict = runBrandGuardian(subject, profile, audit);

console.log(
  JSON.stringify(
    {
      passed: verdict.passed,
      reasons: verdict.reasons,
      required_approval_level: verdict.required_approval_level,
      summary: verdict.result.summary,
    },
    null,
    2,
  ),
);

process.exit(verdict.passed ? 0 : 2);
