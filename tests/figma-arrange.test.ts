import { describe, expect, it } from "vitest";
import {
  FigmaArrangeJobSchema,
  FigmaArrangeJobListSchema,
} from "@marketing-os/contracts";
import {
  FigmaApiArrangeAdapter,
  FigmaCredentialsMissingError,
  MemoryAssetCatalog,
  MemoryFigmaArrangeJobStore,
  MemoryOpsStore,
  WAVE4_ASSET_IDS,
  arrangeInFigma,
  createAssetCatalog,
  createDriveAssetSource,
  createFigmaArrangeAdapter,
  driveAssetId,
  figmaGeneratedAssetId,
  handlePanelApi,
  listFigmaArrangeJobs,
  syncBrandAssets,
  type PanelApiContext,
} from "@marketing-os/runtime";

function panelCtx(
  catalog = createAssetCatalog({ seedFixtures: true }),
  jobs = new MemoryFigmaArrangeJobStore(),
): PanelApiContext {
  return {
    store: new MemoryOpsStore(),
    assets: catalog,
    drive: createDriveAssetSource({ mode: "fixture" }),
    figma: createFigmaArrangeAdapter({ mode: "fixture" }),
    figmaJobs: jobs,
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

describe("Figma arrange fixture — Villa Glory", () => {
  it("creates a generated catalog row linked to approved stills", async () => {
    const catalog = new MemoryAssetCatalog();
    const jobs = new MemoryFigmaArrangeJobStore();
    await syncBrandAssets({
      brand_id: "VILLA_GLORY",
      catalog,
      source: createDriveAssetSource({ mode: "fixture" }),
    });
    const living = driveAssetId("VILLA_GLORY", "vg-still-living-a");
    const terrace = driveAssetId("VILLA_GLORY", "vg-still-terrace");

    const job = await arrangeInFigma({
      brand_id: "VILLA_GLORY",
      source_asset_ids: [living, terrace],
      layout_brief: "Instagram grid from approved stills + brand-kit. No commercial claims.",
      catalog,
      jobs,
      adapter: createFigmaArrangeAdapter({ mode: "fixture" }),
      now: "2026-09-10T12:00:00.000Z",
    });

    expect(job.brand_id).toBe("VILLA_GLORY");
    expect(job.source).toBe("fixture");
    expect(job.status).toBe("READY_FOR_OWNER_REVIEW");
    expect(job.guardian.passed).toBe(true);
    expect(job.knowledge_status).toBe("UNVERIFIED");
    expect(job.provenance).toBe("GENERATED");
    expect(job.approval_status).toBe("DRAFT");
    expect(job.live_publish).toBe(false);
    expect(job.live_ads).toBe(false);
    expect(job.source_asset_ids).toEqual([living, terrace]);
    expect(job.brand_kit_asset_ids.length).toBeGreaterThan(0);
    expect(job.generated_asset_id).toBe(
      figmaGeneratedAssetId("VILLA_GLORY", job.job_id),
    );
    expect(job.output.file_key).toBe("fixture-villa-glory-arrange");
    expect(job.output.file_url).toContain("figma.com/design/fixture-villa-glory-arrange");
    expect(job.output.template_id).toBe("villa-glory-instagram-grid");
    FigmaArrangeJobSchema.parse(job);

    const generated = catalog.getMetadata("VILLA_GLORY", job.generated_asset_id);
    expect(generated).toBeTruthy();
    expect(generated?.source).toBe("figma");
    expect(generated?.folder_role).toBe("generated");
    expect(generated?.provenance).toBe("GENERATED");
    expect(generated?.knowledge_status).toBe("UNVERIFIED");
    expect(generated?.approval_status).toBe("DRAFT");
    expect(generated?.in_git).toBe(false);
    expect(generated?.storage_uri).toBe(`mos://figma/VILLA_GLORY/${job.job_id}`);
    expect(generated?.metadata.source_asset_ids).toEqual([living, terrace]);
    expect(generated?.metadata.figma_file_url).toBe(job.output.file_url);
    expect(generated?.metadata.figma_node_url).toBe(job.output.node_url);

    const listed = catalog.listMetadata("VILLA_GLORY", {
      source: "figma",
      folder_role: "generated",
    });
    expect(listed).toHaveLength(1);
    expect(listed[0]?.asset_id).toBe(job.generated_asset_id);
  });

  it("does not let LOTIN arrange or see Villa Glory Figma jobs", async () => {
    const catalog = new MemoryAssetCatalog();
    const jobs = new MemoryFigmaArrangeJobStore();
    await syncBrandAssets({
      brand_id: "VILLA_GLORY",
      catalog,
      source: createDriveAssetSource({ mode: "fixture" }),
    });
    const living = driveAssetId("VILLA_GLORY", "vg-still-living-a");
    const job = await arrangeInFigma({
      brand_id: "VILLA_GLORY",
      source_asset_ids: [living],
      catalog,
      jobs,
    });

    expect(jobs.list("LOTIN")).toEqual([]);
    expect(jobs.get("LOTIN", job.job_id)).toBeNull();
    expect(catalog.listMetadata("LOTIN", { source: "figma" })).toEqual([]);
    expect(catalog.getMetadata("LOTIN", job.generated_asset_id)).toBeNull();

    await expect(
      arrangeInFigma({
        brand_id: "LOTIN",
        source_asset_ids: [living],
        catalog,
        jobs,
      }),
    ).rejects.toThrow(/not found for LOTIN/);

    const lotinList = listFigmaArrangeJobs({
      brand_id: "LOTIN",
      catalog,
      jobs,
    });
    expect(lotinList.jobs).toEqual([]);
    expect(lotinList.approved_stills.every((a) => a.brand_id === "LOTIN")).toBe(true);
    FigmaArrangeJobListSchema.parse(lotinList);
  });

  it("keeps generated output UNVERIFIED when brand-kit is missing", async () => {
    const catalog = createAssetCatalog({ seedFixtures: true });
    const jobs = new MemoryFigmaArrangeJobStore();
    const job = await arrangeInFigma({
      brand_id: "VILLA_GLORY",
      source_asset_ids: [WAVE4_ASSET_IDS.VG_LIVING_UNUSED_A],
      catalog,
      jobs,
    });
    expect(job.status).toBe("GUARDIAN_REJECTED");
    expect(job.guardian.passed).toBe(false);
    expect(job.guardian.reasons.join(" ")).toMatch(/brand-kit metadata MISSING/);
    expect(job.knowledge_status).toBe("UNVERIFIED");
    expect(job.provenance).toBe("GENERATED");
    const generated = catalog.getMetadata("VILLA_GLORY", job.generated_asset_id);
    expect(generated?.folder_role).toBe("generated");
    expect(generated?.approval_status).toBe("DRAFT");
  });

  it("does not require live Figma credentials in fixture mode", () => {
    const adapter = createFigmaArrangeAdapter({ mode: "fixture" });
    expect(adapter.mode).toBe("fixture");
    expect(() => createFigmaArrangeAdapter({ mode: "figma_api", accessToken: "" })).toThrow(
      FigmaCredentialsMissingError,
    );
    expect(
      () => new FigmaApiArrangeAdapter("token-only", ""),
    ).toThrow(/MOS_FIGMA_FILE_KEY/);
  });
});

describe("Figma arrange panel", () => {
  it("arranges Villa Glory stills and denies LOTIN the job", async () => {
    const catalog = createAssetCatalog({ seedFixtures: true });
    const jobs = new MemoryFigmaArrangeJobStore();
    const ctx = panelCtx(catalog, jobs);

    const sync = await api(ctx, "POST", "/api/drive-sync", {
      body: { brand_id: "VILLA_GLORY" },
    });
    expect(sync.status).toBe(200);

    const living = driveAssetId("VILLA_GLORY", "vg-still-living-a");
    const arranged = await api(ctx, "POST", "/api/figma-arrange", {
      body: {
        brand_id: "VILLA_GLORY",
        source_asset_ids: [living],
        layout_brief: "Story frame from terrace-ready stills. No commercial claims.",
      },
    });
    expect(arranged.status).toBe(200);
    const job = arranged.body as {
      brand_id: string;
      job_id: string;
      generated_asset_id: string;
      status: string;
      live_publish: boolean;
      live_ads: boolean;
      output: { template_id: string };
    };
    expect(job.brand_id).toBe("VILLA_GLORY");
    expect(job.status).toBe("READY_FOR_OWNER_REVIEW");
    expect(job.live_publish).toBe(false);
    expect(job.live_ads).toBe(false);
    expect(job.output.template_id).toBe("villa-glory-story");

    const vgList = await api(ctx, "GET", "/api/figma-arrange", {
      query: { brand_id: "VILLA_GLORY" },
    });
    expect(vgList.status).toBe(200);
    expect(
      (vgList.body as { jobs: Array<{ job_id: string }> }).jobs.some(
        (row) => row.job_id === job.job_id,
      ),
    ).toBe(true);

    const generated = await api(ctx, "GET", "/api/assets", {
      query: { brand_id: "VILLA_GLORY", source: "figma" },
    });
    const vgGenerated = (
      generated.body as { assets: Array<{ asset_id: string; brand_id: string }> }
    ).assets;
    expect(vgGenerated.every((a) => a.brand_id === "VILLA_GLORY")).toBe(true);
    expect(vgGenerated.some((a) => a.asset_id === job.generated_asset_id)).toBe(true);

    const lotinJobs = await api(ctx, "GET", "/api/figma-arrange", {
      query: { brand_id: "LOTIN" },
    });
    expect((lotinJobs.body as { jobs: unknown[] }).jobs).toEqual([]);

    const lotinGenerated = await api(ctx, "GET", "/api/assets", {
      query: { brand_id: "LOTIN", source: "figma" },
    });
    expect((lotinGenerated.body as { assets: unknown[] }).assets).toEqual([]);

    const crossJob = await api(ctx, "GET", `/api/figma-arrange/${job.job_id}`, {
      query: { brand_id: "LOTIN" },
    });
    expect(crossJob.status).toBe(404);

    const mismatch = await api(ctx, "POST", "/api/figma-arrange", {
      query: { brand_id: "LOTIN" },
      body: { brand_id: "VILLA_GLORY", source_asset_ids: [living] },
    });
    expect(mismatch.status).toBe(403);
    expect((mismatch.body as { error: string }).error).toBe("CROSS_BRAND_DENIED");
  });

  it("lets owner review attach arranged asset ids without breaking the loop", async () => {
    const catalog = createAssetCatalog({ seedFixtures: true });
    const jobs = new MemoryFigmaArrangeJobStore();
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

    const living = driveAssetId("VILLA_GLORY", "vg-still-living-a");
    const arranged = await api(ctx, "POST", "/api/figma-arrange", {
      body: {
        brand_id: "VILLA_GLORY",
        campaign_id,
        source_asset_ids: [living],
        layout_brief: "Pack layout from approved stills. No commercial claims.",
      },
    });
    expect(arranged.status).toBe(200);
    const generated_asset_id = (arranged.body as { generated_asset_id: string })
      .generated_asset_id;
    const job_id = (arranged.body as { job_id: string }).job_id;

    const sent = await api(ctx, "POST", `/api/campaigns/${campaign_id}/owner-review`, {
      body: { brand_id: "VILLA_GLORY" },
    });
    expect(sent.status).toBe(200);
    const review = (
      sent.body as {
        review: {
          token: string;
          arranged_asset_ids: string[];
          figma_job_ids: string[];
        };
      }
    ).review;
    expect(review.arranged_asset_ids).toContain(generated_asset_id);
    expect(review.figma_job_ids).toContain(job_id);
    expect((sent.body as { outbox: { text_body: string } }).outbox.text_body).toMatch(
      /Arranged Figma assets: 1/,
    );
    expect((sent.body as { outbox: { text_body: string } }).outbox.text_body).not.toMatch(
      /is VERIFIED|status: VERIFIED/,
    );

    const view = await api(ctx, "GET", "/api/owner-review", {
      query: { token: review.token },
    });
    expect(view.status).toBe(200);
    const packFields = (view.body as { pack: { arranged_asset_ids: string[]; pack_id: string } })
      .pack;
    expect(packFields.arranged_asset_ids).toContain(generated_asset_id);
    expect((view.body as { live_publish: boolean }).live_publish).toBe(false);
  });
});
