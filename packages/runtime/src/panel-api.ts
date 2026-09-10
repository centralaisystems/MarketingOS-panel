import {
  type BrandId,
  type BrandRegistryEntry,
  type PhaseGateState,
} from "@marketing-os/contracts";
import {
  assertRegisteredBrandId,
  brandsRootOpt,
  loadBrandRegistry,
} from "./brand-registry.js";
import { buildCampaignPack } from "./campaign-factory.js";
import { runMarketingDirector } from "./agents/director.js";
import { runBrandOnboarding } from "./onboarding.js";
import { assertWaveEnabled, loadPhaseGates } from "./phase-gates.js";
import { CrossBrandDeniedError, OpsAuditSink, type OpsStore } from "./ops-store.js";
import { decideInboxApproval, persistCampaignPack, persistDirectorRun } from "./ops-persist.js";

export type PanelRequest = {
  method: string;
  pathname: string;
  searchParams: URLSearchParams;
  body?: unknown;
};

export type PanelResponse = {
  status: number;
  body: unknown;
};

export type PanelApiContext = {
  store: OpsStore;
  brandsRoot?: string;
  writeReport?: boolean;
  reportRoot?: string;
};

const UUID_RE =
  "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";

function jsonError(status: number, error: string, extra?: Record<string, unknown>): PanelResponse {
  return { status, body: { error, ...extra } };
}

function asRecord(body: unknown): Record<string, unknown> {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  return {};
}

function requireBrandId(
  raw: unknown,
  ctx: PanelApiContext,
): BrandId {
  if (typeof raw !== "string" || !raw.trim()) {
    throw Object.assign(new Error("brand_id required"), { status: 400 });
  }
  return assertRegisteredBrandId(raw.trim(), brandsRootOpt(ctx.brandsRoot));
}

function brandFromQueryOrBody(
  req: PanelRequest,
  ctx: PanelApiContext,
): BrandId {
  const query = req.searchParams.get("brand_id");
  const body = asRecord(req.body).brand_id;
  if (query && typeof body === "string" && body.trim() && body.trim() !== query) {
    throw new CrossBrandDeniedError(query as BrandId, body.trim() as BrandId);
  }
  return requireBrandId(query ?? body, ctx);
}

function liveBlockedBody() {
  return {
    live_publish: false,
    live_ads: false,
    live_publish_allowed: false,
    live_ads_allowed: false,
    blocked: true,
    message:
      "Live publish and live ads stay OFF. Wave 5/6 gates plus explicit operator approval are required.",
  };
}

export async function handlePanelApi(
  req: PanelRequest,
  ctx: PanelApiContext,
): Promise<PanelResponse> {
  try {
    assertWaveEnabled("WAVE_3_DB_PANEL", brandsRootOpt(ctx.brandsRoot));
    const method = req.method.toUpperCase();
    const path = req.pathname;

    if (method === "GET" && path === "/api/health") {
      const gates = loadPhaseGates(brandsRootOpt(ctx.brandsRoot));
      return {
        status: 200,
        body: {
          ok: true,
          wave: "WAVE_3_DB_PANEL",
          live_publish_allowed: gates.live_publish_allowed,
          live_ads_allowed: gates.live_ads_allowed,
        },
      };
    }
    if (method === "GET" && path === "/api/brands") {
      return listBrands(ctx);
    }
    if (method === "GET" && path === "/api/gates") {
      return { status: 200, body: loadPhaseGates(brandsRootOpt(ctx.brandsRoot)) };
    }
    if (method === "GET" && path === "/api/readiness") {
      return readiness(req, ctx);
    }
    if (method === "GET" && path === "/api/campaigns") {
      return listCampaigns(req, ctx);
    }
    const campaignMatch = path.match(new RegExp(`^/api/campaigns/(${UUID_RE})$`));
    if (method === "GET" && campaignMatch?.[1]) {
      return getCampaign(req, ctx, campaignMatch[1]);
    }
    if (method === "POST" && (path === "/api/campaign-packs" || path === "/api/run-objective")) {
      if (path === "/api/run-objective") {
        const mode = asRecord(req.body).mode;
        if (mode !== "pack") {
          return runDirector(req, ctx);
        }
      }
      return runCampaignPack(req, ctx);
    }
    if (method === "POST" && path === "/api/director") {
      return runDirector(req, ctx);
    }
    if (method === "GET" && path === "/api/approvals") {
      return listApprovals(req, ctx);
    }
    const decideMatch = path.match(
      new RegExp(`^/api/approvals/(${UUID_RE})/decide$`),
    );
    if (method === "POST" && decideMatch?.[1]) {
      return decideApproval(req, ctx, decideMatch[1]);
    }
    if (method === "GET" && path === "/api/audit") {
      return listAudit(req, ctx);
    }
    if (method === "GET" && path === "/api/tasks") {
      return listTasks(req, ctx);
    }
    if (
      method === "POST" &&
      (path === "/api/publish" ||
        path === "/api/ads/launch" ||
        path === "/api/live-publish" ||
        path === "/api/live-ads")
    ) {
      return { status: 403, body: liveBlockedBody() };
    }

    return jsonError(404, "not found");
  } catch (e) {
    return mapError(e);
  }
}

function mapError(e: unknown): PanelResponse {
  if (e instanceof CrossBrandDeniedError) {
    return jsonError(403, "CROSS_BRAND_DENIED", {
      message: e.message,
      active_brand_id: e.active_brand_id,
      ...(e.foreign_brand_id ? { foreign_brand_id: e.foreign_brand_id } : {}),
    });
  }
  const message = e instanceof Error ? e.message : String(e);
  const status =
    e instanceof Error && "status" in e && typeof e.status === "number"
      ? e.status
      : /Unknown brand_id|ARCHIVED|brand_id required|objective required|rationale required|not found/i.test(
            message,
          )
        ? 400
        : /not enabled|blocked/i.test(message)
          ? 403
          : 400;
  return jsonError(status, message);
}

function listBrands(ctx: PanelApiContext): PanelResponse {
  const registry = loadBrandRegistry(brandsRootOpt(ctx.brandsRoot));
  const gates: PhaseGateState = loadPhaseGates(brandsRootOpt(ctx.brandsRoot));
  const brands: BrandRegistryEntry[] = registry.brands;
  return {
    status: 200,
    body: {
      brands,
      gates,
      live_publish_allowed: gates.live_publish_allowed,
      live_ads_allowed: gates.live_ads_allowed,
    },
  };
}

function readiness(req: PanelRequest, ctx: PanelApiContext): PanelResponse {
  const brand_id = requireBrandId(req.searchParams.get("brand_id"), ctx);
  const result = runBrandOnboarding(brand_id, {
    ...brandsRootOpt(ctx.brandsRoot),
    audit: new OpsAuditSink(ctx.store, brand_id),
  });
  const report = result.report;
  return {
    status: 200,
    body: {
      brand_id,
      readiness_status: report.readiness_status,
      overall_score: report.overall_score,
      onboarding_state: report.onboarding_state,
      guardian_passed: report.guardian_passed,
      guardian_reasons: report.guardian_reasons,
      critical_blockers: report.critical_blockers,
      verified_count: report.verified.length,
      missing: report.missing.slice(0, 12),
      unverified: report.unverified.slice(0, 12),
      conflicting: report.conflicting,
      stale: report.stale,
      next_actions: report.next_actions.slice(0, 8),
      areas: report.areas.map((a) => ({
        area: a.area,
        score: a.score,
        critical_blockers: a.critical_blockers,
      })),
    },
  };
}

function listCampaigns(req: PanelRequest, ctx: PanelApiContext): PanelResponse {
  const brand_id = requireBrandId(req.searchParams.get("brand_id"), ctx);
  return {
    status: 200,
    body: {
      brand_id,
      campaigns: ctx.store.listCampaigns(brand_id),
    },
  };
}

function getCampaign(
  req: PanelRequest,
  ctx: PanelApiContext,
  campaign_id: string,
): PanelResponse {
  const brand_id = requireBrandId(req.searchParams.get("brand_id"), ctx);
  const campaign = ctx.store.getCampaign(brand_id, campaign_id);
  if (!campaign) {
    return jsonError(404, "campaign not found", { brand_id, campaign_id });
  }
  return { status: 200, body: campaign };
}

function runCampaignPack(req: PanelRequest, ctx: PanelApiContext): PanelResponse {
  const body = asRecord(req.body);
  const brand_id = requireBrandId(body.brand_id, ctx);
  const objective = typeof body.objective === "string" ? body.objective.trim() : "";
  if (!objective) {
    return jsonError(400, "objective required");
  }
  const audit = new OpsAuditSink(ctx.store, brand_id);
  const pack = buildCampaignPack({
    brand_id,
    objective,
    requested_by: "panel-operator",
    audit,
    writeReport: ctx.writeReport !== false,
    ...brandsRootOpt(ctx.brandsRoot),
    ...(ctx.reportRoot ? { reportRoot: ctx.reportRoot } : {}),
  });
  const persisted = persistCampaignPack(ctx.store, pack, {
    requested_by: "panel-operator",
    ...brandsRootOpt(ctx.brandsRoot),
  });
  return {
    status: 200,
    body: {
      campaign_id: persisted.campaign.campaign_id,
      pack_id: pack.pack_id,
      brand_id: pack.brand_id,
      status: persisted.campaign.status,
      guardian: pack.guardian,
      approvable: pack.approvable,
      approval_id: persisted.approval?.approval_id ?? null,
      approval_level_cap: pack.approval_level_cap,
      live_publish: false,
      live_ads: false,
      objective: pack.objective,
    },
  };
}

function runDirector(req: PanelRequest, ctx: PanelApiContext): PanelResponse {
  const body = asRecord(req.body);
  const brand_id = requireBrandId(body.brand_id, ctx);
  const objective = typeof body.objective === "string" ? body.objective.trim() : "";
  if (!objective) {
    return jsonError(400, "objective required");
  }
  const audit = new OpsAuditSink(ctx.store, brand_id);
  const result = runMarketingDirector(
    {
      brand_id,
      objective,
      requested_by: "panel-operator",
      ...brandsRootOpt(ctx.brandsRoot),
    },
    audit,
  );
  const persisted = persistDirectorRun(ctx.store, result, brandsRootOpt(ctx.brandsRoot));
  return {
    status: 200,
    body: {
      brand_id: result.brand_id,
      task_id: result.root_task.task_id,
      workflow_state: result.root_task.workflow_state,
      requested_approval_level: result.requested_approval_level,
      execution_blocked: result.execution_blocked,
      block_reasons: result.block_reasons,
      guardian: result.guardian.map((g) => ({
        passed: g.passed,
        reasons: g.reasons,
      })),
      summary: result.consolidated.summary,
      approval_id: persisted.approval?.approval_id ?? null,
      live_publish: false,
      live_ads: false,
      external_side_effects: false,
    },
  };
}

function listApprovals(req: PanelRequest, ctx: PanelApiContext): PanelResponse {
  const brand_id = requireBrandId(req.searchParams.get("brand_id"), ctx);
  const includeAll = req.searchParams.get("include") === "all";
  return {
    status: 200,
    body: {
      brand_id,
      approvals: ctx.store.listApprovals(brand_id, { inboxOnly: !includeAll }),
    },
  };
}

function decideApproval(
  req: PanelRequest,
  ctx: PanelApiContext,
  approval_id: string,
): PanelResponse {
  const body = asRecord(req.body);
  const brand_id = brandFromQueryOrBody(req, ctx);
  const decision = body.decision;
  if (decision !== "APPROVED" && decision !== "REJECTED") {
    return jsonError(400, "decision must be APPROVED or REJECTED");
  }
  const rationale = typeof body.rationale === "string" ? body.rationale : "";
  const actor =
    typeof body.actor === "string" && body.actor.trim()
      ? body.actor.trim()
      : "panel-operator";
  const existing = ctx.store.getApproval(brand_id, approval_id);
  if (!existing) {
    return jsonError(404, "approval not found", { brand_id, approval_id });
  }
  const updated = decideInboxApproval(
    ctx.store,
    brand_id,
    approval_id,
    { decision, rationale, actor },
    brandsRootOpt(ctx.brandsRoot),
  );
  return {
    status: 200,
    body: {
      approval: updated,
      live_publish: false,
      live_ads: false,
    },
  };
}

function listAudit(req: PanelRequest, ctx: PanelApiContext): PanelResponse {
  const brand_id = requireBrandId(req.searchParams.get("brand_id"), ctx);
  return {
    status: 200,
    body: {
      brand_id,
      events: ctx.store.listAudit(brand_id),
    },
  };
}

function listTasks(req: PanelRequest, ctx: PanelApiContext): PanelResponse {
  const brand_id = requireBrandId(req.searchParams.get("brand_id"), ctx);
  return {
    status: 200,
    body: {
      brand_id,
      tasks: ctx.store.listTasks(brand_id),
    },
  };
}
