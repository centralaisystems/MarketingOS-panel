import type { LeadSource, LeadStage, LeadUtm } from "@marketing-os/contracts";

/**
 * Villa Glory first. Inbound contact fields exist only to prove tokenization.
 * They must never be copied into leads, events, audit, memory, or agent summaries.
 */
export const WAVE7_FORM_ADAPTER = "form_stub" as const;
export const WAVE7_WHATSAPP_ADAPTER = "whatsapp_stub" as const;

export type Wave7InboundFixture = {
  brand_id: "VILLA_GLORY";
  adapter: typeof WAVE7_FORM_ADAPTER | typeof WAVE7_WHATSAPP_ADAPTER;
  source: LeadSource;
  pii_ref: string;
  inbound: {
    email: string;
    phone: string;
  };
  utm: LeadUtm;
  stage: LeadStage;
  create_opportunity: boolean;
};

export const WAVE7_VILLA_GLORY_FORM_FIXTURE: Wave7InboundFixture = {
  brand_id: "VILLA_GLORY",
  adapter: WAVE7_FORM_ADAPTER,
  source: "FORM",
  pii_ref: "vault:vg_form_enquiry_01",
  inbound: {
    email: "vg.form.enquiry@example.invalid",
    phone: "+15550001111",
  },
  utm: {
    utm_source: "meta",
    utm_medium: "paid_social",
    utm_campaign: "villa_glory_enquiry",
    channel: "meta",
  },
  stage: "NEW",
  create_opportunity: false,
};

export const WAVE7_VILLA_GLORY_WHATSAPP_FIXTURE: Wave7InboundFixture = {
  brand_id: "VILLA_GLORY",
  adapter: WAVE7_WHATSAPP_ADAPTER,
  source: "WHATSAPP",
  pii_ref: "vault:vg_whatsapp_enquiry_01",
  inbound: {
    email: "vg.whatsapp.enquiry@example.invalid",
    phone: "+15550002222",
  },
  utm: {
    utm_source: "whatsapp",
    utm_medium: "organic_social",
    utm_campaign: "villa_glory_enquiry",
    channel: "whatsapp",
  },
  stage: "QUALIFIED",
  create_opportunity: true,
};

export const WAVE7_VILLA_GLORY_FIXTURES: Wave7InboundFixture[] = [
  WAVE7_VILLA_GLORY_FORM_FIXTURE,
  WAVE7_VILLA_GLORY_WHATSAPP_FIXTURE,
];

export function wave7RawPiiSamples(): string[] {
  return WAVE7_VILLA_GLORY_FIXTURES.flatMap((row) => [
    row.inbound.email,
    row.inbound.phone,
  ]);
}
