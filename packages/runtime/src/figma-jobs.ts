import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import {
  FigmaArrangeJobSchema,
  FigmaArrangeJobSnapshotSchema,
  type BrandId,
  type FigmaArrangeJob,
} from "@marketing-os/contracts";
import { CrossBrandDeniedError } from "./ops-store.js";

export interface FigmaArrangeJobStore {
  put(brand_id: BrandId, job: FigmaArrangeJob): FigmaArrangeJob;
  get(brand_id: BrandId, job_id: string): FigmaArrangeJob | null;
  list(brand_id: BrandId): FigmaArrangeJob[];
}

function assertSameBrand(active: BrandId, recordBrand: BrandId): void {
  if (active !== recordBrand) {
    throw new CrossBrandDeniedError(active, recordBrand);
  }
}

export class MemoryFigmaArrangeJobStore implements FigmaArrangeJobStore {
  protected jobs: FigmaArrangeJob[] = [];

  put(brand_id: BrandId, job: FigmaArrangeJob): FigmaArrangeJob {
    const parsed = FigmaArrangeJobSchema.parse(job);
    assertSameBrand(brand_id, parsed.brand_id);
    this.jobs = this.jobs.filter((row) => row.job_id !== parsed.job_id);
    this.jobs.push(parsed);
    return parsed;
  }

  get(brand_id: BrandId, job_id: string): FigmaArrangeJob | null {
    const found = this.jobs.find((row) => row.job_id === job_id);
    if (!found || found.brand_id !== brand_id) return null;
    return found;
  }

  list(brand_id: BrandId): FigmaArrangeJob[] {
    return [...this.jobs]
      .filter((row) => row.brand_id === brand_id)
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  }
}

export class FileFigmaArrangeJobStore extends MemoryFigmaArrangeJobStore {
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
    const snap = FigmaArrangeJobSnapshotSchema.parse(raw);
    this.jobs = snap.jobs;
  }

  private persist(): void {
    const snap = FigmaArrangeJobSnapshotSchema.parse({ jobs: this.jobs });
    const tmp = `${this.filePath}.tmp`;
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(tmp, JSON.stringify(snap, null, 2) + "\n");
    renameSync(tmp, this.filePath);
  }

  override put(brand_id: BrandId, job: FigmaArrangeJob): FigmaArrangeJob {
    const row = super.put(brand_id, job);
    this.persist();
    return row;
  }
}

export function createFigmaArrangeJobStore(opts?: {
  backend?: "memory" | "file";
  dir?: string;
}): FigmaArrangeJobStore {
  const backend = opts?.backend ?? "memory";
  if (backend === "file") {
    return new FileFigmaArrangeJobStore(
      opts?.dir ?? join(process.cwd(), "data", "figma"),
    );
  }
  return new MemoryFigmaArrangeJobStore();
}
