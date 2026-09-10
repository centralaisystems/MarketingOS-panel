import { describe, expect, it } from "vitest";
import {
  HiggsfieldGenerateJobSchema,
  HiggsfieldGenerateJobListSchema,
} from "@marketing-os/contracts";
import {
  HiggsfieldApiAdapter,
  HiggsfieldCredentialsMissingError,
  MemoryAssetCatalog,
  MemoryHiggsfieldGenerateJobStore,
  MemoryOpsStore,
  WAVE4_ASSET_IDS,
  createAssetCatalog,
  createDriveAssetSource,
  createHiggsfieldAdapter,
  detectApprovedStillGaps,
  driveAssetId,
  fillHiggsfieldGaps,
  handlePanelApi,
  higgsfieldGeneratedAssetId,
  listHiggsfieldGenerateJobs,
  resolveHiggsfieldBrief,
  syncBrandAssets,
  type PanelApiContext,
} from "@marketing-os/runtime";

function panelCtx(
  catalog = createAssetCatalog({ seedFixtures: true }),
  jobs = new MemoryHiggsfieldGenerateJobStore(),
): PanelApiContext {
  return {
    store: new MemoryOpsStore(),
    assets: catalog,
    drive: createDriveAssetSource({ mode: "fixture" }),
    higgsfield: createHiggsfieldAdapter({ mode: "fixture" }),
    higgsfieldJobs: jobs,
    writeReport: false,
  };
}

async function api(
  ctx: PanelApiContext,
  method: string,
  pathname: string,
  opts?: { query?: Record<string, string>; body?: unknown },
) {
  return handlePanelApi(
    {
      method,
      pathname,
      searchParams: new URLSearchParams(opts?.query ?? {}),
      ...(opts?.body !== undefined ? { body: opts.body } : {}),
    },
    ctx,
  );
}

describe("Higgsfield fill-gaps fixture — Villa Glory", () => {
  it("creates a generated catalog row when a usage/aspect gap exists", async () => {
    const catalog = new MemoryAssetCatalog();
    const jobs = new MemoryHiggsfieldGenerateJobStore();
    await syncBrandAssets({
      brand_id: "VILLA_GLORY",
      catalog,
      source: createDriveAssetSource({ mode: "fixture" }),
    });
    const living = driveAssetId("VILLA_GLORY", "vg-still-living-a");

    const job = await fillHiggsfieldGaps({
      brand_id: "VILLA_GLORY",
      source_asset_ids: [living],
      layout_brief: "Story still 9:16. No commercial claims.",
      catalog,
      jobs,
      adapter: createHiggsfieldAdapter({ mode: "fixture" }),
      now: "2026-09-10T13:00:00.000Z",
    });

    expect(job.brand_id).toBe("VILLA_GLORY");
    expect(job.source).toBe("fixture");
    expect(job.status).toBe("READY_FOR_OWNER_REVIEW");
    expect(job.gap.has_gap).toBe(true);
    expect(job.guardian.passed).toBe(true);
    expect(job.knowledge_status).toBe("UNVERIFIED");
    expect(job.provenance).toBe("GENERATED");
    expect(job.approval_status).toBe("DRAFT");
    expect(job.live_publish).toBe(false);
    expect(job.live_ads).toBe(false);
    expect(job.generated_asset_id).toBe(
      higgsfieldGeneratedAssetId("VILLA_GLORY", job.job_id),
    );
    expect(job.output?.aspect).toBe("9:16");
    expect(job.output?.usage_tag).toBe("story");
    expect(job.prompt?.text).toMatch(/VERIFIED pack fields/);
    expect(job.prompt?.text).not.toMatch(/is VERIFIED ROI|50% ROI/);
    expect(job.prompt?.forbidden_claims_note).toMatch(/ROI/);
    HiggsfieldGenerateJobSchema.parse(job);

    const generated = catalog.getMetadata("VILLA_GLORY", job.generated_asset_id!);
    expect(generated).toBeTruthy();
    expect(generated?.source).toBe("higgsfield");
    expect(generated?.folder_role).toBe("generated");
    expect(generated?.provenance).toBe("GENERATED");
    expect(generated?.knowledge_status).toBe("UNVERIFIED");
    expect(generated?.approval_status).toBe("DRAFT");
    expect(generated?.in_git).toBe(false);
    expect(generated?.storage_uri).toBe(`mos://higgsfield/VILLA_GLORY/${job.job_id}`);
    expect(generated?.metadata.aspect).toBe("9:16");
    expect(generated?.usage_tags).toContain("higgsfield");

    const listed = catalog.listMetadata("VILLA_GLORY", {
      source: "higgsfield",
      folder_role: "generated",
    });
    expect(listed).toHaveLength(1);
    expect(listed[0]?.asset_id).toBe(job.generated_asset_id);
  });

  it("skips generate when approved stills already cover the brief", async () => {
    const catalog = createAssetCatalog({ seedFixtures: true });
    const jobs = new MemoryHiggsfieldGenerateJobStore();
    const brief = resolveHiggsfieldBrief(
      "living-room interior still. No commercial claims.",
    );
    expect(brief.needed_usage_tags).toContain("living-room");
    expect(brief.needed_aspects).toEqual([]);

    const detected = detectApprovedStillGaps(catalog, "VILLA_GLORY", brief);
    expect(detected.has_gap).toBe(false);

    const job = await fillHiggsfieldGaps({
      brand_id: "VILLA_GLORY",
      layout_brief: "living-room interior still. No commercial claims.",
      catalog,
      jobs,
    });
    expect(job.status).toBe("SKIPPED_NO_GAP");
    expect(job.gap.has_gap).toBe(false);
    expect(job.generated_asset_id).toBeUndefined();
    expect(job.output).toBeUndefined();
    expect(catalog.listMetadata("VILLA_GLORY", { source: "higgsfield" })).toEqual([]);
  });

  it("does not let LOTIN generate or see Villa Glory Higgsfield jobs", async () => {
    const catalog = new MemoryAssetCatalog();
    const jobs = new MemoryHiggsfieldGenerateJobStore();
    await syncBrandAssets({
      brand_id: "VILLA_GLORY",
      catalog,
      source: createDriveAssetSource({ mode: "fixture" }),
    });
    const job = await fillHiggsfieldGaps({
      brand_id: "VILLA_GLORY",
      layout_brief: "Story still 9:16. No commercial claims.",
      catalog,
      jobs,
    });

    expect(jobs.list("LOTIN")).toEqual([]);
    expect(jobs.get("LOTIN", job.job_id)).toBeNull();
    expect(catalog.listMetadata("LOTIN", { source: "higgsfield" })).toEqual([]);
    expect(catalog.getMetadata("LOTIN", job.generated_asset_id!)).toBeNull();

    await expect(
      fillHiggsfieldGaps({
        brand_id: "LOTIN",
        source_asset_ids: [driveAssetId("VILLA_GLORY", "vg-still-living-a")],
        catalog,
        jobs,
      }),
    ).rejects.toThrow(/not found for LOTIN/);

    const lotinList = listHiggsfieldGenerateJobs({
      brand_id: "LOTIN",
      catalog,
      jobs,
    });
    expect(lotinList.jobs).toEqual([]);
    expect(lotinList.approved_stills.every((a) => a.brand_id === "LOTIN")).toBe(true);
    HiggsfieldGenerateJobListSchema.parse(lotinList);
  });

  it("keeps generated output UNVERIFIED when brand-kit is missing", async () => {
    const catalog = createAssetCatalog({ seedFixtures: true });
    const jobs = new MemoryHiggsfieldGenerateJobStore();
    const job = await fillHiggsfieldGaps({
      brand_id: "VILLA_GLORY",
      source_asset_ids: [WAVE4_ASSET_IDS.VG_LIVING_UNUSED_A],
      layout_brief: "Story still 9:16. No commercial claims.",
      catalog,
      jobs,
    });
    expect(job.status).toBe("GUARDIAN_REJECTED");
    expect(job.guardian.passed).toBe(false);
    expect(job.guardian.reasons.join(" ")).toMatch(/brand-kit metadata MISSING/);
    expect(job.knowledge_status).toBe("UNVERIFIED");
    expect(job.provenance).toBe("GENERATED");
    const generated = catalog.getMetadata("VILLA_GLORY", job.generated_asset_id!);
    expect(generated?.folder_role).toBe("generated");
    expect(generated?.approval_status).toBe("DRAFT");
  });

  it("does not require live Higgsfield credentials in fixture mode", () => {
    const adapter = createHiggsfieldAdapter({ mode: "fixture" });
    expect(adapter.mode).toBe("fixture");
    expect(() =>
      createHiggsfieldAdapter({ mode: "higgsfield_api", apiKey: "" }),
    ).toThrow(HiggsfieldCredentialsMissingError);
    expect(() => new HiggsfieldApiAdapter("", "https://platform.higgsfield.ai")).toThrow(
      /MOS_HIGGSFIELD_API_KEY/,
    );
  });
});

describe("Higgsfield fill-gaps panel", () => {
  it("fills Villa Glory gaps and denies LOTIN the job", async () => {
    const catalog = createAssetCatalog({ seedFixtures: true });
    const jobs = new MemoryHiggsfieldGenerateJobStore();
    const ctx = panelCtx(catalog, jobs);

    const sync = await api(ctx, "POST", "/api/drive-sync", {
      body: { brand_id: "VILLA_GLORY" },
    });
    expect(sync.status).toBe(200);

    const filled = await api(ctx, "POST", "/api/higgsfield-gaps", {
      body: {
        brand_id: "VILLA_GLORY",
        layout_brief: "Story still 9:16. No commercial claims.",
      },
    });
    expect(filled.status).toBe(200);
    const job = filled.body as {
      brand_id: string;
      job_id: string;
      generated_asset_id?: string;
      status: string;
      live_publish: boolean;
      live_ads: boolean;
      gap: { has_gap: boolean };
    };
    expect(job.brand_id).toBe("VILLA_GLORY");
    expect(job.status).toBe("READY_FOR_OWNER_REVIEW");
    expect(job.gap.has_gap).toBe(true);
    expect(job.live_publish).toBe(false);
    expect(job.live_ads).toBe(false);
    expect(job.generated_asset_id).toBeTruthy();

    const vgList = await api(ctx, "GET", "/api/higgsfield-gaps", {
      query: { brand_id: "VILLA_GLORY" },
    });
    expect(vgList.status).toBe(200);
    expect(
      (vgList.body as { jobs: Array<{ job_id: string }> }).jobs.some(
        (row) => row.job_id === job.job_id,
      ),
    ).toBe(true);

    const generated = await api(ctx, "GET", "/api/assets", {
      query: { brand_id: "VILLA_GLORY", source: "higgsfield" },
    });
    const vgGenerated = (
      generated.body as { assets: Array<{ asset_id: string; brand_id: string }> }
    ).assets;
    expect(vgGenerated.every((a) => a.brand_id === "VILLA_GLORY")).toBe(true);
    expect(vgGenerated.some((a) => a.asset_id === job.generated_asset_id)).toBe(true);

    const lotinJobs = await api(ctx, "GET", "/api/higgsfield-gaps", {
      query: { brand_id: "LOTIN" },
    });
    expect((lotinJobs.body as { jobs: unknown[] }).jobs).toEqual([]);

    const lotinGenerated = await api(ctx, "GET", "/api/assets", {
      query: { brand_id: "LOTIN", source: "higgsfield" },
    });
    expect((lotinGenerated.body as { assets: unknown[] }).assets).toEqual([]);

    const crossJob = await api(ctx, "GET", `/api/higgsfield-gaps/${job.job_id}`, {
      query: { brand_id: "LOTIN" },
    });
    expect(crossJob.status).toBe(404);

    const mismatch = await api(ctx, "POST", "/api/higgsfield-gaps", {
      query: { brand_id: "LOTIN" },
      body: { brand_id: "VILLA_GLORY", layout_brief: "Story still 9:16." },
    });
    expect(mismatch.status).toBe(403);
    expect((mismatch.body as { error: string }).error).toBe("CROSS_BRAND_DENIED");
  });

  it("lets owner review attach generated Higgsfield asset ids", async () => {
    const catalog = createAssetCatalog({ seedFixtures: true });
    const jobs = new MemoryHiggsfieldGenerateJobStore();
    const ctx = panelCtx(catalog, jobs);

    await api(ctx, "POST", "/api/drive-sync", {
      body: { brand_id: "VILLA_GLORY" },
    });
    const pack = await api(ctx, "POST", "/api/campaign-packs", {
      body: {
        brand_id: "VILLA_GLORY",
        objective: "Draft social plan for qualified enquiries",
      },
    });
    expect(pack.status).toBe(200);
    const campaign_id = (pack.body as { campaign_id: string }).campaign_id;

    const filled = await api(ctx, "POST", "/api/higgsfield-gaps", {
      body: {
        brand_id: "VILLA_GLORY",
        campaign_id,
        layout_brief: "Story still 9:16. No commercial claims.",
      },
    });
    expect(filled.status).toBe(200);
    const generated_asset_id = (filled.body as { generated_asset_id: string })
      .generated_asset_id;
    const job_id = (filled.body as { job_id: string }).job_id;

    const sent = await api(ctx, "POST", `/api/campaigns/${campaign_id}/owner-review`, {
      body: { brand_id: "VILLA_GLORY" },
    });
    expect(sent.status).toBe(200);
    const review = (
      sent.body as {
        review: {
          token: string;
          generated_asset_ids: string[];
          higgsfield_job_ids: string[];
        };
      }
    ).review;
    expect(review.generated_asset_ids).toContain(generated_asset_id);
    expect(review.higgsfield_job_ids).toContain(job_id);
    expect((sent.body as { outbox: { text_body: string } }).outbox.text_body).toMatch(
      /Higgsfield generated stills: 1/,
    );
    expect((sent.body as { outbox: { text_body: string } }).outbox.text_body).not.toMatch(
      /is VERIFIED|status: VERIFIED/,
    );

    const view = await api(ctx, "GET", "/api/owner-review", {
      query: { token: review.token },
    });
    expect(view.status).toBe(200);
    const packFields = (
      view.body as { pack: { generated_asset_ids: string[]; pack_id: string } }
    ).pack;
    expect(packFields.generated_asset_ids).toContain(generated_asset_id);
    expect((view.body as { live_publish: boolean }).live_publish).toBe(false);
  });

  it("returns SKIPPED_NO_GAP from the panel when coverage is sufficient", async () => {
    const catalog = createAssetCatalog({ seedFixtures: true });
    const ctx = panelCtx(catalog);
    const skipped = await api(ctx, "POST", "/api/higgsfield-gaps", {
      body: {
        brand_id: "VILLA_GLORY",
        layout_brief: "living-room interior still. No commercial claims.",
      },
    });
    expect(skipped.status).toBe(200);
    expect((skipped.body as { status: string }).status).toBe("SKIPPED_NO_GAP");
    expect((skipped.body as { generated_asset_id?: string }).generated_asset_id).toBeUndefined();
    const generated = await api(ctx, "GET", "/api/assets", {
      query: { brand_id: "VILLA_GLORY", source: "higgsfield" },
    });
    expect((generated.body as { assets: unknown[] }).assets).toEqual([]);
  });
});
