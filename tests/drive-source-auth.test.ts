import { generateKeyPairSync, verify } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createDriveAssetSource,
  createServiceAccountTokenProvider,
  DRIVE_READONLY_SCOPE,
  FixtureDriveAssetSource,
  GOOGLE_TOKEN_URI,
  GoogleDriveAssetSource,
  GoogleDriveCredentialsMissingError,
  GoogleDriveServiceAccountInvalidError,
  parseDriveServiceAccountJson,
  resolveDriveSourceMode,
  resolveGoogleDriveAuth,
  signServiceAccountJwt,
} from "@marketing-os/runtime";

const DRIVE_FOLDER_MIME = "application/vnd.google-apps.folder";

const ENV_KEYS = [
  "MOS_DRIVE_SOURCE",
  "MOS_DRIVE_ACCESS_TOKEN",
  "MOS_DRIVE_SERVICE_ACCOUNT_JSON",
  "MOS_DRIVE_SERVICE_ACCOUNT_FILE",
] as const;

const savedEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

function snapshotDriveEnv(): void {
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
}

function restoreDriveEnv(): void {
  for (const key of ENV_KEYS) {
    const prev = savedEnv[key];
    if (prev === undefined) delete process.env[key];
    else process.env[key] = prev;
  }
}

function testServiceAccount(clientEmail = "mos-drive@test.iam.gserviceaccount.com"): {
  json: string;
  publicKey: string;
  client_email: string;
} {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  return {
    client_email: clientEmail,
    publicKey,
    json: JSON.stringify({
      type: "service_account",
      client_email: clientEmail,
      private_key: privateKey,
      token_uri: GOOGLE_TOKEN_URI,
    }),
  };
}

/** One generated keypair for the file — not a real GCP secret. */
const SHARED_SA = testServiceAccount();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function contractFolders() {
  return [
    { id: "kit", name: "brand-kit", mimeType: DRIVE_FOLDER_MIME },
    { id: "stills", name: "approved-stills", mimeType: DRIVE_FOLDER_MIME },
    { id: "video", name: "approved-video", mimeType: DRIVE_FOLDER_MIME },
    { id: "inbox", name: "raw-inbox", mimeType: DRIVE_FOLDER_MIME },
    { id: "gen", name: "generated", mimeType: DRIVE_FOLDER_MIME },
  ];
}

function decodeJwtClaims(jwt: string): Record<string, unknown> {
  const parts = jwt.split(".");
  expect(parts).toHaveLength(3);
  return JSON.parse(Buffer.from(parts[1]!, "base64url").toString("utf8")) as Record<
    string,
    unknown
  >;
}

beforeEach(() => {
  snapshotDriveEnv();
});

afterEach(() => {
  restoreDriveEnv();
});

describe("Drive source mode selection", () => {
  it("defaults to fixture so pnpm test needs no Drive credentials", () => {
    expect(resolveDriveSourceMode()).toBe("fixture");
    const source = createDriveAssetSource();
    expect(source).toBeInstanceOf(FixtureDriveAssetSource);
    expect(source.mode).toBe("fixture");
  });

  it("keeps fixture mode even when a service-account JSON is present", () => {
    const sa = SHARED_SA;
    const source = createDriveAssetSource({
      mode: "fixture",
      serviceAccountJson: sa.json,
      accessToken: "should-not-be-used",
    });
    expect(source.mode).toBe("fixture");
  });
});

describe("Google Drive credential selection", () => {
  it("fails closed when google_drive mode has neither SA nor Bearer", () => {
    expect(() => createDriveAssetSource({ mode: "google_drive", env: {} })).toThrow(
      GoogleDriveCredentialsMissingError,
    );
    expect(() =>
      createDriveAssetSource({ mode: "google_drive", accessToken: "", env: {} }),
    ).toThrow(GoogleDriveCredentialsMissingError);
  });

  it("uses MOS_DRIVE_ACCESS_TOKEN when no service account is configured", () => {
    const source = createDriveAssetSource({
      mode: "google_drive",
      accessToken: "user-oauth-bearer",
      env: {},
    });
    expect(source).toBeInstanceOf(GoogleDriveAssetSource);
    expect((source as GoogleDriveAssetSource).auth_kind).toBe("access_token");
  });

  it("prefers a service account over a short-lived Bearer", () => {
    const sa = SHARED_SA;
    const source = createDriveAssetSource({
      mode: "google_drive",
      serviceAccountJson: sa.json,
      accessToken: "user-oauth-bearer",
      tokenProvider: async () => "minted-from-sa",
      env: {},
    });
    expect((source as GoogleDriveAssetSource).auth_kind).toBe("service_account");
  });

  it("reads MOS_DRIVE_SERVICE_ACCOUNT_JSON from env and ignores the Bearer", () => {
    const sa = SHARED_SA;
    const auth = resolveGoogleDriveAuth({
      env: {
        MOS_DRIVE_SERVICE_ACCOUNT_JSON: sa.json,
        MOS_DRIVE_ACCESS_TOKEN: "user-oauth-bearer",
      },
    });
    expect(auth.kind).toBe("service_account");
    if (auth.kind === "service_account") {
      expect(auth.credentials?.client_email).toBe(sa.client_email);
    }
  });

  it("loads a service-account file path without treating it as a Bearer", () => {
    const sa = SHARED_SA;
    const auth = resolveGoogleDriveAuth({
      serviceAccountFile: "/tmp/drive-sa.json",
      readFile: (path) => {
        expect(path).toBe("/tmp/drive-sa.json");
        return sa.json;
      },
      env: { MOS_DRIVE_ACCESS_TOKEN: "user-oauth-bearer" },
    });
    expect(auth.kind).toBe("service_account");
  });

  it("rejects invalid service-account JSON instead of falling back to Bearer", () => {
    expect(() =>
      resolveGoogleDriveAuth({
        serviceAccountJson: "{not-json",
        accessToken: "user-oauth-bearer",
        env: {},
      }),
    ).toThrow(GoogleDriveServiceAccountInvalidError);
    expect(() =>
      parseDriveServiceAccountJson(JSON.stringify({ client_email: "x@test.iam.gserviceaccount.com" })),
    ).toThrow(GoogleDriveServiceAccountInvalidError);
  });

  it("accepts base64-encoded service-account JSON", () => {
    const parsed = parseDriveServiceAccountJson(
      Buffer.from(SHARED_SA.json, "utf8").toString("base64"),
    );
    expect(parsed.client_email).toBe(SHARED_SA.client_email);
    expect(parsed.private_key).toContain("BEGIN PRIVATE KEY");
  });

  it("createDriveAssetSource() follows MOS_DRIVE_SOURCE + SA JSON from process.env", () => {
    process.env.MOS_DRIVE_SOURCE = "google_drive";
    process.env.MOS_DRIVE_SERVICE_ACCOUNT_JSON = SHARED_SA.json;
    process.env.MOS_DRIVE_ACCESS_TOKEN = "user-oauth-bearer";
    const source = createDriveAssetSource();
    expect(source.mode).toBe("google_drive");
    expect((source as GoogleDriveAssetSource).auth_kind).toBe("service_account");
  });
});

describe("Google Drive token mint (no live network)", () => {
  it("signs a JWT and exchanges it via the mocked token endpoint", async () => {
    const sa = SHARED_SA;
    let mintCalls = 0;
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url === GOOGLE_TOKEN_URI) {
        mintCalls += 1;
        expect(init?.method).toBe("POST");
        const body = String(init?.body ?? "");
        const posted = new URLSearchParams(body);
        expect(posted.get("grant_type")).toBe(
          "urn:ietf:params:oauth:grant-type:jwt-bearer",
        );
        const assertion = posted.get("assertion");
        expect(assertion).toBeTruthy();
        const [header, claims, sig] = assertion!.split(".");
        const ok = verify(
          "RSA-SHA256",
          Buffer.from(`${header}.${claims}`),
          sa.publicKey,
          Buffer.from(sig!, "base64url"),
        );
        expect(ok).toBe(true);
        const decoded = decodeJwtClaims(assertion!);
        expect(decoded.iss).toBe(sa.client_email);
        expect(decoded.scope).toBe(DRIVE_READONLY_SCOPE);
        expect(decoded.aud).toBe(GOOGLE_TOKEN_URI);
        return jsonResponse({ access_token: "minted-sa-token", expires_in: 3600 });
      }
      const headers = init?.headers as Record<string, string>;
      expect(headers.authorization).toBe("Bearer minted-sa-token");
      expect(url).toContain("googleapis.com/drive/v3/files");
      return jsonResponse({ files: contractFolders() });
    };

    const source = createDriveAssetSource({
      mode: "google_drive",
      serviceAccountJson: sa.json,
      fetchImpl,
      env: {},
    });
    expect((source as GoogleDriveAssetSource).auth_kind).toBe("service_account");
    const contract = await source.listFolderContract("VILLA_GLORY", "folder-root");
    expect(contract.valid).toBe(true);
    expect(mintCalls).toBe(1);
    await source.listFolderContract("VILLA_GLORY", "folder-root");
    expect(mintCalls).toBe(1);
  });

  it("reuses a cached minted token until shortly before expiry", async () => {
    const sa = SHARED_SA;
    const credentials = parseDriveServiceAccountJson(sa.json);
    let now = 1_000_000;
    let mintCalls = 0;
    const fetchImpl: typeof fetch = async () => {
      mintCalls += 1;
      return jsonResponse({ access_token: `tok-${mintCalls}`, expires_in: 3600 });
    };
    const provider = createServiceAccountTokenProvider({
      credentials,
      fetchImpl,
      now: () => now,
    });
    expect(await provider()).toBe("tok-1");
    now += 10_000;
    expect(await provider()).toBe("tok-1");
    now += 3_600_000;
    expect(await provider()).toBe("tok-2");
    expect(mintCalls).toBe(2);
  });

  it("sends the static Bearer when no service account is configured", async () => {
    const fetchImpl: typeof fetch = async (_input, init) => {
      const headers = init?.headers as Record<string, string>;
      expect(headers.authorization).toBe("Bearer user-oauth-bearer");
      return jsonResponse({ files: contractFolders() });
    };
    const source = createDriveAssetSource({
      mode: "google_drive",
      accessToken: "user-oauth-bearer",
      fetchImpl,
      env: {},
    });
    const contract = await source.listFolderContract("LOTIN", "folder-root");
    expect(contract.valid).toBe(true);
    expect((source as GoogleDriveAssetSource).auth_kind).toBe("access_token");
  });

  it("uses an injected tokenProvider without hitting a token endpoint", async () => {
    let mintHits = 0;
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.includes("oauth2.googleapis.com")) {
        mintHits += 1;
        return jsonResponse({ error: "should-not-mint" }, 500);
      }
      const headers = init?.headers as Record<string, string>;
      expect(headers.authorization).toBe("Bearer injected-sa-token");
      return jsonResponse({ files: contractFolders() });
    };
    const source = createDriveAssetSource({
      mode: "google_drive",
      tokenProvider: async () => "injected-sa-token",
      fetchImpl,
      env: {},
    });
    expect(await source.listFolderContract("NOX_FORM", "folder-root")).toMatchObject({
      valid: true,
    });
    expect(mintHits).toBe(0);
  });

  it("signs a JWT that verifies with the matching public key", () => {
    const sa = SHARED_SA;
    const credentials = parseDriveServiceAccountJson(sa.json);
    const jwt = signServiceAccountJwt(credentials, 2_000_000);
    const [header, claims, sig] = jwt.split(".");
    expect(
      verify(
        "RSA-SHA256",
        Buffer.from(`${header}.${claims}`),
        sa.publicKey,
        Buffer.from(sig!, "base64url"),
      ),
    ).toBe(true);
    expect(decodeJwtClaims(jwt).iss).toBe(sa.client_email);
  });
});
