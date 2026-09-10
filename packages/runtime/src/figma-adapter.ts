import { createHash } from "node:crypto";
import {
  FigmaOutputPointerSchema,
  type AssetRecord,
  type BrandId,
  type FigmaLayoutBrief,
  type FigmaOutputPointer,
  type FigmaSourceMode,
} from "@marketing-os/contracts";
import {
  fixtureFileKeyForBrand,
  fixtureFileNameForBrand,
  resolveFixtureTemplate,
} from "./fixtures/figma-arrange.js";

export class FigmaCredentialsMissingError extends Error {
  constructor() {
    super(
      "MOS_FIGMA_SOURCE=figma_api requires MOS_FIGMA_ACCESS_TOKEN. Use fixture mode for CI (`pnpm test`).",
    );
    this.name = "FigmaCredentialsMissingError";
  }
}

export class FigmaLiveFileMissingError extends Error {
  constructor() {
    super(
      "Live Figma arrange requires MOS_FIGMA_FILE_KEY. Fixture mode does not need a live file.",
    );
    this.name = "FigmaLiveFileMissingError";
  }
}

export type FigmaArrangeAdapterInput = {
  brand_id: BrandId;
  job_id: string;
  source_assets: AssetRecord[];
  brand_kit: AssetRecord[];
  layout_brief: FigmaLayoutBrief;
};

/**
 * Places approved stills onto a brand-kit layout.
 * Fixture mode is deterministic. Live mode is optional and not used by tests.
 */
export interface FigmaArrangeAdapter {
  readonly mode: FigmaSourceMode;
  arrange(input: FigmaArrangeAdapterInput): Promise<FigmaOutputPointer>;
}

function figmaFileUrl(file_key: string, file_name: string): string {
  return `https://www.figma.com/design/${file_key}/${encodeURIComponent(file_name)}`;
}

function figmaNodeUrl(file_url: string, node_id: string): string {
  return `${file_url}?node-id=${node_id.replace(":", "-")}`;
}

export function deterministicFixtureNodeId(
  brand_id: BrandId,
  source_asset_ids: string[],
  node_prefix: string,
): string {
  const digest = createHash("sha1")
    .update(`figma-node:${brand_id}:${[...source_asset_ids].sort().join(",")}`)
    .digest("hex");
  const n = (parseInt(digest.slice(0, 4), 16) % 900) + 10;
  return `${node_prefix}:${n}`;
}

export class FixtureFigmaArrangeAdapter implements FigmaArrangeAdapter {
  readonly mode = "fixture" as const;

  async arrange(input: FigmaArrangeAdapterInput): Promise<FigmaOutputPointer> {
    const template = resolveFixtureTemplate(
      input.brand_id,
      input.layout_brief.template_hint,
    );
    const file_key = fixtureFileKeyForBrand(input.brand_id);
    const file_name = fixtureFileNameForBrand(input.brand_id);
    const file_url = figmaFileUrl(file_key, file_name);
    const node_id = deterministicFixtureNodeId(
      input.brand_id,
      input.source_assets.map((a) => a.asset_id),
      template.node_prefix,
    );
    return FigmaOutputPointerSchema.parse({
      file_key,
      file_url,
      node_id,
      node_url: figmaNodeUrl(file_url, node_id),
      template_id: template.template_id,
    });
  }
}

type FigmaFileResponse = {
  name?: string;
};

/**
 * Optional live Figma REST client. Validates the token + registered file
 * and records file/node pointers. It does not publish or invent claims.
 * Not used by `pnpm test`.
 */
export class FigmaApiArrangeAdapter implements FigmaArrangeAdapter {
  readonly mode = "figma_api" as const;

  constructor(
    private readonly accessToken: string,
    private readonly fileKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    if (!accessToken.trim()) {
      throw new FigmaCredentialsMissingError();
    }
    if (!fileKey.trim()) {
      throw new FigmaLiveFileMissingError();
    }
  }

  async arrange(input: FigmaArrangeAdapterInput): Promise<FigmaOutputPointer> {
    const key = this.fileKey.trim();
    const res = await this.fetchImpl(
      `https://api.figma.com/v1/files/${encodeURIComponent(key)}?depth=1`,
      {
        method: "GET",
        headers: {
          "X-Figma-Token": this.accessToken,
          accept: "application/json",
        },
      },
    );
    if (!res.ok) {
      throw new Error(
        `Figma file read failed (${res.status}). Arrange stays unpublished; check MOS_FIGMA_FILE_KEY.`,
      );
    }
    const body = (await res.json()) as FigmaFileResponse;
    const file_name = body.name?.trim() || fixtureFileNameForBrand(input.brand_id);
    const file_url = figmaFileUrl(key, file_name);
    const template = resolveFixtureTemplate(
      input.brand_id,
      input.layout_brief.template_hint,
    );
    const node_id = deterministicFixtureNodeId(
      input.brand_id,
      input.source_assets.map((a) => a.asset_id),
      template.node_prefix,
    );
    return FigmaOutputPointerSchema.parse({
      file_key: key,
      file_url,
      node_id,
      node_url: figmaNodeUrl(file_url, node_id),
      template_id: template.template_id,
    });
  }
}

export function resolveFigmaSourceMode(
  override?: FigmaSourceMode,
): FigmaSourceMode {
  if (override) return override;
  const env = process.env.MOS_FIGMA_SOURCE?.trim().toLowerCase();
  return env === "figma_api" || env === "figma" ? "figma_api" : "fixture";
}

export function createFigmaArrangeAdapter(opts?: {
  mode?: FigmaSourceMode;
  accessToken?: string;
  fileKey?: string;
  fetchImpl?: typeof fetch;
}): FigmaArrangeAdapter {
  const mode = resolveFigmaSourceMode(opts?.mode);
  if (mode === "figma_api") {
    const token = opts?.accessToken ?? process.env.MOS_FIGMA_ACCESS_TOKEN ?? "";
    const fileKey = opts?.fileKey ?? process.env.MOS_FIGMA_FILE_KEY ?? "";
    return new FigmaApiArrangeAdapter(token, fileKey, opts?.fetchImpl ?? fetch);
  }
  return new FixtureFigmaArrangeAdapter();
}
