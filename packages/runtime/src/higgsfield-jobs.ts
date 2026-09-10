import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import {
  HiggsfieldGenerateJobSchema,
  HiggsfieldGenerateJobSnapshotSchema,
  type BrandId,
  type HiggsfieldGenerateJob,
} from "@marketing-os/contracts";
import { CrossBrandDeniedError } from "./ops-store.js";

export interface HiggsfieldGenerateJobStore {
  put(brand_id: BrandId, job: HiggsfieldGenerateJob): HiggsfieldGenerateJob;
  get(brand_id: BrandId, job_id: string): HiggsfieldGenerateJob | null;
  list(brand_id: BrandId): HiggsfieldGenerateJob[];
}

function assertSameBrand(active: BrandId, recordBrand: BrandId): void {
  if (active !== recordBrand) {
    throw new CrossBrandDeniedError(active, recordBrand);
  }
}

export class MemoryHiggsfieldGenerateJobStore implements HiggsfieldGenerateJobStore {
  protected jobs: HiggsfieldGenerateJob[] = [];

  put(brand_id: BrandId, job: HiggsfieldGenerateJob): HiggsfieldGenerateJob {
    const parsed = HiggsfieldGenerateJobSchema.parse(job);
    assertSameBrand(brand_id, parsed.brand_id);
    this.jobs = this.jobs.filter((row) => row.job_id !== parsed.job_id);
    this.jobs.push(parsed);
    return parsed;
  }

  get(brand_id: BrandId, job_id: string): HiggsfieldGenerateJob | null {
    const found = this.jobs.find((row) => row.job_id === job_id);
    if (!found || found.brand_id !== brand_id) return null;
    return found;
  }

  list(brand_id: BrandId): HiggsfieldGenerateJob[] {
    return [...this.jobs]
      .filter((row) => row.brand_id === brand_id)
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  }
}

export class FileHiggsfieldGenerateJobStore extends MemoryHiggsfieldGenerateJobStore {
  private readonly filePath: string;

  constructor(dir: string) {
    super();
    mkdirSync(dir, { recursive: true });
    this.filePath = join(dir, "jobs.json");
    this.load();
  }

  private load(): void {
    if (!existsSync(this.filePath)) {
      this.persist();
      return;
    }
    const raw = JSON.parse(readFileSync(this.filePath, "utf8")) as unknown;
    const snap = HiggsfieldGenerateJobSnapshotSchema.parse(raw);
    this.jobs = snap.jobs;
  }

  private persist(): void {
    const snap = HiggsfieldGenerateJobSnapshotSchema.parse({ jobs: this.jobs });
    const tmp = `${this.filePath}.tmp`;
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(tmp, JSON.stringify(snap, null, 2) + "\n");
    renameSync(tmp, this.filePath);
  }

  override put(brand_id: BrandId, job: HiggsfieldGenerateJob): HiggsfieldGenerateJob {
    const row = super.put(brand_id, job);
    this.persist();
    return row;
  }
}

export function createHiggsfieldGenerateJobStore(opts?: {
  backend?: "memory" | "file";
  dir?: string;
}): HiggsfieldGenerateJobStore {
  const backend = opts?.backend ?? "memory";
  if (backend === "file") {
    return new FileHiggsfieldGenerateJobStore(
      opts?.dir ?? join(process.cwd(), "data", "higgsfield"),
    );
  }
  return new MemoryHiggsfieldGenerateJobStore();
}
