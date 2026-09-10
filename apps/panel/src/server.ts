/**
 * Thin operator panel (Wave 3) — local HTTP UI over Marketing OS runtime.
 * No live publish/ads. Brand isolation enforced per request.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  listBrandIds,
  loadBrandRegistry,
  loadPhaseGates,
  buildCampaignPack,
  runBrandOnboarding,
  assertRegisteredBrandId,
} from "@marketing-os/runtime";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PANEL_PORT ?? 8787);

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

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);
  try {
    if (req.method === "GET" && url.pathname === "/") {
      return send(res, 200, htmlPage(), "text/html");
    }
    if (req.method === "GET" && url.pathname === "/api/brands") {
      const registry = loadBrandRegistry();
      return send(res, 200, {
        brands: registry.brands,
        gates: loadPhaseGates(),
      });
    }
    if (req.method === "GET" && url.pathname === "/api/readiness") {
      const brand_id = assertRegisteredBrandId(
        url.searchParams.get("brand_id") ?? "",
      );
      const result = runBrandOnboarding(brand_id);
      return send(res, 200, {
        brand_id,
        readiness: result.report.readiness_status,
        score: result.report.overall_score,
        blockers: result.report.critical_blockers,
        verified: result.report.verified.length,
        guardian_passed: result.report.guardian_passed,
      });
    }
    if (req.method === "POST" && url.pathname === "/api/run-objective") {
      const body = (await readJson(req)) as {
        brand_id?: string;
        objective?: string;
      };
      const brand_id = assertRegisteredBrandId(body.brand_id ?? "");
      if (!body.objective?.trim()) {
        return send(res, 400, { error: "objective required" });
      }
      const pack = buildCampaignPack({
        brand_id,
        objective: body.objective.trim(),
        requested_by: "panel-operator",
      });
      return send(res, 200, {
        pack_id: pack.pack_id,
        brand_id: pack.brand_id,
        guardian: pack.guardian,
        approvable: pack.approvable,
        live_publish: pack.live_publish,
        live_ads: pack.live_ads,
        social_calendar: pack.social_calendar,
        paid_recommendations: pack.paid_recommendations,
      });
    }
    if (req.method === "GET" && url.pathname === "/api/gates") {
      return send(res, 200, loadPhaseGates());
    }
    send(res, 404, { error: "not found", brand_ids: listBrandIds() });
  } catch (e) {
    send(res, 400, {
      error: e instanceof Error ? e.message : String(e),
    });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Marketing OS panel listening on http://127.0.0.1:${PORT}`);
  console.log("Live publish/ads remain blocked by phase gates.");
});
