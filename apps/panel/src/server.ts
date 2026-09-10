/**
 * Thin dedicated Marketing OS operator panel (Wave 3–8 dry-run).
 * Own app/URL — not embedded in NOX TECH admin.
 * Honest Node HTTP server: bind PORT/HOST, GET /health + /api/health.
 * Live publish/ads stay blocked.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createAssetCatalog,
  createDriveAssetSource,
  createEmailAdapter,
  createFigmaArrangeAdapter,
  createFigmaArrangeJobStore,
  createHiggsfieldAdapter,
  createHiggsfieldGenerateJobStore,
  createOpsStoreAsync,
  createVideoProducerAdapter,
  createVideoProduceJobStore,
  handlePanelApi,
  resolveOpsStoreBackend,
  type PanelApiContext,
} from "@marketing-os/runtime";

const __dirname = dirname(fileURLToPath(import.meta.url));

export function resolvePanelBind(): { port: number; host: string } {
  const port = Number(process.env.PORT ?? process.env.PANEL_PORT ?? 8787);
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error("PORT / PANEL_PORT must be a positive number");
  }
  const host = process.env.HOST ?? process.env.MOS_PANEL_HOST ?? "0.0.0.0";
  return { port, host };
}

export async function createPanelContext(): Promise<PanelApiContext> {
  const { port } = resolvePanelBind();
  const backend = resolveOpsStoreBackend();
  const store = await createOpsStoreAsync({
    backend,
    dir: process.env.MOS_OPS_DIR ?? join(process.cwd(), "data", "ops"),
  });
  const catalogBackend = backend === "memory" ? "memory" : "file";
  return {
    store,
    assets: createAssetCatalog({
      backend: catalogBackend,
      dir: process.env.MOS_ASSETS_DIR ?? join(process.cwd(), "data", "assets"),
      seedFixtures: process.env.MOS_ASSETS_SEED !== "false",
    }),
    drive: createDriveAssetSource(),
    figma: createFigmaArrangeAdapter(),
    figmaJobs: createFigmaArrangeJobStore({
      backend: catalogBackend,
      dir: process.env.MOS_FIGMA_DIR ?? join(process.cwd(), "data", "figma"),
    }),
    higgsfield: createHiggsfieldAdapter(),
    higgsfieldJobs: createHiggsfieldGenerateJobStore({
      backend: catalogBackend,
      dir: process.env.MOS_HIGGSFIELD_DIR ?? join(process.cwd(), "data", "higgsfield"),
    }),
    video: createVideoProducerAdapter(),
    videoJobs: createVideoProduceJobStore({
      backend: catalogBackend,
      dir: process.env.MOS_VIDEO_DIR ?? join(process.cwd(), "data", "video"),
    }),
    email: createEmailAdapter(),
    panelBaseUrl: process.env.MOS_PANEL_BASE_URL ?? `http://127.0.0.1:${port}`,
    writeReport: process.env.MOS_PANEL_WRITE_REPORT !== "false",
  };
}

function send(res: ServerResponse, status: number, body: unknown, type = "application/json"): void {
  const payload = typeof body === "string" ? body : JSON.stringify(body, null, 2);
  res.writeHead(status, {
    "content-type": `${type}; charset=utf-8`,
    "cache-control": "no-store",
  });
  res.end(payload);
}

function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolvePromise, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolvePromise(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
  });
}

function htmlPage(): string {
  return readFileSync(join(__dirname, "ui.html"), "utf8");
}

function ownerReviewPage(): string {
  return readFileSync(join(__dirname, "owner-review.html"), "utf8");
}

export function createPanelHttpServer(
  ctx: PanelApiContext,
  bind = resolvePanelBind(),
) {
  return createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${bind.host}:${bind.port}`);
    try {
      if (req.method === "GET" && url.pathname === "/") {
        return send(res, 200, htmlPage(), "text/html");
      }
      if (req.method === "GET" && url.pathname === "/owner-review") {
        return send(res, 200, ownerReviewPage(), "text/html");
      }
      const body =
        req.method === "POST" || req.method === "PUT" || req.method === "PATCH"
          ? await readJson(req)
          : undefined;
      const result = await handlePanelApi(
        {
          method: req.method ?? "GET",
          pathname: url.pathname,
          searchParams: url.searchParams,
          ...(body !== undefined ? { body } : {}),
        },
        ctx,
      );
      return send(res, result.status, result.body);
    } catch (e) {
      send(res, 400, {
        error: e instanceof Error ? e.message : String(e),
      });
    }
  });
}

export async function startPanel(): Promise<void> {
  const bind = resolvePanelBind();
  const ctx = await createPanelContext();
  const server = createPanelHttpServer(ctx, bind);
  await new Promise<void>((resolveListen) => {
    server.listen(bind.port, bind.host, () => resolveListen());
  });
  console.log(`Marketing OS operator panel http://${bind.host}:${bind.port}`);
  console.log(
    `ops_store=${resolveOpsStoreBackend()} email_mode=${process.env.MOS_EMAIL_MODE ?? "dry_run"}`,
  );
  console.log(
    "Waves 5–8 are on (Instagram dry-run, paid staging, CRM fixtures, digest dry-run). Live publish/ads remain blocked.",
  );
}

const isMain =
  !!process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isMain) {
  startPanel().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
