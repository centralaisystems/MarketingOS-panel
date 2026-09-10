import { randomUUID } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  CampaignPackSchema,
  type BrandId,
  type CampaignPack,
} from "@marketing-os/contracts";
import { loadBrandContext } from "./brand-loader.js";
import { loadBrandPack } from "./brand-pack.js";
import {
  assertRegisteredBrandId,
  brandsRootOpt,
  slugForBrandId,
} from "./brand-registry.js";
import { assertWaveEnabled } from "./phase-gates.js";
import type { AuditSink } from "./audit.js";
import { InMemoryAuditSink } from "./audit.js";
import { createResearchTask, runResearchIntelligence } from "./agents/research.js";
import { createCompetitorTask, runCompetitorIntelligence } from "./agents/competitor.js";
import { createStrategistTask, runBrandStrategist } from "./agents/brand-strategist.js";
import { createContentTask, runContentCopy } from "./agents/content.js";
import { createSocialTask, runSocialManager } from "./agents/social.js";
import { createCreativeTask, runCreativeDirector } from "./agents/creative.js";
import { createPaidGrowthTask, runPaidGrowthRecommend } from "./agents/paid-growth.js";
import { runBrandGuardian } from "./agents/brand-guardian.js";

export function buildCampaignPack(input: {
  brand_id: BrandId;
  objective: string;
  requested_by?: string;
  brandsRoot?: string;
  audit?: AuditSink;
  writeReport?: boolean;
  reportRoot?: string;
}): CampaignPack {
  assertWaveEnabled("WAVE_2_CONTENT_FACTORY", brandsRootOpt(input.brandsRoot));
  const brand_id = assertRegisteredBrandId(
    input.brand_id,
    brandsRootOpt(input.brandsRoot),
  );
  const audit = input.audit ?? new InMemoryAuditSink();
  const requested_by = input.requested_by ?? "operator";

  const { profile } = loadBrandContext(brand_id, audit, {
    ...(input.brandsRoot ? { brandsRoot: input.brandsRoot } : {}),
  });
  const pack = loadBrandPack(brand_id, audit, {
    ...(input.brandsRoot ? { brandsRoot: input.brandsRoot } : {}),
  });

  const researchTask = createResearchTask(brand_id, input.objective, requested_by);
  const research = runResearchIntelligence(researchTask, profile, audit);

  const competitorTask = createCompetitorTask(
    brand_id,
    input.objective,
    requested_by,
    researchTask.task_id,
  );
  const competitor = runCompetitorIntelligence(competitorTask, pack, audit);

  const strategyTask = createStrategistTask(
    brand_id,
    input.objective,
    requested_by,
    researchTask.task_id,
  );
  const strategy = runBrandStrategist(strategyTask, profile, audit);

  const contentTask = createContentTask(
    brand_id,
    input.objective,
    requested_by,
    strategyTask.task_id,
  );
  const content = runContentCopy(contentTask, profile, audit);

  const socialTask = createSocialTask(
    brand_id,
    input.objective,
    requested_by,
    contentTask.task_id,
  );
  const social = runSocialManager(socialTask, pack, content, audit);

  const creativeTask = createCreativeTask(
    brand_id,
    input.objective,
    requested_by,
    contentTask.task_id,
  );
  const creative = runCreativeDirector(creativeTask, pack, audit);

  const paidTask = createPaidGrowthTask(
    brand_id,
    input.objective,
    requested_by,
    strategyTask.task_id,
  );
  const paid = runPaidGrowthRecommend(paidTask, pack, audit);

  const reviewedSubjects = [
    { subject: "content", verdict: runBrandGuardian(content, profile, audit, contentTask) },
    { subject: "social", verdict: runBrandGuardian(social, profile, audit, socialTask) },
    { subject: "creative", verdict: runBrandGuardian(creative, profile, audit, creativeTask) },
  ] as const;
  const guardianReasons = reviewedSubjects.flatMap(({ subject, verdict }) => {
    if (verdict.passed) return [];
    if (verdict.reasons.length === 0) {
      return [`${subject}: Guardian rejected without reasons`];
    }
    return verdict.reasons.map((reason) => `${subject}: ${reason}`);
  });
  const guardianPassed = reviewedSubjects.every(({ verdict }) => verdict.passed);

  const campaign = CampaignPackSchema.parse({
    pack_id: randomUUID(),
    brand_id,
    objective: input.objective,
    generated_at: new Date().toISOString(),
    approval_level_cap: "LEVEL_1",
    research: research,
    competitor: competitor,
    strategy: strategy,
    content_drafts: [content],
    social_calendar: social,
    creative_briefs: [creative],
    video_briefs: [],
    seo_plan: {
      status: "STUB",
      note: "SEO runtime reserved for later Wave 2 expansion",
    },
    paid_recommendations: paid,
    guardian: {
      passed: guardianPassed,
      reasons: guardianReasons,
      reviewed: reviewedSubjects.map(({ subject }) => subject),
    },
    approvable: guardianPassed,
    live_publish: false,
    live_ads: false,
  });

  if (input.writeReport !== false) {
    const slug = slugForBrandId(brand_id, brandsRootOpt(input.brandsRoot));
    const root =
      input.reportRoot ??
      join(
        input.brandsRoot
          ? join(input.brandsRoot, "..", "reports", "campaigns")
          : join(process.cwd(), "reports", "campaigns"),
        slug,
      );
    mkdirSync(root, { recursive: true });
    const path = join(root, `${campaign.pack_id}.json`);
    writeFileSync(path, JSON.stringify(campaign, null, 2) + "\n");
  }

  return campaign;
}
