import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  EvidenceLedgerSchema,
  HumanReviewQueueSchema,
  ProvenancedFieldSchema,
  type BrandId,
  type EvidenceCandidate,
  type EvidenceLedger,
  type HumanReviewItem,
  type ProvenancedField,
} from "@marketing-os/contracts";
import { loadBrandPack } from "./brand-pack.js";
import { resolveBrandsRoot } from "./brand-loader.js";
import { detectAndRecordConflict } from "./conflicts.js";
import { filterPlaceholderCandidates } from "./phase2b-filters.js";
import { verifyBrandIntelligence } from "./onboarding.js";
import type { AuditSink } from "./audit.js";

const SLUG: Record<BrandId, string> = {
  LOTIN: "lotin",
  VILLA_GLORY: "villa-glory",
  NOX_FORM: "nox-form",
  NOX_TECH: "nox-tech",
};

function setByPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split(".");
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i]!;
    if (!cur[p] || typeof cur[p] !== "object") cur[p] = {};
    cur = cur[p] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]!] = value;
}

function getByPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const p of path.split(".")) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

function isProvenanced(v: unknown): v is ProvenancedField {
  return !!v && typeof v === "object" && "status" in (v as object);
}

export function candidateToField(c: EvidenceCandidate): ProvenancedField {
  // Repository evidence never auto-promotes to VERIFIED.
  const status =
    c.verification_status === "VERIFIED" ? "UNVERIFIED" : c.verification_status;
  let confidence: "LOW" | "MEDIUM" | "HIGH" =
    c.confidence === "VERIFIED" || c.confidence === "HIGH"
      ? "HIGH"
      : c.confidence;
  // Guardian rejects UNVERIFIED + HIGH confidence as overclaiming.
  if (status === "UNVERIFIED" && confidence === "HIGH") {
    confidence = "MEDIUM";
  }
  return ProvenancedFieldSchema.parse({
    status,
    value: c.candidate_value,
    notes: `${c.status_reason} | ${c.evidence_summary}`,
    source_type: c.source_type,
    source_reference: `${c.source_repository}:${c.relative_source_path}`,
    observed_at: c.observed_at,
    confidence,
    time_sensitive: c.time_sensitive,
    review_after_days: c.review_after_days,
  });
}

export function loadEvidenceLedger(
  brandId: BrandId,
  opts?: { brandsRoot?: string },
): EvidenceLedger {
  const path = join(
    resolveBrandsRoot(opts?.brandsRoot),
    SLUG[brandId],
    "EVIDENCE_LEDGER.json",
  );
  return EvidenceLedgerSchema.parse(
    JSON.parse(readFileSync(path, "utf8")) as unknown,
  );
}

export function applyEvidenceLedger(
  brandId: BrandId,
  ledger: EvidenceLedger,
  opts?: { brandsRoot?: string; write?: boolean; audit?: AuditSink },
): {
  applied: number;
  skipped: number;
  conflicts: number;
  rejected_placeholders: number;
  pack_paths_written: string[];
} {
  if (ledger.brand_id !== brandId) {
    throw new Error(`Ledger brand mismatch: ${ledger.brand_id} vs ${brandId}`);
  }

  const active = ledger.candidates.filter((c) => !c.rejected);
  const filtered = filterPlaceholderCandidates(
    active as Array<EvidenceCandidate & { candidate_value: unknown; evidence_summary: string }>,
  );
  const kept = filtered.kept as EvidenceCandidate[];
  const rejected = filtered.rejected;
  const pack = loadBrandPack(brandId, opts?.audit, {
    ...(opts?.brandsRoot ? { brandsRoot: opts.brandsRoot } : {}),
    applyStale: false,
  });
  const packObj = pack as unknown as Record<string, unknown>;
  let applied = 0;
  let skipped = 0;
  let conflicts = 0;
  const moduleDirt = new Set<string>();

  for (const c of kept) {
    const existing = getByPath(packObj, c.field_path);
    const incoming = candidateToField(c);

    if (!isProvenanced(existing)) {
      skipped++;
      continue;
    }

    if (existing.status === "MISSING") {
      setByPath(packObj, c.field_path, incoming);
      applied++;
      moduleDirt.add(c.field_path.split(".")[0]!);
      continue;
    }

    // Stronger-than-inference evidence may replace AI_INFERENCE placeholders
    // without creating a CONFLICTING state (orientation → repo evidence).
    if (
      existing.source_type === "AI_INFERENCE" &&
      incoming.source_type &&
      incoming.source_type !== "AI_INFERENCE"
    ) {
      setByPath(packObj, c.field_path, incoming);
      applied++;
      moduleDirt.add(c.field_path.split(".")[0]!);
      continue;
    }

    const conflictIncoming: {
      value: unknown;
      source_type: NonNullable<ProvenancedField["source_type"]>;
      source_reference: string;
      observed_at?: string;
    } = {
      value: incoming.value,
      source_type: incoming.source_type ?? "PUBLIC_SOURCE",
      source_reference: incoming.source_reference ?? "ledger",
    };
    if (incoming.observed_at) {
      conflictIncoming.observed_at = incoming.observed_at;
    }

    const result = detectAndRecordConflict({
      path: c.field_path,
      existing,
      incoming: conflictIncoming,
    });

    if (result.status === "CONFLICTING") {
      setByPath(packObj, c.field_path, result.field);
      conflicts++;
      applied++;
      moduleDirt.add(c.field_path.split(".")[0]!);
      continue;
    }

    skipped++;
  }

  const written: string[] = [];
  if (opts?.write) {
    const root = join(resolveBrandsRoot(opts.brandsRoot), SLUG[brandId]);
    const fileMap: Record<string, string> = {
      identity: "IDENTITY.json",
      positioning: "POSITIONING.json",
      offerings: "OFFERINGS.json",
      audiences: "AUDIENCES.json",
      voice: "VOICE.json",
      visual: "VISUAL.json",
      channels: "CHANNELS.json",
      content_pillars: "CONTENT_PILLARS.json",
      claims: "CLAIMS.json",
      cta: "CTA.json",
      competitors: "COMPETITORS.json",
      learnings: "LEARNINGS.json",
      sources: "SOURCES.json",
    };
    for (const mod of moduleDirt) {
      const file = fileMap[mod];
      if (!file) continue;
      writeFileSync(join(root, file), JSON.stringify(packObj[mod], null, 2) + "\n");
      written.push(file);
    }
    const sourcesPath = join(root, "SOURCES.json");
    if (existsSync(sourcesPath)) {
      const sources = JSON.parse(readFileSync(sourcesPath, "utf8")) as {
        brand_id: string;
        module: string;
        updated_at: string;
        sources: Array<Record<string, unknown>>;
      };
      for (const c of kept.slice(0, 40)) {
        const id = `ev-${c.candidate_id}`;
        if (!sources.sources.some((s) => s.id === id)) {
          sources.sources.push({
            id,
            title: c.evidence_summary.slice(0, 120),
            source_type: c.source_type,
            reference: `${c.source_repository}:${c.relative_source_path}`,
            observed_at: c.observed_at,
            notes: c.status_reason,
          });
        }
      }
      sources.updated_at = new Date().toISOString();
      writeFileSync(sourcesPath, JSON.stringify(sources, null, 2) + "\n");
      written.push("SOURCES.json");
    }
  }

  return {
    applied,
    skipped,
    conflicts,
    rejected_placeholders: rejected.length + ledger.candidates.filter((c) => c.rejected).length,
    pack_paths_written: written,
  };
}

export function buildHumanReviewQueue(
  ledgers: EvidenceLedger[],
): ReturnType<typeof HumanReviewQueueSchema.parse> {
  const items: HumanReviewItem[] = [];
  let n = 0;
  for (const ledger of ledgers) {
    for (const c of ledger.candidates) {
      if (c.rejected || c.placeholder_filtered) continue;
      if (c.capability_claim_state && c.capability_claim_state !== "MARKETING_APPROVED") {
        items.push({
          review_id: `rev-${++n}`,
          brand_id: c.brand_id,
          action: "APPROVE_MARKETING_CLAIM",
          priority: "CRITICAL",
          field_path: c.field_path,
          candidate_value: c.candidate_value,
          question: `Approve marketing claim for ${c.field_path}? State=${c.capability_claim_state}.`,
          source_context: `${c.source_repository}/${c.relative_source_path} — ${c.evidence_summary}`,
          evidence_candidate_ids: [c.candidate_id],
        });
        continue;
      }
      items.push({
        review_id: `rev-${++n}`,
        brand_id: c.brand_id,
        action: "VERIFY",
        priority:
          c.field_path.includes("identity") ||
          c.field_path.includes("positioning") ||
          c.field_path.includes("claims")
            ? "CRITICAL"
            : "IMPORTANT",
        field_path: c.field_path,
        candidate_value: c.candidate_value,
        question: `Verify / optionally promote to VERIFIED: ${c.field_path}`,
        source_context: `${c.source_repository}/${c.relative_source_path} — ${c.evidence_summary}`,
        evidence_candidate_ids: [c.candidate_id],
      });
    }
  }
  return HumanReviewQueueSchema.parse({
    generated_at: new Date().toISOString(),
    items,
  });
}

export function writeReviewArtifacts(
  queue: ReturnType<typeof HumanReviewQueueSchema.parse>,
  outDir: string,
): void {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    join(outDir, "HUMAN_REVIEW_QUEUE.json"),
    JSON.stringify(queue, null, 2) + "\n",
  );
  const md = [
    "# Human Review Queue (Phase 2B)",
    "",
    `Generated: ${queue.generated_at}`,
    "",
    "| ID | Brand | Action | Priority | Field | Question |",
    "|----|-------|--------|----------|-------|----------|",
    ...queue.items.map(
      (i) =>
        `| ${i.review_id} | ${i.brand_id} | ${i.action} | ${i.priority} | \`${i.field_path}\` | ${i.question.replace(/\|/g, "/")} |`,
    ),
    "",
  ].join("\n");
  writeFileSync(join(outDir, "HUMAN_REVIEW_QUEUE.md"), md);
}

export function guardianReviewAllBrands(opts?: {
  brandsRoot?: string;
  audit?: AuditSink;
}): Record<BrandId, { passed: boolean; reasons: string[] }> {
  const out = {} as Record<BrandId, { passed: boolean; reasons: string[] }>;
  for (const id of ["LOTIN", "VILLA_GLORY", "NOX_FORM", "NOX_TECH"] as BrandId[]) {
    const pack = loadBrandPack(id, opts?.audit, {
      ...(opts?.brandsRoot ? { brandsRoot: opts.brandsRoot } : {}),
    });
    out[id] = verifyBrandIntelligence(pack, opts?.audit);
  }
  return out;
}

export { EvidenceLedgerSchema };
