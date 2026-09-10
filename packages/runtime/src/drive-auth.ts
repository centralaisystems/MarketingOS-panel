import { readFileSync } from "node:fs";
import { sign } from "node:crypto";

/** Read-only listing is enough for Wave 4b metadata ingest. */
export const DRIVE_READONLY_SCOPE = "https://www.googleapis.com/auth/drive.readonly";
export const GOOGLE_TOKEN_URI = "https://oauth2.googleapis.com/token";
const LEGACY_GOOGLE_TOKEN_URI = "https://accounts.google.com/o/oauth2/token";
const JWT_GRANT = "urn:ietf:params:oauth:grant-type:jwt-bearer";
const TOKEN_SKEW_MS = 60_000;

export type DriveAuthKind = "access_token" | "service_account";

export type DriveAccessTokenProvider = () => Promise<string>;

export type DriveServiceAccountCredentials = {
  client_email: string;
  private_key: string;
  token_uri?: string;
};

export class GoogleDriveCredentialsMissingError extends Error {
  constructor() {
    super(
      "MOS_DRIVE_SOURCE=google_drive requires MOS_DRIVE_SERVICE_ACCOUNT_JSON, MOS_DRIVE_SERVICE_ACCOUNT_FILE, or MOS_DRIVE_ACCESS_TOKEN. Use fixture mode for CI (`pnpm test`).",
    );
    this.name = "GoogleDriveCredentialsMissingError";
  }
}

export class GoogleDriveServiceAccountInvalidError extends Error {
  constructor(reason: string) {
    super(
      `MOS_DRIVE_SOURCE=google_drive service-account credentials are invalid (${reason}).`,
    );
    this.name = "GoogleDriveServiceAccountInvalidError";
  }
}

export type ResolveGoogleDriveAuthInput = {
  accessToken?: string;
  serviceAccountJson?: string;
  serviceAccountFile?: string;
  tokenProvider?: DriveAccessTokenProvider;
  env?: NodeJS.ProcessEnv;
  readFile?: (path: string) => string;
};

export type ResolvedGoogleDriveAuth =
  | { kind: "access_token"; token: string }
  | {
      kind: "service_account";
      credentials?: DriveServiceAccountCredentials;
      provider?: DriveAccessTokenProvider;
    };

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

function tryParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function decodeBase64Utf8(raw: string): string | undefined {
  const compact = raw.replace(/\s+/g, "");
  if (!compact || compact.length % 4 === 1) return undefined;
  if (!/^[A-Za-z0-9+/_-]+=*$/.test(compact)) return undefined;
  try {
    const buf = Buffer.from(compact, "base64");
    if (buf.length === 0) return undefined;
    return buf.toString("utf8");
  } catch {
    return undefined;
  }
}

function normalizePrivateKey(raw: string): string {
  let key = raw.trim();
  if (key.includes("\\n") && key.includes("BEGIN")) {
    key = key.replace(/\\n/g, "\n");
  }
  return key;
}

function resolveTokenUri(uri?: string): string {
  if (!uri?.trim()) return GOOGLE_TOKEN_URI;
  try {
    const parsed = new URL(uri.trim());
    const href = `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, "");
    if (parsed.protocol !== "https:") return GOOGLE_TOKEN_URI;
    if (href === GOOGLE_TOKEN_URI || href === LEGACY_GOOGLE_TOKEN_URI) return href;
  } catch {
    // ignore malformed token_uri from a key file
  }
  return GOOGLE_TOKEN_URI;
}

/**
 * Parse a GCP service-account JSON object. Accepts a raw JSON string or
 * standard base64 of that JSON (Railway secret convenience). Never logs the key.
 */
export function parseDriveServiceAccountJson(raw: string): DriveServiceAccountCredentials {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new GoogleDriveServiceAccountInvalidError("empty JSON");
  }
  let parsed: unknown = tryParseJson(trimmed);
  if (parsed === undefined) {
    const decoded = decodeBase64Utf8(trimmed);
    if (decoded) parsed = tryParseJson(decoded);
  }
  if (parsed === undefined || typeof parsed !== "object" || parsed === null) {
    throw new GoogleDriveServiceAccountInvalidError(
      "expected a GCP service-account JSON object with client_email and private_key",
    );
  }
  const rec = parsed as Record<string, unknown>;
  const client_email = typeof rec.client_email === "string" ? rec.client_email.trim() : "";
  const private_key =
    typeof rec.private_key === "string" ? normalizePrivateKey(rec.private_key) : "";
  if (!client_email || !private_key) {
    throw new GoogleDriveServiceAccountInvalidError("missing client_email or private_key");
  }
  if (!private_key.includes("BEGIN") || !private_key.includes("PRIVATE KEY")) {
    throw new GoogleDriveServiceAccountInvalidError("private_key is not a PEM key");
  }
  const token_uri =
    typeof rec.token_uri === "string" ? resolveTokenUri(rec.token_uri) : undefined;
  return {
    client_email,
    private_key,
    ...(token_uri && token_uri !== GOOGLE_TOKEN_URI ? { token_uri } : {}),
  };
}

function readServiceAccountFile(
  path: string,
  readFile: (p: string) => string = (p) => readFileSync(p, "utf8"),
): string {
  try {
    return readFile(path);
  } catch {
    throw new GoogleDriveServiceAccountInvalidError(
      `could not read MOS_DRIVE_SERVICE_ACCOUNT_FILE`,
    );
  }
}

/**
 * SA JSON/file wins over a short-lived Bearer. Injected tokenProvider wins
 * over both (test seam — no live network).
 */
export function resolveGoogleDriveAuth(
  opts?: ResolveGoogleDriveAuthInput,
): ResolvedGoogleDriveAuth {
  if (opts?.tokenProvider) {
    return { kind: "service_account", provider: opts.tokenProvider };
  }
  const env = opts?.env ?? process.env;
  const saJson = firstNonEmpty(
    opts?.serviceAccountJson,
    env.MOS_DRIVE_SERVICE_ACCOUNT_JSON,
  );
  const saFile = firstNonEmpty(
    opts?.serviceAccountFile,
    env.MOS_DRIVE_SERVICE_ACCOUNT_FILE,
  );
  if (saJson || saFile) {
    const raw = saJson ?? readServiceAccountFile(saFile!, opts?.readFile);
    return { kind: "service_account", credentials: parseDriveServiceAccountJson(raw) };
  }
  const token = firstNonEmpty(opts?.accessToken, env.MOS_DRIVE_ACCESS_TOKEN);
  if (token) {
    return { kind: "access_token", token };
  }
  throw new GoogleDriveCredentialsMissingError();
}

function b64urlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

export function signServiceAccountJwt(
  credentials: DriveServiceAccountCredentials,
  nowMs = Date.now(),
): string {
  const iat = Math.floor(nowMs / 1000);
  const aud = resolveTokenUri(credentials.token_uri);
  const unsigned = `${b64urlJson({ alg: "RS256", typ: "JWT" })}.${b64urlJson({
    iss: credentials.client_email,
    scope: DRIVE_READONLY_SCOPE,
    aud,
    iat,
    exp: iat + 3600,
  })}`;
  const signature = sign("RSA-SHA256", Buffer.from(unsigned), credentials.private_key);
  return `${unsigned}.${signature.toString("base64url")}`;
}

export async function mintGoogleAccessToken(
  credentials: DriveServiceAccountCredentials,
  fetchImpl: typeof fetch = fetch,
  nowMs = Date.now(),
): Promise<{ access_token: string; expires_in: number }> {
  const assertion = signServiceAccountJwt(credentials, nowMs);
  const tokenUri = resolveTokenUri(credentials.token_uri);
  const res = await fetchImpl(tokenUri, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: JWT_GRANT,
      assertion,
    }).toString(),
  });
  if (!res.ok) {
    throw new Error(
      `Google Drive service-account token mint failed (${res.status}). Share the brand folder with the service-account client_email as Viewer.`,
    );
  }
  const json = (await res.json()) as { access_token?: unknown; expires_in?: unknown };
  if (typeof json.access_token !== "string" || !json.access_token.trim()) {
    throw new Error("Google Drive service-account token mint returned no access_token.");
  }
  const expires_in =
    typeof json.expires_in === "number" && json.expires_in > 0 ? json.expires_in : 3600;
  return { access_token: json.access_token.trim(), expires_in };
}

export function createServiceAccountTokenProvider(input: {
  credentials: DriveServiceAccountCredentials;
  fetchImpl?: typeof fetch;
  now?: () => number;
}): DriveAccessTokenProvider {
  let cached: { token: string; expiresAtMs: number } | null = null;
  const fetchImpl = input.fetchImpl ?? fetch;
  return async () => {
    const now = input.now?.() ?? Date.now();
    if (cached && now < cached.expiresAtMs - TOKEN_SKEW_MS) {
      return cached.token;
    }
    const minted = await mintGoogleAccessToken(input.credentials, fetchImpl, now);
    cached = {
      token: minted.access_token,
      expiresAtMs: now + minted.expires_in * 1000,
    };
    return cached.token;
  };
}
