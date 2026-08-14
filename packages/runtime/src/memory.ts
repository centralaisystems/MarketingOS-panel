import { randomUUID } from "node:crypto";
import {
  GLOBAL_MEMORY_PROMOTION_RULES,
  MarketingMemoryItemSchema,
  type BrandId,
  type MarketingMemoryItem,
  type MemoryScope,
  type MemoryTrustStatus,
} from "@marketing-os/contracts";
import type { AuditSink } from "./audit.js";
import { blockExecution } from "./audit.js";

export interface MemoryStore {
  createDraft(input: {
    brand_id: BrandId;
    observation: string;
    source: string;
    confidence: MarketingMemoryItem["confidence"];
    campaign_id?: string;
    evidence?: string[];
  }): MarketingMemoryItem;
  list(brand_id: BrandId): MarketingMemoryItem[];
  attemptPromoteToGlobal(input: {
    memory_id: string;
    operator_id: string;
    guardian_approved: boolean;
    human_approved: boolean;
  }): { ok: true; item: MarketingMemoryItem } | { ok: false; reason: string };
}

export class InMemoryMemoryStore implements MemoryStore {
  private items: MarketingMemoryItem[] = [];

  constructor(private audit: AuditSink) {}

  createDraft(input: {
    brand_id: BrandId;
    observation: string;
    source: string;
    confidence: MarketingMemoryItem["confidence"];
    campaign_id?: string;
    evidence?: string[];
  }): MarketingMemoryItem {
    const item = MarketingMemoryItemSchema.parse({
      memory_id: randomUUID(),
      scope: "BRAND" satisfies MemoryScope,
      trust_status: "DRAFT" satisfies MemoryTrustStatus,
      brand_id: input.brand_id,
      campaign_id: input.campaign_id,
      observation: input.observation,
      evidence: input.evidence ?? [],
      confidence: input.confidence,
      source: input.source,
      created_at: new Date().toISOString(),
      requires_guardian_review: false,
      requires_human_approval: false,
    });
    this.items.push(item);
    this.audit.append({
      brand_id: input.brand_id,
      event_type: "MEMORY_DRAFT_CREATED",
      message: `Draft brand memory created`,
      metadata: { memory_id: item.memory_id, scope: item.scope },
    });
    return item;
  }

  list(brand_id: BrandId): MarketingMemoryItem[] {
    return this.items.filter(
      (i) => i.brand_id === brand_id && i.scope === "BRAND",
    );
  }

  attemptPromoteToGlobal(input: {
    memory_id: string;
    operator_id: string;
    guardian_approved: boolean;
    human_approved: boolean;
  }): { ok: true; item: MarketingMemoryItem } | { ok: false; reason: string } {
    const item = this.items.find((i) => i.memory_id === input.memory_id);
    if (!item) return { ok: false, reason: "Memory not found" };

    if (GLOBAL_MEMORY_PROMOTION_RULES.auto_promote_to_global) {
      return { ok: false, reason: "Auto global promotion is disabled by policy" };
    }

    if (
      GLOBAL_MEMORY_PROMOTION_RULES.require_brand_guardian &&
      !input.guardian_approved
    ) {
      return { ok: false, reason: "Brand Guardian review required for global promotion" };
    }

    if (
      GLOBAL_MEMORY_PROMOTION_RULES.require_human_approval_level &&
      !input.human_approved
    ) {
    blockExecution(this.audit, {
      ...(item.brand_id ? { brand_id: item.brand_id } : {}),
      approval_level: "LEVEL_2",
      reason: "Global memory promotion requires human Level 2 approval",
    });
      return { ok: false, reason: "Human Level 2 approval required for global promotion" };
    }

    if (item.trust_status === "DRAFT") {
      return {
        ok: false,
        reason: "Memory must be at least REVIEWED before global promotion",
      };
    }

    // Phase 1: still block actual global write as external-ish policy action
    blockExecution(this.audit, {
      ...(item.brand_id ? { brand_id: item.brand_id } : {}),
      approval_level: "LEVEL_2",
      reason: "Phase 1 does not persist global memory promotions",
    });
    return {
      ok: false,
      reason: "Phase 1 blocks global memory promotion persistence",
    };
  }
}
