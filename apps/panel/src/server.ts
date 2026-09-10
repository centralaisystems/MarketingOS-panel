/**
 * Thin dedicated Marketing OS operator panel (Wave 3–5 dry-run).
 * Own app/URL — not embedded in NOX TECH admin.
 * Wave 4 analytics/assets are read-only. Wave 4b Drive ingest is metadata-only.
 * Figma arrange + Higgsfield fill-gaps + video export packages are fixture-first.
 * Owner review emails default to dry-run outbox.
 * Wave 5 Instagram dry-run writes social outbox + audit. Live publish/ads stay blocked.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createAssetCatalog,
  createDriveAssetSource,
  createEmailAdapter,
  createFigmaArrangeAdapter,
  createFigmaArrangeJobStore,
  createHiggsfieldAdapter,
  createHiggsfieldGenerateJobStore,
  createOpsStore,
  createVideoProducerAdapter,
  createVideoProduceJobStore,
  handlePanelApi,
  type PanelApiContext,
} from "@marketing-os/runtime";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PANEL_PORT ?? 8787);

const store = createOpsStore({
  backend: process.env.MOS_OPS_BACKEND === "memory" ? "memory" : "file",
  dir: process.env.MOS_OPS_DIR ?? join(process.cwd(), "data", "ops"),
});

const assets = createAssetCatalog({
  backend: process.env.MOS_OPS_BACKEND === "memory" ? "memory" : "file",
  dir: process.env.MOS_ASSETS_DIR ?? join(process.cwd(), "data", "assets"),
  seedFixtures: process.env.MOS_ASSETS_SEED !== "false",
});

const drive = createDriveAssetSource();
const figma = createFigmaArrangeAdapter();
const figmaJobs = createFigmaArrangeJobStore({
  backend: process.env.MOS_OPS_BACKEND === "memory" ? "memory" : "file",
  dir: process.env.MOS_FIGMA_DIR ?? join(process.cwd(), "data", "figma"),
});
const higgsfield = createHiggsfieldAdapter();
const higgsfieldJobs = createHiggsfieldGenerateJobStore({
  backend: process.env.MOS_OPS_BACKEND === "memory" ? "memory" : "file",
  dir: process.env.MOS_HIGGSFIELD_DIR ?? join(process.cwd(), "data", "higgsfield"),
});
const video = createVideoProducerAdapter();
const videoJobs = createVideoProduceJobStore({
  backend: process.env.MOS_OPS_BACKEND === "memory" ? "memory" : "file",
  dir: process.env.MOS_VIDEO_DIR ?? join(process.cwd(), "data", "video"),
});

const ctx: PanelApiContext = {
  store,
  assets,
  drive,
  figma,
  figmaJobs,
  higgsfield,
  higgsfieldJobs,
  video,
  videoJobs,
  email: createEmailAdapter(),
  panelBaseUrl: process.env.MOS_PANEL_BASE_URL ?? `http://127.0.0.1:${PORT}`,
  writeReport: process.env.MOS_PANEL_WRITE_REPORT !== "false",
};

function send(res: ServerResponse, status: number, body: unknown, type = "application/json"): void {
  const payload = typeof body === "string" ? body : JSON.stringify(body, null, 2);
  res.writeHead(status, {
    "content-type": `${type}; charset=utf-8`,
    "cache-control": "no-store",
  });
  res.end(payload);
}

function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
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

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);
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

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Marketing OS operator panel http://127.0.0.1:${PORT}`);
  console.log(
    "Wave 5 Instagram dry-run is on. Live publish/ads remain blocked.",
  );
});
