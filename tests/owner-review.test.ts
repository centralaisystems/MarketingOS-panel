import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  DryRunEmailAdapter,
  FileOpsStore,
  handlePanelApi,
  MemoryOpsStore,
  type PanelApiContext,
} from "@marketing-os/runtime";
import {
  EmailOutboxItemSchema,
  OwnerReviewDecisionSchema,
  OwnerReviewRequestSchema,
} from "@marketing-os/contracts";

function ctx(store = new MemoryOpsStore()): PanelApiContext & { reportRoot: string } {
  const reportRoot = mkdtempSync(join(tmpdir(), "mos-owner-review-"));
  return {
    store,
    email: new DryRunEmailAdapter(),
    writeReport: false,
    reportRoot,
    panelBaseUrl: "http://127.0.0.1:8787",
  };
}

async function api(
  ctx: PanelApiContext,
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
    ctx,
  );
}

async function villaPack(c: PanelApiContext) {
  const created = await api(c, "POST", "/api/campaign-packs", {
    body: {
      brand_id: "VILLA_GLORY",
      objective: "Draft social plan for qualified enquiries",
    },
  });
  expect(created.status).toBe(200);
  return created.body as {
    brand_id: string;
    campaign_id: string;
    pack_id: string;
    approvable: boolean;
    approval_id: string | null;
    guardian: { passed: boolean };
    live_publish: boolean;
    live_ads: boolean;
  };
}

describe("Owner Review Loop", () => {
  const temps: string[] = [];
  afterEach(() => {
    for (const dir of temps) {
      rmSync(dir, { recursive: true, force: true });
    }
    temps.length = 0;
  });

  it("records a Villa Glory materials-ready email in the dry-run outbox", async () => {
    const c = ctx();
    temps.push(c.reportRoot);
    const pack = await villaPack(c);
    expect(pack.live_publish).toBe(false);
    expect(pack.live_ads).toBe(false);
    expect(pack.approvable).toBe(true);

    const sent = await api(c, "POST", `/api/campaigns/${pack.campaign_id}/owner-review`, {
      body: { brand_id: "VILLA_GLORY" },
    });
    expect(sent.status).toBe(200);
    const body = sent.body as {
      brand_id: string;
      review: { token: string; review_url: string; status: string };
      outbox: {
        template: string;
        mode: string;
        status: string;
        to: string[];
        subject: string;
        text_body: string;
        live_publish: boolean;
        live_ads: boolean;
      };
    };
    expect(body.brand_id).toBe("VILLA_GLORY");
    expect(body.review.status).toBe("PENDING");
    expect(body.outbox.template).toBe("MATERIALS_READY");
    expect(body.outbox.mode).toBe("dry_run");
    expect(body.outbox.status).toBe("RECORDED");
    expect(body.outbox.to).toEqual(["villa-glory-owner@example.test"]);
    expect(body.outbox.subject).toMatch(/Materials ready for review/i);
    expect(body.outbox.text_body).toContain(pack.pack_id);
    expect(body.outbox.text_body).toMatch(/Live publish: OFF/);
    expect(body.outbox.text_body).toMatch(/not live spend/i);
    expect(body.outbox.text_body).toMatch(/pack\/approval fields only/i);
    expect(body.outbox.text_body).not.toMatch(/is VERIFIED|status: VERIFIED/);
    expect(body.outbox.live_publish).toBe(false);
    expect(body.outbox.live_ads).toBe(false);
    expect(body.review.review_url).toContain("/owner-review?token=");

    const outbox = await api(c, "GET", "/api/email-outbox", {
      query: { brand_id: "VILLA_GLORY" },
    });
    const items = (outbox.body as { items: Array<{ template: string; brand_id: string }> })
      .items;
    expect(items).toHaveLength(1);
    expect(items[0]?.template).toBe("MATERIALS_READY");
    expect(items[0]?.brand_id).toBe("VILLA_GLORY");
  });

  it("creates a Level-1 revision task with the owner note on request-changes", async () => {
    const c = ctx();
    temps.push(c.reportRoot);
    const pack = await villaPack(c);
    const sent = await api(c, "POST", `/api/campaigns/${pack.campaign_id}/owner-review`, {
      body: { brand_id: "VILLA_GLORY" },
    });
    const token = (sent.body as { review: { token: string } }).review.token;
    const note = "Please soften the living-room caption and drop the price mention.";

    const decided = await api(c, "POST", "/api/owner-review/decide", {
      body: {
        token,
        decision: "CHANGES_REQUESTED",
        note,
        actor: "villa-glory-owner@example.test",
      },
    });
    expect(decided.status).toBe(200);
    const body = decided.body as {
      revision_task_id: string;
      decision: { note: string; decision: string };
      review: { status: string; brand_id: string };
    };
    expect(body.review.brand_id).toBe("VILLA_GLORY");
    expect(body.review.status).toBe("CHANGES_REQUESTED");
    expect(body.decision.decision).toBe("CHANGES_REQUESTED");
    expect(body.decision.note).toBe(note);
    expect(body.revision_task_id).toMatch(
      /^[0-9a-f-]{36}$/i,
    );

    const tasks = await api(c, "GET", "/api/tasks", {
      query: { brand_id: "VILLA_GLORY" },
    });
    const revision = (
      tasks.body as {
        tasks: Array<{
          task_id: string;
          brand_id: string;
          approval_level: string;
          objective: string;
          input: { owner_note?: string };
        }>;
      }
    ).tasks.find((t) => t.task_id === body.revision_task_id);
    expect(revision).toBeTruthy();
    expect(revision?.brand_id).toBe("VILLA_GLORY");
    expect(revision?.approval_level).toBe("LEVEL_1");
    expect(revision?.input.owner_note).toBe(note);
    expect(revision?.objective).toContain(note);

    const campaign = await api(c, "GET", `/api/campaigns/${pack.campaign_id}`, {
      query: { brand_id: "VILLA_GLORY" },
    });
    expect((campaign.body as { status: string }).status).toBe("CHANGES_REQUESTED");
  });

  it("marks the Level-1 approval when the owner approves", async () => {
    const c = ctx();
    temps.push(c.reportRoot);
    const pack = await villaPack(c);
    expect(pack.approval_id).toBeTruthy();
    const sent = await api(c, "POST", `/api/campaigns/${pack.campaign_id}/owner-review`, {
      body: { brand_id: "VILLA_GLORY" },
    });
    const token = (sent.body as { review: { token: string } }).review.token;

    const decided = await api(c, "POST", "/api/owner-review/decide", {
      body: { token, decision: "APPROVED", note: "Looks good for internal drafts." },
    });
    expect(decided.status).toBe(200);

    const approvals = await api(c, "GET", "/api/approvals", {
      query: { brand_id: "VILLA_GLORY", include: "all" },
    });
    const row = (
      approvals.body as {
        approvals: Array<{ approval_id: string; decision: string; brand_id: string }>;
      }
    ).approvals.find((a) => a.approval_id === pack.approval_id);
    expect(row?.brand_id).toBe("VILLA_GLORY");
    expect(row?.decision).toBe("APPROVED");

    const campaign = await api(c, "GET", `/api/campaigns/${pack.campaign_id}`, {
      query: { brand_id: "VILLA_GLORY" },
    });
    expect((campaign.body as { status: string }).status).toBe("INTERNAL_APPROVED");
  });

  it("does not leak Villa Glory reviews or outbox to LOTIN", async () => {
    const c = ctx();
    temps.push(c.reportRoot);
    const pack = await villaPack(c);
    const sent = await api(c, "POST", `/api/campaigns/${pack.campaign_id}/owner-review`, {
      body: { brand_id: "VILLA_GLORY" },
    });
    const review = (sent.body as { review: { review_id: string; token: string } }).review;

    const lotinOutbox = await api(c, "GET", "/api/email-outbox", {
      query: { brand_id: "LOTIN" },
    });
    expect((lotinOutbox.body as { items: unknown[] }).items).toEqual([]);

    const lotinReviews = await api(c, "GET", "/api/owner-reviews", {
      query: { brand_id: "LOTIN" },
    });
    expect((lotinReviews.body as { reviews: unknown[] }).reviews).toEqual([]);

    const crossGet = await api(c, "GET", `/api/owner-reviews/${review.review_id}`, {
      query: { brand_id: "LOTIN" },
    });
    expect(crossGet.status).toBe(404);

    const crossDecide = await api(c, "POST", "/api/owner-review/decide", {
      body: {
        token: review.token,
        brand_id: "LOTIN",
        decision: "APPROVED",
      },
    });
    expect(crossDecide.status).toBe(403);
    expect((crossDecide.body as { error: string }).error).toBe("CROSS_BRAND_DENIED");

    const lotinSend = await api(c, "POST", "/api/owner-reviews/digest", {
      body: { brand_id: "LOTIN", template: "PROGRESS_DIGEST" },
    });
    expect(lotinSend.status).toBe(403);
    expect((lotinSend.body as { error: string }).error).toMatch(/disabled|owner_email/i);
  });

  it("rejects request-changes without a note and keeps live flags off", async () => {
    const c = ctx();
    temps.push(c.reportRoot);
    const pack = await villaPack(c);
    const sent = await api(c, "POST", `/api/campaigns/${pack.campaign_id}/owner-review`, {
      body: { brand_id: "VILLA_GLORY" },
    });
    const token = (sent.body as { review: { token: string } }).review.token;
    const missing = await api(c, "POST", "/api/owner-review/decide", {
      body: { token, decision: "CHANGES_REQUESTED", note: "   " },
    });
    expect(missing.status).toBe(400);
    expect((missing.body as { error: string }).error).toMatch(/note required/);

    const publicView = await api(c, "GET", "/api/owner-review", {
      query: { token },
    });
    expect(publicView.status).toBe(200);
    const view = publicView.body as {
      brand_id: string;
      live_publish: boolean;
      live_ads: boolean;
      pack: { pack_id: string };
    };
    expect(view.brand_id).toBe("VILLA_GLORY");
    expect(view.live_publish).toBe(false);
    expect(view.live_ads).toBe(false);
    expect(view.pack.pack_id).toBe(pack.pack_id);
  });

  it("records an ads-progress stub that is not live spend", async () => {
    const c = ctx();
    temps.push(c.reportRoot);
    const sent = await api(c, "POST", "/api/owner-reviews", {
      body: { brand_id: "VILLA_GLORY", template: "ADS_PROGRESS_STUB" },
    });
    expect(sent.status).toBe(200);
    const outbox = (sent.body as { outbox: { template: string; text_body: string; live_ads: boolean } })
      .outbox;
    expect(outbox.template).toBe("ADS_PROGRESS_STUB");
    expect(outbox.live_ads).toBe(false);
    expect(outbox.text_body).toMatch(/not live spend/i);
    expect(outbox.text_body).toMatch(/Wave 6/i);
    expect(outbox.text_body).not.toMatch(/\$\d|ROAS|impressions=/i);
  });

  it("persists owner reviews and outbox in the file store without cross-brand leak", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mos-owner-ops-"));
    temps.push(dir);
    const c = ctx(new FileOpsStore(dir));
    temps.push(c.reportRoot);
    const pack = await villaPack(c);
    await api(c, "POST", `/api/campaigns/${pack.campaign_id}/owner-review`, {
      body: { brand_id: "VILLA_GLORY" },
    });
    const reloaded = new FileOpsStore(dir);
    expect(reloaded.listOutbox("VILLA_GLORY")).toHaveLength(1);
    expect(reloaded.listOutbox("LOTIN")).toHaveLength(0);
    expect(reloaded.listOwnerReviews("VILLA_GLORY")).toHaveLength(1);
    expect(reloaded.listOwnerReviews("LOTIN")).toHaveLength(0);
  });

  it("validates owner-review contracts", () => {
    const now = new Date().toISOString();
    const review = OwnerReviewRequestSchema.parse({
      review_id: "7a1c0b2e-4d33-4c1a-9f11-0c6d8e2a3001",
      brand_id: "VILLA_GLORY",
      campaign_id: "7a1c0b2e-4d33-4c1a-9f11-0c6d8e2a3002",
      pack_id: "7a1c0b2e-4d33-4c1a-9f11-0c6d8e2a3003",
      token: "a".repeat(32),
      status: "PENDING",
      review_url: "http://127.0.0.1:8787/owner-review?token=aaa",
      created_at: now,
    });
    expect(review.template).toBe("MATERIALS_READY");
    const decision = OwnerReviewDecisionSchema.parse({
      decision_id: "7a1c0b2e-4d33-4c1a-9f11-0c6d8e2a3004",
      review_id: review.review_id,
      brand_id: "VILLA_GLORY",
      decision: "CHANGES_REQUESTED",
      note: "Revise headline",
      actor: "owner",
      created_at: now,
    });
    expect(decision.live_ads).toBe(false);
    const item = EmailOutboxItemSchema.parse({
      outbox_id: "7a1c0b2e-4d33-4c1a-9f11-0c6d8e2a3005",
      brand_id: "VILLA_GLORY",
      template: "MATERIALS_READY",
      mode: "dry_run",
      to: ["villa-glory-owner@example.test"],
      subject: "ready",
      text_body: "body",
      html_body: "<p>body</p>",
      status: "RECORDED",
      created_at: now,
    });
    expect(item.live_publish).toBe(false);
  });
});
