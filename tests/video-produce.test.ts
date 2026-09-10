import { describe, expect, it } from "vitest";
import {
  VideoProduceJobSchema,
  VideoProduceJobListSchema,
} from "@marketing-os/contracts";
import {
  AdobePremiereVideoProducerStub,
  CapCutVideoProducerStub,
  MemoryAssetCatalog,
  MemoryHiggsfieldGenerateJobStore,
  MemoryOpsStore,
  MemoryVideoProduceJobStore,
  WAVE4_ASSET_IDS,
  createAssetCatalog,
  createDriveAssetSource,
  createHiggsfieldAdapter,
  createVideoProducerAdapter,
  driveAssetId,
  fillHiggsfieldGaps,
  handlePanelApi,
  listVideoProduceJobs,
  produceVideoPackage,
  syncBrandAssets,
  videoPackageAssetId,
  type PanelApiContext,
} from "@marketing-os/runtime";

function panelCtx(
  catalog = createAssetCatalog({ seedFixtures: true }),
  jobs = new MemoryVideoProduceJobStore(),
  higgsfieldJobs = new MemoryHiggsfieldGenerateJobStore(),
): PanelApiContext {
  return {
    store: new MemoryOpsStore(),
    assets: catalog,
    drive: createDriveAssetSource({ mode: "fixture" }),
    higgsfield: createHiggsfieldAdapter({ mode: "fixture" }),
    higgsfieldJobs,
    video: createVideoProducerAdapter({ mode: "fixture" }),
    videoJobs: jobs,
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

describe("Video produce fixture — Villa Glory", () => {
  it("creates a video package metadata row linked to approved stills", async () => {
    const catalog = new MemoryAssetCatalog();
    const jobs = new MemoryVideoProduceJobStore();
    await syncBrandAssets({
      brand_id: "VILLA_GLORY",
      catalog,
      source: createDriveAssetSource({ mode: "fixture" }),
    });
    const living = driveAssetId("VILLA_GLORY", "vg-still-living-a");
    const terrace = driveAssetId("VILLA_GLORY", "vg-still-terrace");

    const job = await produceVideoPackage({
      brand_id: "VILLA_GLORY",
      source_asset_ids: [living, terrace],
      brief: "Reel from approved stills. No commercial claims.",
      target_format: "reel",
      catalog,
      jobs,
      adapter: createVideoProducerAdapter({ mode: "fixture" }),
      now: "2026-09-10T14:00:00.000Z",
    });

    expect(job.brand_id).toBe("VILLA_GLORY");
    expect(job.source).toBe("fixture");
    expect(job.status).toBe("READY_FOR_OWNER_REVIEW");
    expect(job.target_format).toBe("reel");
    expect(job.guardian.passed).toBe(true);
    expect(job.knowledge_status).toBe("UNVERIFIED");
    expect(job.provenance).toBe("GENERATED");
    expect(job.approval_status).toBe("DRAFT");
    expect(job.live_publish).toBe(false);
    expect(job.live_ads).toBe(false);
    expect(job.generated_asset_id).toBe(
      videoPackageAssetId("VILLA_GLORY", job.job_id),
    );
    expect(job.approved_still_ids).toEqual([living, terrace]);
    expect(job.output.package_kind).toBe("export_package");
    expect(job.output.rendered_video).toBe(false);
    expect(job.output.desktop_control).toBe(false);
    expect(job.output.published).toBe(false);
    expect(job.output.aspect).toBe("9:16");
    expect(job.output.timeline.map((c) => c.asset_id)).toEqual([living, terrace]);
    expect(job.output.captions.every((c) => c.knowledge_status === "VERIFIED")).toBe(
      true,
    );
    expect(job.output.captions.some((c) => c.source_field === "voice.tone")).toBe(
      true,
    );
    expect(job.output.captions.map((c) => c.text).join(" ")).not.toMatch(
      /is VERIFIED ROI|50% ROI/,
    );
    expect(job.message).toMatch(/not rendered|recipe only/i);
    VideoProduceJobSchema.parse(job);

    const packaged = catalog.getMetadata("VILLA_GLORY", job.generated_asset_id);
    expect(packaged).toBeTruthy();
    expect(packaged?.source).toBe("video");
    expect(packaged?.folder_role).toBe("generated");
    expect(packaged?.provenance).toBe("GENERATED");
    expect(packaged?.knowledge_status).toBe("UNVERIFIED");
    expect(packaged?.approval_status).toBe("DRAFT");
    expect(packaged?.kind).toBe("DOCUMENT");
    expect(packaged?.in_git).toBe(false);
    expect(packaged?.storage_uri).toBe(`mos://video/VILLA_GLORY/${job.job_id}`);
    expect(packaged?.metadata.rendered_video).toBe(false);
    expect(packaged?.metadata.published).toBe(false);
    expect(packaged?.metadata.approved_still_ids).toEqual([living, terrace]);
    expect(packaged?.usage_tags).toContain("video-package");

    const listed = catalog.listMetadata("VILLA_GLORY", {
      source: "video",
      folder_role: "generated",
    });
    expect(listed).toHaveLength(1);
    expect(listed[0]?.asset_id).toBe(job.generated_asset_id);
  });

  it("can assemble a Guardian-ready Higgsfield still into the package", async () => {
    const catalog = new MemoryAssetCatalog();
    const videoJobs = new MemoryVideoProduceJobStore();
    const higgsfieldJobs = new MemoryHiggsfieldGenerateJobStore();
    await syncBrandAssets({
      brand_id: "VILLA_GLORY",
      catalog,
      source: createDriveAssetSource({ mode: "fixture" }),
    });
    const living = driveAssetId("VILLA_GLORY", "vg-still-living-a");
    const generated = await fillHiggsfieldGaps({
      brand_id: "VILLA_GLORY",
      source_asset_ids: [living],
      layout_brief: "Story still 9:16. No commercial claims.",
      catalog,
      jobs: higgsfieldJobs,
      adapter: createHiggsfieldAdapter({ mode: "fixture" }),
    });
    expect(generated.status).toBe("READY_FOR_OWNER_REVIEW");
    expect(generated.generated_asset_id).toBeTruthy();

    const job = await produceVideoPackage({
      brand_id: "VILLA_GLORY",
      source_asset_ids: [living],
      generated_asset_ids: [generated.generated_asset_id!],
      brief: "Story from approved + generated stills. No commercial claims.",
      target_format: "story",
      catalog,
      jobs: videoJobs,
      higgsfieldJobs,
    });
    expect(job.status).toBe("READY_FOR_OWNER_REVIEW");
    expect(job.generated_asset_ids).toContain(generated.generated_asset_id);
    expect(job.output.timeline.some((c) => c.role === "generated_still")).toBe(true);
  });

  it("rejects raw-inbox and Guardian-rejected generated stills", async () => {
    const catalog = new MemoryAssetCatalog();
    const videoJobs = new MemoryVideoProduceJobStore();
    await syncBrandAssets({
      brand_id: "VILLA_GLORY",
      catalog,
      source: createDriveAssetSource({ mode: "fixture" }),
    });
    await expect(
      produceVideoPackage({
        brand_id: "VILLA_GLORY",
        source_asset_ids: [driveAssetId("VILLA_GLORY", "vg-inbox-drop")],
        catalog,
        jobs: videoJobs,
      }),
    ).rejects.toThrow(/raw-inbox/);

    const seed = createAssetCatalog({ seedFixtures: true });
    const higgsfieldJobs = new MemoryHiggsfieldGenerateJobStore();
    const rejected = await fillHiggsfieldGaps({
      brand_id: "VILLA_GLORY",
      source_asset_ids: [WAVE4_ASSET_IDS.VG_LIVING_UNUSED_A],
      layout_brief: "Story still 9:16. No commercial claims.",
      catalog: seed,
      jobs: higgsfieldJobs,
    });
    expect(rejected.status).toBe("GUARDIAN_REJECTED");
    await expect(
      produceVideoPackage({
        brand_id: "VILLA_GLORY",
        generated_asset_ids: [rejected.generated_asset_id!],
        catalog: seed,
        jobs: videoJobs,
        higgsfieldJobs,
      }),
    ).rejects.toThrow(/Guardian-ready|Guardian/);
  });

  it("does not let LOTIN produce or see Villa Glory video packages", async () => {
    const catalog = new MemoryAssetCatalog();
    const jobs = new MemoryVideoProduceJobStore();
    await syncBrandAssets({
      brand_id: "VILLA_GLORY",
      catalog,
      source: createDriveAssetSource({ mode: "fixture" }),
    });
    const job = await produceVideoPackage({
      brand_id: "VILLA_GLORY",
      brief: "Reel from approved stills. No commercial claims.",
      catalog,
      jobs,
    });

    expect(jobs.list("LOTIN")).toEqual([]);
    expect(jobs.get("LOTIN", job.job_id)).toBeNull();
    expect(catalog.listMetadata("LOTIN", { source: "video" })).toEqual([]);
    expect(catalog.getMetadata("LOTIN", job.generated_asset_id)).toBeNull();

    await expect(
      produceVideoPackage({
        brand_id: "LOTIN",
        source_asset_ids: [driveAssetId("VILLA_GLORY", "vg-still-living-a")],
        catalog,
        jobs,
      }),
    ).rejects.toThrow(/not found for LOTIN/);

    const lotinList = listVideoProduceJobs({
      brand_id: "LOTIN",
      catalog,
      jobs,
    });
    expect(lotinList.jobs).toEqual([]);
    expect(lotinList.approved_stills.every((a) => a.brand_id === "LOTIN")).toBe(true);
    VideoProduceJobListSchema.parse(lotinList);
  });

  it("keeps package UNVERIFIED when brand-kit is missing", async () => {
    const catalog = createAssetCatalog({ seedFixtures: true });
    const jobs = new MemoryVideoProduceJobStore();
    const job = await produceVideoPackage({
      brand_id: "VILLA_GLORY",
      source_asset_ids: [WAVE4_ASSET_IDS.VG_LIVING_UNUSED_A],
      brief: "Reel from approved stills. No commercial claims.",
      catalog,
      jobs,
    });
    expect(job.status).toBe("GUARDIAN_REJECTED");
    expect(job.guardian.passed).toBe(false);
    expect(job.guardian.reasons.join(" ")).toMatch(/brand-kit metadata MISSING/);
    expect(job.knowledge_status).toBe("UNVERIFIED");
    expect(job.provenance).toBe("GENERATED");
    const packaged = catalog.getMetadata("VILLA_GLORY", job.generated_asset_id);
    expect(packaged?.folder_role).toBe("generated");
    expect(packaged?.approval_status).toBe("DRAFT");
    expect(packaged?.metadata.rendered_video).toBe(false);
  });

  it("labels CapCut / Adobe stubs as export packages without requiring desktop software", async () => {
    const fixture = createVideoProducerAdapter({ mode: "fixture" });
    expect(fixture.mode).toBe("fixture");
    const capcut = createVideoProducerAdapter({ mode: "capcut" });
    expect(capcut).toBeInstanceOf(CapCutVideoProducerStub);
    expect(capcut.mode).toBe("capcut");
    const adobe = createVideoProducerAdapter({ mode: "adobe_premiere" });
    expect(adobe).toBeInstanceOf(AdobePremiereVideoProducerStub);
    expect(adobe.mode).toBe("adobe_premiere");

    const catalog = new MemoryAssetCatalog();
    const jobs = new MemoryVideoProduceJobStore();
    await syncBrandAssets({
      brand_id: "VILLA_GLORY",
      catalog,
      source: createDriveAssetSource({ mode: "fixture" }),
    });
    const job = await produceVideoPackage({
      brand_id: "VILLA_GLORY",
      catalog,
      jobs,
      adapter: capcut,
    });
    expect(job.source).toBe("capcut");
    expect(job.output.desktop_control).toBe(false);
    expect(job.output.rendered_video).toBe(false);
    expect(job.output.import_hint).toMatch(/does not control the CapCut desktop/i);
  });
});

describe("Video produce panel", () => {
  it("produces a Villa Glory package and denies LOTIN the job", async () => {
    const catalog = createAssetCatalog({ seedFixtures: true });
    const jobs = new MemoryVideoProduceJobStore();
    const ctx = panelCtx(catalog, jobs);

    const sync = await api(ctx, "POST", "/api/drive-sync", {
      body: { brand_id: "VILLA_GLORY" },
    });
    expect(sync.status).toBe(200);

    const produced = await api(ctx, "POST", "/api/video-packages", {
      body: {
        brand_id: "VILLA_GLORY",
        brief: "Reel from approved stills. No commercial claims.",
        target_format: "reel",
      },
    });
    expect(produced.status).toBe(200);
    const job = produced.body as {
      brand_id: string;
      job_id: string;
      generated_asset_id: string;
      status: string;
      live_publish: boolean;
      live_ads: boolean;
      output: { rendered_video: boolean; published: boolean };
    };
    expect(job.brand_id).toBe("VILLA_GLORY");
    expect(job.status).toBe("READY_FOR_OWNER_REVIEW");
    expect(job.live_publish).toBe(false);
    expect(job.live_ads).toBe(false);
    expect(job.output.rendered_video).toBe(false);
    expect(job.output.published).toBe(false);
    expect(job.generated_asset_id).toBeTruthy();

    const vgList = await api(ctx, "GET", "/api/video-packages", {
      query: { brand_id: "VILLA_GLORY" },
    });
    expect(vgList.status).toBe(200);
    expect(
      (vgList.body as { jobs: Array<{ job_id: string }> }).jobs.some(
        (row) => row.job_id === job.job_id,
      ),
    ).toBe(true);

    const generated = await api(ctx, "GET", "/api/assets", {
      query: { brand_id: "VILLA_GLORY", source: "video" },
    });
    const vgGenerated = (
      generated.body as { assets: Array<{ asset_id: string; brand_id: string }> }
    ).assets;
    expect(vgGenerated.every((a) => a.brand_id === "VILLA_GLORY")).toBe(true);
    expect(vgGenerated.some((a) => a.asset_id === job.generated_asset_id)).toBe(true);

    const lotinJobs = await api(ctx, "GET", "/api/video-packages", {
      query: { brand_id: "LOTIN" },
    });
    expect((lotinJobs.body as { jobs: unknown[] }).jobs).toEqual([]);

    const lotinGenerated = await api(ctx, "GET", "/api/assets", {
      query: { brand_id: "LOTIN", source: "video" },
    });
    expect((lotinGenerated.body as { assets: unknown[] }).assets).toEqual([]);

    const crossJob = await api(ctx, "GET", `/api/video-packages/${job.job_id}`, {
      query: { brand_id: "LOTIN" },
    });
    expect(crossJob.status).toBe(404);

    const mismatch = await api(ctx, "POST", "/api/video-packages", {
      query: { brand_id: "LOTIN" },
      body: { brand_id: "VILLA_GLORY", brief: "Reel from approved stills." },
    });
    expect(mismatch.status).toBe(403);
    expect((mismatch.body as { error: string }).error).toBe("CROSS_BRAND_DENIED");
  });

  it("lets owner review attach video job and output asset ids", async () => {
    const catalog = createAssetCatalog({ seedFixtures: true });
    const jobs = new MemoryVideoProduceJobStore();
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

    const produced = await api(ctx, "POST", "/api/video-packages", {
      body: {
        brand_id: "VILLA_GLORY",
        campaign_id,
        brief: "Reel from approved stills. No commercial claims.",
        target_format: "reel",
      },
    });
    expect(produced.status).toBe(200);
    const generated_asset_id = (produced.body as { generated_asset_id: string })
      .generated_asset_id;
    const job_id = (produced.body as { job_id: string }).job_id;

    const sent = await api(ctx, "POST", `/api/campaigns/${campaign_id}/owner-review`, {
      body: { brand_id: "VILLA_GLORY" },
    });
    expect(sent.status).toBe(200);
    const review = (
      sent.body as {
        review: {
          token: string;
          video_asset_ids: string[];
          video_job_ids: string[];
        };
      }
    ).review;
    expect(review.video_asset_ids).toContain(generated_asset_id);
    expect(review.video_job_ids).toContain(job_id);
    expect((sent.body as { outbox: { text_body: string } }).outbox.text_body).toMatch(
      /Video export packages: 1/,
    );
    expect((sent.body as { outbox: { text_body: string } }).outbox.text_body).not.toMatch(
      /is VERIFIED|status: VERIFIED/,
    );
    expect((sent.body as { outbox: { text_body: string } }).outbox.text_body).not.toMatch(
      /uploaded to Instagram/i,
    );

    const view = await api(ctx, "GET", "/api/owner-review", {
      query: { token: review.token },
    });
    expect(view.status).toBe(200);
    const packFields = (
      view.body as { pack: { video_asset_ids: string[]; pack_id: string } }
    ).pack;
    expect(packFields.video_asset_ids).toContain(generated_asset_id);
    expect((view.body as { live_publish: boolean }).live_publish).toBe(false);
  });
});
