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
import { assertWaveEnabled, isWaveEnabled, loadPhaseGates } from "./phase-gates.js";
import { CrossBrandDeniedError, OpsAuditSink, type OpsStore } from "./ops-store.js";
import { decideInboxApproval, persistCampaignPack, persistDirectorRun } from "./ops-persist.js";
import {
  createAssetCatalog,
  type AssetCatalog,
  type AssetListFilter,
} from "./assets.js";
import { AnalyticsWriteBlockedError, readAnalyticsSnapshot } from "./analytics.js";
import {
  AiSearchWriteBlockedError,
  runAiSearchVisibilityCheck,
} from "./ai-visibility.js";
import {
  createDriveAssetSource,
  GoogleDriveCredentialsMissingError,
  type DriveAssetSource,
} from "./drive-source.js";
import { readDriveSyncStatus, syncBrandAssets } from "./drive-ingest.js";
import {
  DriveFolderRoleSchema,
  type EmailTemplateKind,
} from "@marketing-os/contracts";
import {
  resolveEmailMode,
  type EmailAdapter,
} from "./email-adapter.js";
import {
  decideOwnerReview,
  OwnerEmailDisabledError,
  OwnerEmailMissingError,
  OwnerReviewNotFoundError,
  publicOwnerReviewView,
  requestOwnerReview,
  sendOwnerProgressEmail,
} from "./owner-review.js";
import {
  createFigmaArrangeAdapter,
  FigmaCredentialsMissingError,
  FigmaLiveFileMissingError,
  type FigmaArrangeAdapter,
} from "./figma-adapter.js";
import {
  createFigmaArrangeJobStore,
  type FigmaArrangeJobStore,
} from "./figma-jobs.js";
import {
  arrangeInFigma,
  FigmaArrangeInputError,
  listFigmaArrangeJobs,
} from "./figma-arrange.js";

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
  assets?: AssetCatalog;
  drive?: DriveAssetSource;
  brandsRoot?: string;
  writeReport?: boolean;
  reportRoot?: string;
  email?: EmailAdapter;
  panelBaseUrl?: string;
  figma?: FigmaArrangeAdapter;
  figmaJobs?: FigmaArrangeJobStore;
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
          wave: isWaveEnabled("WAVE_4B_ASSET_PIPELINE", brandsRootOpt(ctx.brandsRoot))
            ? "WAVE_4B_ASSET_PIPELINE"
            : isWaveEnabled("WAVE_4_ANALYTICS_ASSETS", brandsRootOpt(ctx.brandsRoot))
              ? "WAVE_4_ANALYTICS_ASSETS"
              : "WAVE_3_DB_PANEL",
          enabled_waves: gates.enabled_waves,
          live_publish_allowed: gates.live_publish_allowed,
          live_ads_allowed: gates.live_ads_allowed,
          email_mode: resolveEmailMode(),
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
    if (method === "GET" && path === "/api/assets") {
      return listAssets(req, ctx);
    }
    const assetMatch = path.match(new RegExp(`^/api/assets/(${UUID_RE})$`));
    if (method === "GET" && assetMatch?.[1]) {
      return getAsset(req, ctx, assetMatch[1]);
    }
    if (method === "GET" && path === "/api/analytics") {
      return getAnalytics(req, ctx);
    }
    if (method === "GET" && path === "/api/ai-visibility") {
      return getAiVisibility(req, ctx);
    }
    if (method === "GET" && path === "/api/drive-sync") {
      return await getDriveSync(req, ctx);
    }
    if (method === "POST" && path === "/api/drive-sync") {
      return await postDriveSync(req, ctx);
    }
    if (method === "GET" && path === "/api/figma-arrange") {
      return getFigmaArrange(req, ctx);
    }
    const figmaJobMatch = path.match(new RegExp(`^/api/figma-arrange/(${UUID_RE})$`));
    if (method === "GET" && figmaJobMatch?.[1]) {
      return getFigmaArrangeJob(req, ctx, figmaJobMatch[1]);
    }
    if (method === "POST" && path === "/api/figma-arrange") {
      return await postFigmaArrange(req, ctx);
    }
    if (method === "GET" && path === "/api/owner-reviews") {
      return listOwnerReviews(req, ctx);
    }
    const ownerReviewIdMatch = path.match(
      new RegExp(`^/api/owner-reviews/(${UUID_RE})$`),
    );
    if (method === "GET" && ownerReviewIdMatch?.[1]) {
      return getOwnerReview(req, ctx, ownerReviewIdMatch[1]);
    }
    if (method === "POST" && path === "/api/owner-reviews") {
      return await postOwnerReview(req, ctx);
    }
    const sendReviewMatch = path.match(
      new RegExp(`^/api/campaigns/(${UUID_RE})/owner-review$`),
    );
    if (method === "POST" && sendReviewMatch?.[1]) {
      return await postCampaignOwnerReview(req, ctx, sendReviewMatch[1]);
    }
    if (method === "POST" && path === "/api/owner-reviews/digest") {
      return await postOwnerDigest(req, ctx);
    }
    if (method === "GET" && path === "/api/owner-review") {
      return getPublicOwnerReview(req, ctx);
    }
    if (method === "POST" && path === "/api/owner-review/decide") {
      return postOwnerDecision(req, ctx);
    }
    if (method === "GET" && path === "/api/email-outbox") {
      return listEmailOutbox(req, ctx);
    }
    if (
      method === "POST" &&
      (path === "/api/analytics" ||
        path === "/api/analytics/write" ||
        path === "/api/assets" ||
        path === "/api/ai-visibility" ||
        path === "/api/ai-visibility/probe")
    ) {
      return wave4WriteBlocked(path);
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

function wave4WriteBlocked(path: string): PanelResponse {
  const message =
    path.includes("analytics")
      ? "Analytics adapters are read-only. write_scopes is empty."
      : path.includes("assets")
        ? "Asset binaries stay out of Git. Metadata POST/upload is not enabled in Wave 4."
        : "AI search visibility is read-only. Live probes are not enabled.";
  return {
    status: 403,
    body: {
      error: "WAVE_4_READ_ONLY",
      message,
      write_scopes: [],
      live_publish: false,
      live_ads: false,
    },
  };
}

function requireAssets(ctx: PanelApiContext): AssetCatalog {
  if (!ctx.assets) {
    ctx.assets = createAssetCatalog({ backend: "memory", seedFixtures: true });
  }
  return ctx.assets;
}

function requireDrive(ctx: PanelApiContext): DriveAssetSource {
  if (!ctx.drive) {
    ctx.drive = createDriveAssetSource();
  }
  return ctx.drive;
}

async function getDriveSync(req: PanelRequest, ctx: PanelApiContext): Promise<PanelResponse> {
  assertWaveEnabled("WAVE_4B_ASSET_PIPELINE", brandsRootOpt(ctx.brandsRoot));
  const brand_id = requireBrandId(req.searchParams.get("brand_id"), ctx);
  const status = await readDriveSyncStatus({
    brand_id,
    catalog: requireAssets(ctx),
    source: requireDrive(ctx),
    ...brandsRootOpt(ctx.brandsRoot),
  });
  return { status: 200, body: status };
}

async function postDriveSync(req: PanelRequest, ctx: PanelApiContext): Promise<PanelResponse> {
  assertWaveEnabled("WAVE_4B_ASSET_PIPELINE", brandsRootOpt(ctx.brandsRoot));
  const brand_id = brandFromQueryOrBody(req, ctx);
  const result = await syncBrandAssets({
    brand_id,
    catalog: requireAssets(ctx),
    source: requireDrive(ctx),
    ...brandsRootOpt(ctx.brandsRoot),
  });
  return { status: 200, body: result };
}

function requireFigma(ctx: PanelApiContext): FigmaArrangeAdapter {
  if (!ctx.figma) {
    ctx.figma = createFigmaArrangeAdapter();
  }
  return ctx.figma;
}

function requireFigmaJobs(ctx: PanelApiContext): FigmaArrangeJobStore {
  if (!ctx.figmaJobs) {
    ctx.figmaJobs = createFigmaArrangeJobStore({ backend: "memory" });
  }
  return ctx.figmaJobs;
}

function getFigmaArrange(req: PanelRequest, ctx: PanelApiContext): PanelResponse {
  assertWaveEnabled("WAVE_4B_ASSET_PIPELINE", brandsRootOpt(ctx.brandsRoot));
  const brand_id = requireBrandId(req.searchParams.get("brand_id"), ctx);
  const list = listFigmaArrangeJobs({
    brand_id,
    catalog: requireAssets(ctx),
    jobs: requireFigmaJobs(ctx),
    adapter: requireFigma(ctx),
    ...brandsRootOpt(ctx.brandsRoot),
  });
  return { status: 200, body: list };
}

function getFigmaArrangeJob(
  req: PanelRequest,
  ctx: PanelApiContext,
  job_id: string,
): PanelResponse {
  assertWaveEnabled("WAVE_4B_ASSET_PIPELINE", brandsRootOpt(ctx.brandsRoot));
  const brand_id = requireBrandId(req.searchParams.get("brand_id"), ctx);
  const job = requireFigmaJobs(ctx).get(brand_id, job_id);
  if (!job) {
    return jsonError(404, "figma arrange job not found", { brand_id, job_id });
  }
  return { status: 200, body: job };
}

async function postFigmaArrange(
  req: PanelRequest,
  ctx: PanelApiContext,
): Promise<PanelResponse> {
  assertWaveEnabled("WAVE_4B_ASSET_PIPELINE", brandsRootOpt(ctx.brandsRoot));
  const brand_id = brandFromQueryOrBody(req, ctx);
  const body = asRecord(req.body);
  const rawIds = body.source_asset_ids;
  const source_asset_ids = Array.isArray(rawIds)
    ? rawIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
    : [];
  const campaign_id =
    typeof body.campaign_id === "string" && body.campaign_id.trim()
      ? body.campaign_id.trim()
      : undefined;
  const job = await arrangeInFigma({
    brand_id,
    source_asset_ids,
    layout_brief: body.layout_brief ?? body.brief,
    ...(campaign_id ? { campaign_id } : {}),
    catalog: requireAssets(ctx),
    jobs: requireFigmaJobs(ctx),
    adapter: requireFigma(ctx),
    store: ctx.store,
    ...brandsRootOpt(ctx.brandsRoot),
  });
  return {
    status: 200,
    body: {
      ...job,
      live_publish: false,
      live_ads: false,
    },
  };
}

function listAssets(req: PanelRequest, ctx: PanelApiContext): PanelResponse {
  assertWaveEnabled("WAVE_4_ANALYTICS_ASSETS", brandsRootOpt(ctx.brandsRoot));
  const brand_id = requireBrandId(req.searchParams.get("brand_id"), ctx);
  const catalog = requireAssets(ctx);
  const filter: AssetListFilter = {};
  const approval = req.searchParams.get("approval_status");
  if (approval === "DRAFT" || approval === "APPROVED" || approval === "ARCHIVED") {
    filter.approval_status = approval;
  }
  const kind = req.searchParams.get("kind");
  if (
    kind === "IMAGE" ||
    kind === "VIDEO" ||
    kind === "DOCUMENT" ||
    kind === "AUDIO" ||
    kind === "OTHER"
  ) {
    filter.kind = kind;
  }
  const tag = req.searchParams.get("usage_tag");
  if (tag) filter.usage_tags = [tag];
  const platform = req.searchParams.get("platform");
  if (platform) filter.platform = platform;
  if (req.searchParams.get("unused_only") === "true") {
    filter.unused_only = true;
  }
  const folderRole = req.searchParams.get("folder_role");
  if (folderRole) {
    const parsed = DriveFolderRoleSchema.safeParse(folderRole);
    if (parsed.success) filter.folder_role = parsed.data;
  }
  const source = req.searchParams.get("source");
  if (source === "catalog" || source === "drive" || source === "figma") {
    filter.source = source;
  }
  const assets = catalog.listMetadata(brand_id, filter);
  return {
    status: 200,
    body: {
      brand_id,
      write_scopes: [],
      stores_binaries_in_git: catalog.stores_binaries_in_git,
      assets,
    },
  };
}

function getAsset(
  req: PanelRequest,
  ctx: PanelApiContext,
  asset_id: string,
): PanelResponse {
  assertWaveEnabled("WAVE_4_ANALYTICS_ASSETS", brandsRootOpt(ctx.brandsRoot));
  const brand_id = requireBrandId(req.searchParams.get("brand_id"), ctx);
  const catalog = requireAssets(ctx);
  const asset = catalog.getMetadata(brand_id, asset_id);
  if (!asset) {
    return jsonError(404, "asset not found", { brand_id, asset_id });
  }
  return {
    status: 200,
    body: {
      ...asset,
      pointer: catalog.resolvePointer(brand_id, asset_id),
      usage: catalog.listUsage(brand_id, asset_id),
      write_scopes: [],
    },
  };
}

function getAnalytics(req: PanelRequest, ctx: PanelApiContext): PanelResponse {
  assertWaveEnabled("WAVE_4_ANALYTICS_ASSETS", brandsRootOpt(ctx.brandsRoot));
  const brand_id = requireBrandId(req.searchParams.get("brand_id"), ctx);
  const snapshot = readAnalyticsSnapshot(brand_id, brandsRootOpt(ctx.brandsRoot));
  return { status: 200, body: snapshot };
}

function getAiVisibility(req: PanelRequest, ctx: PanelApiContext): PanelResponse {
  assertWaveEnabled("WAVE_4_ANALYTICS_ASSETS", brandsRootOpt(ctx.brandsRoot));
  const brand_id = requireBrandId(req.searchParams.get("brand_id"), ctx);
  const report = runAiSearchVisibilityCheck(
    brand_id,
    brandsRootOpt(ctx.brandsRoot),
  );
  return { status: 200, body: report };
}

function mapError(e: unknown): PanelResponse {
  if (e instanceof AnalyticsWriteBlockedError || e instanceof AiSearchWriteBlockedError) {
    return jsonError(403, e.message, { write_scopes: [] });
  }
  if (e instanceof GoogleDriveCredentialsMissingError) {
    return jsonError(403, e.message, { source: "google_drive" });
  }
  if (e instanceof FigmaCredentialsMissingError || e instanceof FigmaLiveFileMissingError) {
    return jsonError(403, e.message, { source: "figma_api" });
  }
  if (e instanceof FigmaArrangeInputError) {
    return jsonError(400, e.message);
  }
  if (e instanceof OwnerEmailDisabledError || e instanceof OwnerEmailMissingError) {
    return jsonError(403, e.message, {
      brand_id: e.brand_id,
      owner_email_enabled: false,
    });
  }
  if (e instanceof OwnerReviewNotFoundError) {
    return jsonError(404, e.message);
  }
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
      : /Unknown brand_id|ARCHIVED|brand_id required|objective required|rationale required|note required|not found|not approvable|already /i.test(
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

function reviewRuntime(ctx: PanelApiContext) {
  return {
    store: ctx.store,
    ...(ctx.email ? { email: ctx.email } : {}),
    ...brandsRootOpt(ctx.brandsRoot),
    ...(ctx.panelBaseUrl ? { panelBaseUrl: ctx.panelBaseUrl } : {}),
    ...(ctx.figmaJobs ? { figmaJobs: ctx.figmaJobs } : {}),
  };
}

function listOwnerReviews(req: PanelRequest, ctx: PanelApiContext): PanelResponse {
  const brand_id = requireBrandId(req.searchParams.get("brand_id"), ctx);
  return {
    status: 200,
    body: {
      brand_id,
      reviews: ctx.store.listOwnerReviews(brand_id),
    },
  };
}

function getOwnerReview(
  req: PanelRequest,
  ctx: PanelApiContext,
  review_id: string,
): PanelResponse {
  const brand_id = requireBrandId(req.searchParams.get("brand_id"), ctx);
  const review = ctx.store.getOwnerReview(brand_id, review_id);
  if (!review) {
    return jsonError(404, "owner review not found", { brand_id, review_id });
  }
  return { status: 200, body: review };
}

async function postCampaignOwnerReview(
  req: PanelRequest,
  ctx: PanelApiContext,
  campaign_id: string,
): Promise<PanelResponse> {
  const brand_id = brandFromQueryOrBody(req, ctx);
  const actor =
    typeof asRecord(req.body).actor === "string" &&
    (asRecord(req.body).actor as string).trim()
      ? (asRecord(req.body).actor as string).trim()
      : "panel-operator";
  const result = await requestOwnerReview(
    { brand_id, campaign_id, actor, template: "MATERIALS_READY" },
    reviewRuntime(ctx),
  );
  return {
    status: 200,
    body: {
      brand_id,
      review: result.review,
      outbox: result.outbox,
      live_publish: false,
      live_ads: false,
    },
  };
}

async function postOwnerReview(
  req: PanelRequest,
  ctx: PanelApiContext,
): Promise<PanelResponse> {
  const body = asRecord(req.body);
  const brand_id = brandFromQueryOrBody(req, ctx);
  const template = body.template;
  if (template === "PROGRESS_DIGEST" || template === "ADS_PROGRESS_STUB") {
    const outbox = await sendOwnerProgressEmail(
      { brand_id, template: template as Extract<EmailTemplateKind, "PROGRESS_DIGEST" | "ADS_PROGRESS_STUB"> },
      reviewRuntime(ctx),
    );
    return {
      status: 200,
      body: { brand_id, outbox, live_publish: false, live_ads: false },
    };
  }
  const campaign_id =
    typeof body.campaign_id === "string" ? body.campaign_id.trim() : "";
  if (!campaign_id) {
    return jsonError(400, "campaign_id required for materials review");
  }
  return postCampaignOwnerReview(req, ctx, campaign_id);
}

async function postOwnerDigest(
  req: PanelRequest,
  ctx: PanelApiContext,
): Promise<PanelResponse> {
  const brand_id = brandFromQueryOrBody(req, ctx);
  const templateRaw = asRecord(req.body).template;
  const template =
    templateRaw === "ADS_PROGRESS_STUB" ? "ADS_PROGRESS_STUB" : "PROGRESS_DIGEST";
  const outbox = await sendOwnerProgressEmail(
    { brand_id, template },
    reviewRuntime(ctx),
  );
  return {
    status: 200,
    body: { brand_id, outbox, live_publish: false, live_ads: false },
  };
}

function getPublicOwnerReview(req: PanelRequest, ctx: PanelApiContext): PanelResponse {
  const token = req.searchParams.get("token") ?? "";
  if (!token.trim()) {
    return jsonError(400, "token required");
  }
  const view = publicOwnerReviewView(ctx.store, token, {
    ...brandsRootOpt(ctx.brandsRoot),
    ...(ctx.figmaJobs ? { figmaJobs: ctx.figmaJobs } : {}),
  });
  return { status: 200, body: view };
}

function postOwnerDecision(req: PanelRequest, ctx: PanelApiContext): PanelResponse {
  const body = asRecord(req.body);
  const token =
    typeof body.token === "string"
      ? body.token
      : req.searchParams.get("token") ?? "";
  if (!token.trim()) {
    return jsonError(400, "token required");
  }
  const decision = body.decision;
  if (decision !== "APPROVED" && decision !== "CHANGES_REQUESTED") {
    return jsonError(400, "decision must be APPROVED or CHANGES_REQUESTED");
  }
  const note = typeof body.note === "string" ? body.note : "";
  const actor =
    typeof body.actor === "string" && body.actor.trim()
      ? body.actor.trim()
      : "brand-owner";
  const brandHint =
    typeof body.brand_id === "string" && body.brand_id.trim()
      ? body.brand_id.trim()
      : undefined;
  const result = decideOwnerReview(
    {
      token,
      decision,
      note,
      actor,
      ...(brandHint ? { brand_id: brandHint } : {}),
    },
    reviewRuntime(ctx),
  );
  return {
    status: 200,
    body: {
      brand_id: result.review.brand_id,
      review: result.review,
      decision: result.decision,
      revision_task_id: result.revision_task_id ?? null,
      live_publish: false,
      live_ads: false,
    },
  };
}

function listEmailOutbox(req: PanelRequest, ctx: PanelApiContext): PanelResponse {
  const brand_id = requireBrandId(req.searchParams.get("brand_id"), ctx);
  return {
    status: 200,
    body: {
      brand_id,
      email_mode: ctx.email?.mode ?? resolveEmailMode(),
      items: ctx.store.listOutbox(brand_id),
    },
  };
}
