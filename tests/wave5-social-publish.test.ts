import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import {
  createAssetCatalog,
  dryRunSocialPublish,
  FileOpsStore,
  handlePanelApi,
  loadPhaseGates,
  MemoryOpsStore,
  WAVE4_ASSET_IDS,
  WAVE5_INSTAGRAM_CHANNEL,
  type PanelApiContext,
} from "@marketing-os/runtime";
import { SocialPublishOutboxRecordSchema } from "@marketing-os/contracts";

function ctx(store = new MemoryOpsStore()): PanelApiContext & { reportRoot: string } {
  const reportRoot = mkdtempSync(join(tmpdir(), "mos-wave5-"));
  return {
    store,
    assets: createAssetCatalog({ seedFixtures: true }),
    writeReport: false,
    reportRoot,
  };
}

async function api(
  c: PanelApiContext,
  method: string,
  pathname: string,
  opts?: { query?: Record<string, string>; body?: unknown },
) {
  const searchParams = new URLSearchParams(opts?.query ?? {});
  return handlePanelApi(
    {
      method,
      pathname,
      searchParams,
      ...(opts?.body !== undefined ? { body: opts.body } : {}),
    },
    c,
  );
}

async function villaApprovedPack(c: PanelApiContext) {
  const created = await api(c, "POST", "/api/campaign-packs", {
    body: {
      brand_id: "VILLA_GLORY",
      objective: "Draft social plan for qualified enquiries",
    },
  });
  expect(created.status).toBe(200);
  const pack = created.body as {
    campaign_id: string;
    pack_id: string;
    approval_id: string | null;
    approvable: boolean;
    guardian: { passed: boolean };
  };
  expect(pack.approvable).toBe(true);
  expect(pack.approval_id).toBeTruthy();
  const decided = await api(c, "POST", `/api/approvals/${pack.approval_id}/decide`, {
    body: {
      brand_id: "VILLA_GLORY",
      decision: "APPROVED",
      rationale: "Internal Level 1 approve for dry-run schedule test",
    },
  });
  expect(decided.status).toBe(200);
  return pack;
}

describe("Wave 5 gated social publish", () => {
  const temps: string[] = [];
  afterEach(() => {
    for (const dir of temps) {
      rmSync(dir, { recursive: true, force: true });
    }
    temps.length = 0;
  });

  it("enables WAVE_5 dry-run planning while live_publish_allowed stays false", () => {
    const gates = loadPhaseGates();
    expect(gates.enabled_waves).toContain("WAVE_5_SOCIAL_PUBLISH");
    expect(gates.enabled_waves).toContain("WAVE_6_PAID_ADS");
    expect(gates.live_publish_allowed).toBe(false);
    expect(gates.live_ads_allowed).toBe(false);
    expect(WAVE5_INSTAGRAM_CHANNEL.brand_id).toBe("VILLA_GLORY");
    expect(WAVE5_INSTAGRAM_CHANNEL.channel).toBe("INSTAGRAM");
    expect(WAVE5_INSTAGRAM_CHANNEL.write_scopes).toEqual([]);
    expect(WAVE5_INSTAGRAM_CHANNEL.live_credentials_required).toBe(false);

    const simple = dryRunSocialPublish({
      brand_id: "VILLA_GLORY",
      channel: "INSTAGRAM",
      caption: "Internal dry-run caption only",
      dry_run: true,
    });
    expect(simple.status).toBe("DRY_RUN_OK");
    expect(simple.would_publish).toBe(true);
  });

  it("records a Villa Glory Instagram dry-run in the outbox and audit", async () => {
    const c = ctx();
    temps.push(c.reportRoot);
    const pack = await villaApprovedPack(c);

    const calendar = await api(c, "GET", "/api/publish/calendar", {
      query: { brand_id: "VILLA_GLORY", campaign_id: pack.campaign_id },
    });
    expect(calendar.status).toBe(200);
    const eligible = calendar.body as {
      brand_id: string;
      live_publish_allowed: boolean;
      items: Array<{
        campaign_id: string;
        calendar: Array<{ key: string; caption: string }>;
        suggested_asset_ids: string[];
      }>;
    };
    expect(eligible.brand_id).toBe("VILLA_GLORY");
    expect(eligible.live_publish_allowed).toBe(false);
    expect(eligible.items[0]?.calendar.length).toBeGreaterThan(0);
    const item = eligible.items[0]!.calendar[0]!;

    const scheduled = await api(c, "POST", "/api/publish/dry-run", {
      body: {
        brand_id: "VILLA_GLORY",
        campaign_id: pack.campaign_id,
        calendar_item_key: item.key,
        asset_ids: [WAVE4_ASSET_IDS.VG_LIVING_UNUSED_A],
        actor: "panel-operator",
        rationale: "Approve and schedule dry-run for Villa Glory Instagram",
      },
    });
    expect(scheduled.status).toBe(200);
    const body = scheduled.body as {
      brand_id: string;
      status: string;
      dry_run: boolean;
      would_publish: boolean;
      live_publish: boolean;
      external_side_effects: boolean;
      outbox: {
        outbox_id: string;
        channel: string;
        status: string;
        caption: string;
        intended_payload: { media_uris: string[]; adapter: string };
      };
    };
    expect(body.brand_id).toBe("VILLA_GLORY");
    expect(body.status).toBe("DRY_RUN_OK");
    expect(body.dry_run).toBe(true);
    expect(body.would_publish).toBe(true);
    expect(body.live_publish).toBe(false);
    expect(body.external_side_effects).toBe(false);
    expect(body.outbox.channel).toBe("INSTAGRAM");
    expect(body.outbox.status).toBe("DRY_RUN_RECORDED");
    expect(body.outbox.caption.length).toBeGreaterThan(0);
    expect(body.outbox.intended_payload.adapter).toBe("instagram_graph_dry_run");
    expect(body.outbox.intended_payload.media_uris[0]).toMatch(/^mos:\/\//);
    expect(SocialPublishOutboxRecordSchema.parse(body.outbox).live_publish).toBe(
      false,
    );

    const outbox = await api(c, "GET", "/api/publish/outbox", {
      query: { brand_id: "VILLA_GLORY" },
    });
    expect(outbox.status).toBe(200);
    const items = (outbox.body as { items: Array<{ outbox_id: string }> }).items;
    expect(items.some((row) => row.outbox_id === body.outbox.outbox_id)).toBe(
      true,
    );

    const audit = await api(c, "GET", "/api/audit", {
      query: { brand_id: "VILLA_GLORY" },
    });
    const events = (audit.body as { events: Array<{ event_type: string }> })
      .events;
    expect(events.some((e) => e.event_type === "SOCIAL_PUBLISH_DRY_RUN")).toBe(
      true,
    );
  });

  it("denies cross-brand dry-run and hides Villa Glory outbox from LOTIN", async () => {
    const c = ctx();
    temps.push(c.reportRoot);
    const pack = await villaApprovedPack(c);
    const calendar = await api(c, "GET", "/api/publish/calendar", {
      query: { brand_id: "VILLA_GLORY", campaign_id: pack.campaign_id },
    });
    const item = (
      calendar.body as {
        items: Array<{ calendar: Array<{ key: string }> }>;
      }
    ).items[0]!.calendar[0]!;

    const scheduled = await api(c, "POST", "/api/publish/dry-run", {
      body: {
        brand_id: "VILLA_GLORY",
        campaign_id: pack.campaign_id,
        calendar_item_key: item.key,
        rationale: "Villa Glory dry-run only",
      },
    });
    expect(scheduled.status).toBe(200);

    const lotinCalendar = await api(c, "GET", "/api/publish/calendar", {
      query: { brand_id: "LOTIN" },
    });
    expect(lotinCalendar.status).toBe(200);
    expect(
      (lotinCalendar.body as { items: unknown[] }).items,
    ).toEqual([]);

    const lotinOutbox = await api(c, "GET", "/api/publish/outbox", {
      query: { brand_id: "LOTIN" },
    });
    expect((lotinOutbox.body as { items: unknown[] }).items).toEqual([]);

    const cross = await api(c, "POST", "/api/publish/dry-run", {
      body: {
        brand_id: "LOTIN",
        campaign_id: pack.campaign_id,
        calendar_item_key: item.key,
        rationale: "should be denied",
      },
    });
    expect(cross.status).toBeGreaterThanOrEqual(400);
    expect((cross.body as { error: string }).error).toMatch(
      /not found|CROSS_BRAND|denied/i,
    );
  });

  it("blocks live fire with 403 even after Level 2 approval row", async () => {
    const c = ctx();
    temps.push(c.reportRoot);
    const pack = await villaApprovedPack(c);
    c.store.insertApproval("VILLA_GLORY", {
      approval_id: randomUUID(),
      brand_id: "VILLA_GLORY",
      campaign_id: pack.campaign_id,
      level: "LEVEL_2",
      decision: "APPROVED",
      rationale: "Level 2 recorded; live still gated",
      actor: "approver",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const live = await api(c, "POST", "/api/publish", {
      body: {
        brand_id: "VILLA_GLORY",
        campaign_id: pack.campaign_id,
        live: true,
      },
    });
    expect(live.status).toBe(403);
    const body = live.body as {
      live_publish: boolean;
      blocked: boolean;
      message: string;
    };
    expect(body.live_publish).toBe(false);
    expect(body.blocked).toBe(true);
    expect(body.message).toMatch(/live_publish_allowed is false/i);
    expect(body.message).toMatch(/MOS_LIVE_PUBLISH/i);

    const audit = await api(c, "GET", "/api/audit", {
      query: { brand_id: "VILLA_GLORY" },
    });
    expect(
      (audit.body as { events: Array<{ event_type: string }> }).events.some(
        (e) => e.event_type === "SOCIAL_PUBLISH_LIVE_BLOCKED",
      ),
    ).toBe(true);
  });

  it("rejects packs that are not internally approved and unapproved assets", async () => {
    const c = ctx();
    temps.push(c.reportRoot);
    const created = await api(c, "POST", "/api/campaign-packs", {
      body: {
        brand_id: "VILLA_GLORY",
        objective: "Draft social plan for qualified enquiries",
      },
    });
    expect(created.status).toBe(200);
    const pack = created.body as { campaign_id: string };

    const tooEarly = await api(c, "POST", "/api/publish/dry-run", {
      body: {
        brand_id: "VILLA_GLORY",
        campaign_id: pack.campaign_id,
        calendar_item_key: "Mon",
        rationale: "should fail before Level 1 approve",
      },
    });
    expect(tooEarly.status).toBe(400);
    expect((tooEarly.body as { error: string }).error).toMatch(
      /INTERNAL_APPROVED/,
    );

    const approved = await villaApprovedPack(c);
    const calendar = await api(c, "GET", "/api/publish/calendar", {
      query: { brand_id: "VILLA_GLORY", campaign_id: approved.campaign_id },
    });
    const item = (
      calendar.body as {
        items: Array<{ calendar: Array<{ key: string }> }>;
      }
    ).items[0]!.calendar[0]!;

    const draftAsset = await api(c, "POST", "/api/publish/dry-run", {
      body: {
        brand_id: "VILLA_GLORY",
        campaign_id: approved.campaign_id,
        calendar_item_key: item.key,
        asset_ids: [WAVE4_ASSET_IDS.VG_BEDROOM_DRAFT],
        rationale: "draft asset must be rejected",
      },
    });
    expect(draftAsset.status).toBe(400);
    expect((draftAsset.body as { error: string }).error).toMatch(/APPROVED/);
  });

  it("round-trips social outbox in the file store without leaking brands", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mos-wave5-ops-"));
    temps.push(dir);
    const store = new FileOpsStore(dir);
    const c = ctx(store);
    temps.push(c.reportRoot);
    const pack = await villaApprovedPack(c);
    const calendar = await api(c, "GET", "/api/publish/calendar", {
      query: { brand_id: "VILLA_GLORY", campaign_id: pack.campaign_id },
    });
    const item = (
      calendar.body as {
        items: Array<{ calendar: Array<{ key: string }> }>;
      }
    ).items[0]!.calendar[0]!;
    const scheduled = await api(c, "POST", "/api/publish/dry-run", {
      body: {
        brand_id: "VILLA_GLORY",
        campaign_id: pack.campaign_id,
        calendar_item_key: item.key,
        rationale: "file store dry-run",
      },
    });
    expect(scheduled.status).toBe(200);

    const reloaded = new FileOpsStore(dir);
    expect(reloaded.listSocialOutbox("VILLA_GLORY")).toHaveLength(1);
    expect(reloaded.listSocialOutbox("LOTIN")).toHaveLength(0);
  });
});
