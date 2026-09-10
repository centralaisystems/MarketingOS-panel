import { afterEach, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createPanelHttpServer,
  resolvePanelBind,
} from "../apps/panel/src/server.ts";
import {
  MemoryOpsStore,
  createAssetCatalog,
  createEmailAdapter,
  handlePanelApi,
  type PanelApiContext,
} from "@marketing-os/runtime";

function panelCtx(): PanelApiContext & { reportRoot: string } {
  const reportRoot = mkdtempSync(join(tmpdir(), "mos-panel-deploy-"));
  return {
    store: new MemoryOpsStore(),
    assets: createAssetCatalog({ seedFixtures: true }),
    email: createEmailAdapter({ mode: "dry_run" }),
    writeReport: false,
    reportRoot,
  };
}

describe("panel deploy bind + health", () => {
  const temps: string[] = [];
  const prev = {
    PORT: process.env.PORT,
    PANEL_PORT: process.env.PANEL_PORT,
    HOST: process.env.HOST,
    MOS_PANEL_HOST: process.env.MOS_PANEL_HOST,
  };
  afterEach(() => {
    for (const dir of temps) {
      rmSync(dir, { recursive: true, force: true });
    }
    temps.length = 0;
    for (const [key, value] of Object.entries(prev)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("prefers PORT over PANEL_PORT and defaults host to 0.0.0.0", () => {
    delete process.env.HOST;
    delete process.env.MOS_PANEL_HOST;
    process.env.PANEL_PORT = "9001";
    process.env.PORT = "9099";
    expect(resolvePanelBind()).toEqual({ port: 9099, host: "0.0.0.0" });
  });

  it("serves /health and /api/health with live flags off", async () => {
    const c = panelCtx();
    temps.push(c.reportRoot);
    const viaApi = await handlePanelApi(
      {
        method: "GET",
        pathname: "/health",
        searchParams: new URLSearchParams(),
      },
      c,
    );
    expect(viaApi.status).toBe(200);
    expect(viaApi.body).toMatchObject({
      ok: true,
      live_publish_allowed: false,
      live_ads_allowed: false,
    });

    const server = createPanelHttpServer(c, { port: 0, host: "127.0.0.1" });
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });
    try {
      const { port } = server.address() as AddressInfo;
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      expect(res.ok).toBe(true);
      const body = (await res.json()) as {
        ok: boolean;
        live_publish_allowed: boolean;
        live_ads_allowed: boolean;
        ops_store: string;
      };
      expect(body.ok).toBe(true);
      expect(body.live_publish_allowed).toBe(false);
      expect(body.live_ads_allowed).toBe(false);
      expect(["file", "memory"]).toContain(body.ops_store);

      const apiHealth = await fetch(`http://127.0.0.1:${port}/api/health`);
      expect(apiHealth.ok).toBe(true);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });
});
