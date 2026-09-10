import {
  DriveFolderContractSchema,
  DriveFolderRoleSchema,
  DriveListedFileSchema,
  REQUIRED_DRIVE_FOLDER_ROLES,
  type BrandId,
  type DriveFolderContract,
  type DriveFolderRole,
  type DriveListedFile,
  type DriveSourceMode,
} from "@marketing-os/contracts";
import {
  createServiceAccountTokenProvider,
  GoogleDriveCredentialsMissingError,
  resolveGoogleDriveAuth,
  type DriveAccessTokenProvider,
  type DriveAuthKind,
  type ResolveGoogleDriveAuthInput,
} from "./drive-auth.js";
import {
  DEFAULT_DRIVE_FIXTURE_TREES,
  type DriveFixtureTree,
} from "./fixtures/wave4b-drive.js";

export {
  createServiceAccountTokenProvider,
  DRIVE_READONLY_SCOPE,
  GOOGLE_TOKEN_URI,
  GoogleDriveCredentialsMissingError,
  GoogleDriveServiceAccountInvalidError,
  mintGoogleAccessToken,
  parseDriveServiceAccountJson,
  resolveGoogleDriveAuth,
  signServiceAccountJwt,
  type DriveAccessTokenProvider,
  type DriveAuthKind,
  type DriveServiceAccountCredentials,
  type ResolveGoogleDriveAuthInput,
  type ResolvedGoogleDriveAuth,
} from "./drive-auth.js";

const DRIVE_FOLDER_MIME = "application/vnd.google-apps.folder";
const DRIVE_API = "https://www.googleapis.com/drive/v3/files";
const MAX_LIST_DEPTH = 6;

export class DriveNotConfiguredError extends Error {
  readonly brand_id: BrandId;
  constructor(brand_id: BrandId) {
    super(
      `No Drive folder configured for ${brand_id}. Set asset_drive_folder_id or asset_drive_folder_url on the brand registry.`,
    );
    this.name = "DriveNotConfiguredError";
    this.brand_id = brand_id;
  }
}

export class DriveFolderContractError extends Error {
  readonly contract: DriveFolderContract;
  constructor(brand_id: BrandId, contract: DriveFolderContract) {
    super(
      `Drive folder contract invalid for ${brand_id}. Missing: ${contract.missing.join(", ") || "(none)"}`,
    );
    this.name = "DriveFolderContractError";
    this.contract = contract;
  }
}

/**
 * Read-only Drive listing adapter.
 * Implementations must stay inside the one registered brand folder.
 */
export interface DriveAssetSource {
  readonly mode: DriveSourceMode;
  readonly read_only: true;
  listFolderContract(
    brand_id: BrandId,
    folder_id: string,
  ): Promise<DriveFolderContract>;
  listFiles(brand_id: BrandId, folder_id: string): Promise<DriveListedFile[]>;
}

export function parseDriveFolderId(url: string): string | null {
  const trimmed = url.trim();
  const folder = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (folder?.[1]) return folder[1];
  const idParam = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  return idParam?.[1] ?? null;
}

export function validateDriveFolderContract(presentNames: string[]): DriveFolderContract {
  const present: DriveFolderRole[] = [];
  const unknown: string[] = [];
  for (const raw of presentNames) {
    const name = raw.replace(/\/+$/, "");
    const parsed = DriveFolderRoleSchema.safeParse(name);
    if (parsed.success) {
      if (!present.includes(parsed.data)) present.push(parsed.data);
    } else if (name) {
      unknown.push(name);
    }
  }
  const missing = REQUIRED_DRIVE_FOLDER_ROLES.filter((role) => !present.includes(role));
  return DriveFolderContractSchema.parse({
    valid: missing.length === 0,
    required: [...REQUIRED_DRIVE_FOLDER_ROLES],
    present,
    missing,
    unknown,
  });
}

export function folderRoleFromPath(path: string): DriveFolderRole | null {
  const first = path.replace(/^\/+/, "").split("/")[0];
  const parsed = DriveFolderRoleSchema.safeParse(first);
  return parsed.success ? parsed.data : null;
}

export class FixtureDriveAssetSource implements DriveAssetSource {
  readonly mode = "fixture" as const;
  readonly read_only = true as const;

  constructor(private readonly trees: Record<string, DriveFixtureTree> = DEFAULT_DRIVE_FIXTURE_TREES) {}

  private treeFor(brand_id: BrandId, folder_id: string): DriveFixtureTree {
    const tree = this.trees[brand_id];
    if (!tree) {
      throw new DriveNotConfiguredError(brand_id);
    }
    if (tree.folder_id !== folder_id) {
      throw new Error(
        `Drive folder ${folder_id} is not the registered folder for ${brand_id}`,
      );
    }
    return tree;
  }

  async listFolderContract(
    brand_id: BrandId,
    folder_id: string,
  ): Promise<DriveFolderContract> {
    const tree = this.treeFor(brand_id, folder_id);
    return validateDriveFolderContract(tree.folders);
  }

  async listFiles(brand_id: BrandId, folder_id: string): Promise<DriveListedFile[]> {
    const tree = this.treeFor(brand_id, folder_id);
    return tree.files.map((f) => DriveListedFileSchema.parse(f));
  }
}

type DriveApiFile = {
  id?: string;
  name?: string;
  mimeType?: string;
  md5Checksum?: string;
  modifiedTime?: string;
};

/**
 * Optional live Google Drive client. Read-only files.list inside the
 * registered folder. Never downloads bytes. Not used by `pnpm test`.
 */
export class GoogleDriveAssetSource implements DriveAssetSource {
  readonly mode = "google_drive" as const;
  readonly read_only = true as const;
  readonly auth_kind: DriveAuthKind;

  constructor(
    private readonly accessTokenOrProvider: string | DriveAccessTokenProvider,
    private readonly fetchImpl: typeof fetch = fetch,
    authKind?: DriveAuthKind,
  ) {
    if (typeof accessTokenOrProvider === "string") {
      if (!accessTokenOrProvider.trim()) {
        throw new GoogleDriveCredentialsMissingError();
      }
      this.auth_kind = authKind ?? "access_token";
    } else {
      this.auth_kind = authKind ?? "service_account";
    }
  }

  private async resolveAccessToken(): Promise<string> {
    if (typeof this.accessTokenOrProvider === "string") {
      return this.accessTokenOrProvider;
    }
    const token = await this.accessTokenOrProvider();
    if (!token?.trim()) {
      throw new GoogleDriveCredentialsMissingError();
    }
    return token;
  }

  async listFolderContract(
    brand_id: BrandId,
    folder_id: string,
  ): Promise<DriveFolderContract> {
    void brand_id;
    const children = await this.listChildren(folder_id);
    const folderNames = children
      .filter((f) => f.mimeType === DRIVE_FOLDER_MIME)
      .map((f) => f.name ?? "");
    return validateDriveFolderContract(folderNames);
  }

  async listFiles(brand_id: BrandId, folder_id: string): Promise<DriveListedFile[]> {
    void brand_id;
    const children = await this.listChildren(folder_id);
    const roleFolders = new Map<DriveFolderRole, string>();
    for (const child of children) {
      if (child.mimeType !== DRIVE_FOLDER_MIME || !child.id || !child.name) continue;
      const role = DriveFolderRoleSchema.safeParse(child.name.replace(/\/+$/, ""));
      if (role.success) roleFolders.set(role.data, child.id);
    }
    const files: DriveListedFile[] = [];
    for (const role of REQUIRED_DRIVE_FOLDER_ROLES) {
      const id = roleFolders.get(role);
      if (!id) continue;
      await this.collectFiles(id, role, role, files, 1);
    }
    return files;
  }

  private async collectFiles(
    folderId: string,
    role: DriveFolderRole,
    prefix: string,
    out: DriveListedFile[],
    depth: number,
  ): Promise<void> {
    if (depth > MAX_LIST_DEPTH) return;
    const children = await this.listChildren(folderId);
    for (const child of children) {
      if (!child.id || !child.name) continue;
      if (child.mimeType === DRIVE_FOLDER_MIME) {
        await this.collectFiles(
          child.id,
          role,
          `${prefix}/${child.name}`,
          out,
          depth + 1,
        );
        continue;
      }
      const listed: DriveListedFile = {
        drive_file_id: child.id,
        name: child.name,
        mime_type: child.mimeType ?? "application/octet-stream",
        path: `${prefix}/${child.name}`,
        folder_role: role,
      };
      if (child.md5Checksum) listed.drive_md5 = child.md5Checksum;
      if (child.modifiedTime) {
        const ts = new Date(child.modifiedTime).toISOString();
        listed.modified_at = ts;
      }
      out.push(DriveListedFileSchema.parse(listed));
    }
  }

  private async listChildren(folderId: string): Promise<DriveApiFile[]> {
    const files: DriveApiFile[] = [];
    let pageToken: string | undefined;
    const escaped = folderId.replace(/'/g, "\\'");
    do {
      const url = new URL(DRIVE_API);
      url.searchParams.set("q", `'${escaped}' in parents and trashed = false`);
      url.searchParams.set("fields", "nextPageToken,files(id,name,mimeType,md5Checksum,modifiedTime)");
      url.searchParams.set("pageSize", "100");
      url.searchParams.set("supportsAllDrives", "true");
      url.searchParams.set("includeItemsFromAllDrives", "true");
      if (pageToken) url.searchParams.set("pageToken", pageToken);
      const accessToken = await this.resolveAccessToken();
      const res = await this.fetchImpl(url.toString(), {
        method: "GET",
        headers: {
          authorization: `Bearer ${accessToken}`,
          accept: "application/json",
        },
      });
      if (!res.ok) {
        throw new Error(
          `Google Drive list failed (${res.status}). Ingest stays read-only; check the registered folder id.`,
        );
      }
      const body = (await res.json()) as {
        files?: DriveApiFile[];
        nextPageToken?: string;
      };
      files.push(...(body.files ?? []));
      pageToken = body.nextPageToken;
    } while (pageToken);
    return files;
  }
}

export function resolveDriveSourceMode(
  override?: DriveSourceMode,
): DriveSourceMode {
  if (override) return override;
  const env = process.env.MOS_DRIVE_SOURCE?.trim().toLowerCase();
  return env === "google_drive" || env === "google" ? "google_drive" : "fixture";
}

export function createDriveAssetSource(opts?: {
  mode?: DriveSourceMode;
  trees?: Record<string, DriveFixtureTree>;
  accessToken?: string;
  serviceAccountJson?: string;
  serviceAccountFile?: string;
  tokenProvider?: DriveAccessTokenProvider;
  fetchImpl?: typeof fetch;
  env?: NodeJS.ProcessEnv;
  readFile?: (path: string) => string;
}): DriveAssetSource {
  const mode = resolveDriveSourceMode(opts?.mode);
  if (mode === "google_drive") {
    const fetchImpl = opts?.fetchImpl ?? fetch;
    const authInput: ResolveGoogleDriveAuthInput = {
      ...(opts?.accessToken !== undefined ? { accessToken: opts.accessToken } : {}),
      ...(opts?.serviceAccountJson !== undefined
        ? { serviceAccountJson: opts.serviceAccountJson }
        : {}),
      ...(opts?.serviceAccountFile !== undefined
        ? { serviceAccountFile: opts.serviceAccountFile }
        : {}),
      ...(opts?.tokenProvider ? { tokenProvider: opts.tokenProvider } : {}),
      ...(opts?.env ? { env: opts.env } : {}),
      ...(opts?.readFile ? { readFile: opts.readFile } : {}),
    };
    const auth = resolveGoogleDriveAuth(authInput);
    if (auth.kind === "access_token") {
      return new GoogleDriveAssetSource(auth.token, fetchImpl, "access_token");
    }
    const provider =
      auth.provider ??
      createServiceAccountTokenProvider({
        credentials: auth.credentials!,
        fetchImpl,
      });
    return new GoogleDriveAssetSource(provider, fetchImpl, "service_account");
  }
  return new FixtureDriveAssetSource(opts?.trees ?? DEFAULT_DRIVE_FIXTURE_TREES);
}
