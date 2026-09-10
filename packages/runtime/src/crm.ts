import { randomUUID } from "node:crypto";
import {
  AgentLeadSummarySchema,
  CampaignAttributionSummarySchema,
  LeadAttributionRowSchema,
  LeadEventSchema,
  LeadRecordSchema,
  OpportunitySchema,
  type AgentLeadSummary,
  type BrandId,
  type CampaignAttributionSummary,
  type Lead,
  type LeadAttributionRow,
  type LeadEvent,
  type LeadRecord,
  type LeadSource,
  type Opportunity,
} from "@marketing-os/contracts";
import { assertWaveEnabled } from "./phase-gates.js";
import { assertRegisteredBrandId, brandsRootOpt } from "./brand-registry.js";
import { CrossBrandDeniedError, type OpsStore } from "./ops-store.js";
import {
  assertOpaquePiiRef,
  containsRawPii,
  defaultPiiVault,
  type SealedPiiVault,
} from "./pii-vault.js";
import {
  WAVE7_VILLA_GLORY_FIXTURES,
  type Wave7InboundFixture,
} from "./fixtures/wave7-crm.js";

export class CrmInputError extends Error {
  readonly status = 400;
  constructor(message: string) {
    super(message);
    this.name = "CrmInputError";
  }
}

export type CrmRuntimeOpts = {
  store: OpsStore;
  vault?: SealedPiiVault;
  brandsRoot?: string;
};

function crmVault(opts?: { vault?: SealedPiiVault }): SealedPiiVault {
  return opts?.vault ?? defaultPiiVault;
}

function requireSameBrand(active: BrandId, recordBrand: BrandId): void {
  if (active !== recordBrand) {
    throw new CrossBrandDeniedError(active, recordBrand);
  }
}

function requireCampaign(
  store: OpsStore,
  brand_id: BrandId,
  campaign_id: string,
): void {
  const campaign = store.getCampaign(brand_id, campaign_id);
  if (!campaign) {
    throw new CrmInputError(`campaign not found for ${brand_id}: ${campaign_id}`);
  }
  if (campaign.brand_id !== brand_id) {
    throw new CrossBrandDeniedError(brand_id, campaign.brand_id);
  }
}

function assertAgentSafe(payload: unknown, label: string): void {
  if (containsRawPii(payload)) {
    throw new CrmInputError(
      `${label} would expose raw PII to an agent-facing or logged payload`,
    );
  }
}

export function toAgentLeadSummary(
  lead: Lead,
  vault: SealedPiiVault = defaultPiiVault,
): AgentLeadSummary {
  const summary = AgentLeadSummarySchema.parse({
    brand_id: lead.brand_id,
    lead_id: lead.lead_id,
    pii_ref: lead.pii_ref,
    source: lead.source,
    stage: lead.stage,
    ...(lead.campaign_id ? { campaign_id: lead.campaign_id } : {}),
    ...(lead.utm?.utm_campaign ? { utm_campaign: lead.utm.utm_campaign } : {}),
    attributed: Boolean(lead.campaign_id),
    classified_fields: vault.classify(lead.pii_ref),
  });
  assertAgentSafe(summary, "agent lead summary");
  return summary;
}

/**
 * Wave 7 CRM — store only opaque pii_ref. Never put raw PII into prompts/memory.
 */
export function createLeadDraft(input: {
  brand_id: string;
  pii_ref: string;
  source: LeadRecord["source"];
  campaign_id?: string;
  utm?: Lead["utm"];
  stage?: Lead["stage"];
  brandsRoot?: string;
}): LeadRecord {
  assertOpaquePiiRef(input.pii_ref);
  assertWaveEnabled("WAVE_7_CRM", brandsRootOpt(input.brandsRoot));
  const brand_id = assertRegisteredBrandId(
    input.brand_id,
    brandsRootOpt(input.brandsRoot),
  );
  const now = new Date().toISOString();
  const lead = LeadRecordSchema.parse({
    lead_id: randomUUID(),
    brand_id,
    pii_ref: input.pii_ref,
    source: input.source,
    ...(input.campaign_id ? { campaign_id: input.campaign_id } : {}),
    ...(input.utm ? { utm: input.utm } : {}),
    stage: input.stage ?? "NEW",
    created_at: now,
    updated_at: now,
  });
  assertAgentSafe(lead, "lead draft");
  return lead;
}

function persistLeadEvent(
  store: OpsStore,
  event: Omit<LeadEvent, "event_id">,
): LeadEvent {
  const parsed = LeadEventSchema.parse({
    ...event,
    event_id: randomUUID(),
  });
  assertAgentSafe(parsed, "lead event");
  return store.insertLeadEvent(parsed.brand_id, parsed);
}

function persistLead(
  store: OpsStore,
  lead: Lead,
  opts?: { actor?: string },
): Lead {
  const existing = store
    .listLeads(lead.brand_id, { limit: 200 })
    .find((row) => row.pii_ref === lead.pii_ref);
  if (existing) return existing;

  const stored = store.insertLead(lead.brand_id, lead);
  persistLeadEvent(store, {
    brand_id: stored.brand_id,
    lead_id: stored.lead_id,
    pii_ref: stored.pii_ref,
    kind: "INGESTED",
    source: stored.source,
    ...(stored.campaign_id ? { campaign_id: stored.campaign_id } : {}),
    ...(stored.utm ? { utm: stored.utm } : {}),
    message: `Lead ingested via ${stored.source} (pii_ref only)`,
    created_at: stored.created_at,
  });
  store.appendAudit(stored.brand_id, {
    brand_id: stored.brand_id,
    event_type: "LEAD_INGESTED",
    message: `Lead ${stored.lead_id} ingested from ${stored.source}`,
    metadata: {
      lead_id: stored.lead_id,
      pii_ref: stored.pii_ref,
      source: stored.source,
      campaign_id: stored.campaign_id ?? null,
      actor: opts?.actor ?? "crm-adapter",
    },
  });
  if (stored.campaign_id) {
    persistLeadEvent(store, {
      brand_id: stored.brand_id,
      lead_id: stored.lead_id,
      pii_ref: stored.pii_ref,
      kind: "ATTRIBUTED",
      source: stored.source,
      campaign_id: stored.campaign_id,
      ...(stored.utm ? { utm: stored.utm } : {}),
      message: `Attributed to campaign ${stored.campaign_id}`,
      created_at: stored.created_at,
    });
    store.appendAudit(stored.brand_id, {
      brand_id: stored.brand_id,
      event_type: "LEAD_ATTRIBUTED",
      message: `Lead ${stored.lead_id} attributed to campaign ${stored.campaign_id}`,
      metadata: {
        lead_id: stored.lead_id,
        pii_ref: stored.pii_ref,
        campaign_id: stored.campaign_id,
        utm_campaign: stored.utm?.utm_campaign ?? null,
      },
    });
  }
  return stored;
}

export function ingestLeadFromAdapter(
  input: {
    brand_id: string;
    source: LeadSource;
    campaign_id?: string;
    utm?: Lead["utm"];
    stage?: Lead["stage"];
    pii_ref?: string;
    email?: string;
    phone?: string;
    actor?: string;
    create_opportunity?: boolean;
  },
  opts: CrmRuntimeOpts,
): {
  lead: Lead;
  opportunity: Opportunity | null;
  agent_summary: AgentLeadSummary;
} {
  assertWaveEnabled("WAVE_7_CRM", brandsRootOpt(opts.brandsRoot));
  const brand_id = assertRegisteredBrandId(
    input.brand_id,
    brandsRootOpt(opts.brandsRoot),
  );
  if (input.campaign_id) {
    requireCampaign(opts.store, brand_id, input.campaign_id);
  }
  const vault = crmVault(opts);
  const sealed = vault.seal({
    brand_id,
    ...(input.email ? { email: input.email } : {}),
    ...(input.phone ? { phone: input.phone } : {}),
    ...(input.pii_ref ? { pii_ref: input.pii_ref } : {}),
  });
  const lead = persistLead(
    opts.store,
    createLeadDraft({
      brand_id,
      pii_ref: sealed.pii_ref,
      source: input.source,
      ...(input.campaign_id ? { campaign_id: input.campaign_id } : {}),
      ...(input.utm ? { utm: input.utm } : {}),
      ...(input.stage ? { stage: input.stage } : {}),
      ...brandsRootOpt(opts.brandsRoot),
    }),
    input.actor ? { actor: input.actor } : {},
  );
  const agent_summary = toAgentLeadSummary(lead, vault);
  opts.store.insertAgentRun(brand_id, {
    run_id: randomUUID(),
    brand_id,
    agent: "A12_CRM_LEAD_INTELLIGENCE",
    result: agent_summary,
    created_at: lead.created_at,
  });
  let opportunity: Opportunity | null = null;
  if (input.create_opportunity) {
    opportunity = createOpportunityForLead(
      {
        brand_id,
        lead_id: lead.lead_id,
      },
      opts,
    );
  }
  return {
    lead,
    opportunity,
    agent_summary,
  };
}

export function ingestFormLeadStub(
  input: {
    brand_id: string;
    campaign_id?: string;
    utm?: Lead["utm"];
    email?: string;
    phone?: string;
    pii_ref?: string;
    actor?: string;
  },
  opts: CrmRuntimeOpts,
) {
  return ingestLeadFromAdapter(
    {
      ...input,
      source: "FORM",
      actor: input.actor ?? "form_stub",
    },
    opts,
  );
}

export function ingestWhatsAppLeadStub(
  input: {
    brand_id: string;
    campaign_id?: string;
    utm?: Lead["utm"];
    email?: string;
    phone?: string;
    pii_ref?: string;
    actor?: string;
    create_opportunity?: boolean;
  },
  opts: CrmRuntimeOpts,
) {
  return ingestLeadFromAdapter(
    {
      ...input,
      source: "WHATSAPP",
      actor: input.actor ?? "whatsapp_stub",
      create_opportunity: input.create_opportunity ?? true,
      stage: "QUALIFIED",
    },
    opts,
  );
}

function ingestFixtureRow(
  row: Wave7InboundFixture,
  campaign_id: string | undefined,
  opts: CrmRuntimeOpts,
) {
  return ingestLeadFromAdapter(
    {
      brand_id: row.brand_id,
      source: row.source,
      pii_ref: row.pii_ref,
      email: row.inbound.email,
      phone: row.inbound.phone,
      utm: row.utm,
      stage: row.stage,
      create_opportunity: row.create_opportunity,
      actor: row.adapter,
      ...(campaign_id ? { campaign_id } : {}),
    },
    opts,
  );
}

export function ingestVillaGloryFixtureLeads(
  opts: CrmRuntimeOpts & {
    brand_id: string;
    campaign_id?: string;
  },
): {
  brand_id: BrandId;
  leads: Lead[];
  opportunities: Opportunity[];
  agent_summaries: AgentLeadSummary[];
} {
  assertWaveEnabled("WAVE_7_CRM", brandsRootOpt(opts.brandsRoot));
  const brand_id = assertRegisteredBrandId(
    opts.brand_id,
    brandsRootOpt(opts.brandsRoot),
  );
  if (brand_id !== "VILLA_GLORY") {
    throw new CrmInputError(
      `Wave 7 fixture ingest is Villa Glory first. No fixtures for ${brand_id}.`,
    );
  }
  if (opts.campaign_id) {
    requireCampaign(opts.store, brand_id, opts.campaign_id);
  }
  const leads: Lead[] = [];
  const opportunities: Opportunity[] = [];
  const agent_summaries: AgentLeadSummary[] = [];
  for (const row of WAVE7_VILLA_GLORY_FIXTURES) {
    const ingested = ingestFixtureRow(row, opts.campaign_id, opts);
    leads.push(ingested.lead);
    if (ingested.opportunity) opportunities.push(ingested.opportunity);
    agent_summaries.push(ingested.agent_summary);
  }
  return { brand_id, leads, opportunities, agent_summaries };
}

export function createOpportunityForLead(
  input: { brand_id: string; lead_id: string },
  opts: CrmRuntimeOpts,
): Opportunity {
  assertWaveEnabled("WAVE_7_CRM", brandsRootOpt(opts.brandsRoot));
  const brand_id = assertRegisteredBrandId(
    input.brand_id,
    brandsRootOpt(opts.brandsRoot),
  );
  const lead = opts.store.getLead(brand_id, input.lead_id);
  if (!lead) {
    throw new CrmInputError(`lead not found for ${brand_id}: ${input.lead_id}`);
  }
  requireSameBrand(brand_id, lead.brand_id);
  const existing = opts.store
    .listOpportunities(brand_id, { limit: 200 })
    .find((row) => row.lead_id === lead.lead_id);
  if (existing) return existing;
  const opportunity = OpportunitySchema.parse({
    opportunity_id: randomUUID(),
    brand_id,
    lead_id: lead.lead_id,
    pii_ref: lead.pii_ref,
    ...(lead.campaign_id ? { campaign_id: lead.campaign_id } : {}),
    stage: "OPEN",
    created_at: new Date().toISOString(),
  });
  assertAgentSafe(opportunity, "opportunity");
  return opts.store.insertOpportunity(brand_id, opportunity);
}

export function listLeadsWithAttribution(
  store: OpsStore,
  brand_id: BrandId,
  opts?: { limit?: number },
): LeadAttributionRow[] {
  return store.listLeads(brand_id, opts).map((lead) => {
    const campaign = lead.campaign_id
      ? store.getCampaign(brand_id, lead.campaign_id)
      : null;
    const row = LeadAttributionRowSchema.parse({
      brand_id: lead.brand_id,
      lead_id: lead.lead_id,
      pii_ref: lead.pii_ref,
      source: lead.source,
      stage: lead.stage,
      ...(lead.campaign_id ? { campaign_id: lead.campaign_id } : {}),
      ...(campaign ? { campaign_objective: campaign.objective } : {}),
      ...(lead.utm ? { utm: lead.utm } : {}),
      attributed: Boolean(lead.campaign_id && campaign),
    });
    assertAgentSafe(row, "lead attribution row");
    return row;
  });
}

export function listCampaignAttribution(
  store: OpsStore,
  brand_id: BrandId,
): {
  campaigns: CampaignAttributionSummary[];
  unattributed_count: number;
} {
  const leads = store.listLeads(brand_id, { limit: 200 });
  const byCampaign = new Map<
    string,
    { objective: string; sources: Set<LeadSource>; count: number }
  >();
  let unattributed_count = 0;
  for (const lead of leads) {
    if (!lead.campaign_id) {
      unattributed_count += 1;
      continue;
    }
    const campaign = store.getCampaign(brand_id, lead.campaign_id);
    if (!campaign) {
      unattributed_count += 1;
      continue;
    }
    const current = byCampaign.get(lead.campaign_id) ?? {
      objective: campaign.objective,
      sources: new Set<LeadSource>(),
      count: 0,
    };
    current.count += 1;
    current.sources.add(lead.source);
    byCampaign.set(lead.campaign_id, current);
  }
  const campaigns = [...byCampaign.entries()].map(([campaign_id, row]) =>
    CampaignAttributionSummarySchema.parse({
      brand_id,
      campaign_id,
      objective: row.objective,
      lead_count: row.count,
      sources: [...row.sources],
    }),
  );
  return { campaigns, unattributed_count };
}

export function listLeadEvents(
  store: OpsStore,
  brand_id: BrandId,
  opts?: { lead_id?: string; limit?: number },
): LeadEvent[] {
  return store.listLeadEvents(brand_id, opts);
}

export function listOpportunities(
  store: OpsStore,
  brand_id: BrandId,
  opts?: { limit?: number },
): Opportunity[] {
  return store.listOpportunities(brand_id, opts);
}
