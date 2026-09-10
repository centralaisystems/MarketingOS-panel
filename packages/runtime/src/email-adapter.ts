import {
  EmailModeSchema,
  type BrandId,
  type EmailMode,
  type EmailOutboxItem,
  type EmailTemplateKind,
} from "@marketing-os/contracts";

export type EmailDispatchInput = {
  brand_id: BrandId;
  template: EmailTemplateKind;
  to: string[];
  cc: string[];
  subject: string;
  text_body: string;
  html_body: string;
  idempotency_key: string;
};

export type EmailDispatchResult = {
  mode: EmailMode;
  status: EmailOutboxItem["status"];
  provider_message_id?: string;
  message: string;
};

export interface EmailAdapter {
  mode: EmailMode;
  dispatch(input: EmailDispatchInput): Promise<EmailDispatchResult>;
}

export class EmailModeBlockedError extends Error {
  readonly code = "EMAIL_MODE_BLOCKED" as const;
  constructor(message: string) {
    super(message);
    this.name = "EmailModeBlockedError";
  }
}

export function resolveEmailMode(raw?: string): EmailMode {
  const value = (raw ?? process.env.MOS_EMAIL_MODE ?? "dry_run")
    .trim()
    .toLowerCase();
  if (value === "resend") return EmailModeSchema.parse("resend");
  return "dry_run";
}

export class DryRunEmailAdapter implements EmailAdapter {
  readonly mode: EmailMode = "dry_run";

  async dispatch(input: EmailDispatchInput): Promise<EmailDispatchResult> {
    return {
      mode: "dry_run",
      status: "RECORDED",
      message: `Dry-run recorded ${input.template} for ${input.brand_id}. No Resend call.`,
    };
  }
}

export class ResendHttpEmailAdapter implements EmailAdapter {
  readonly mode: EmailMode = "resend";

  constructor(
    private readonly opts: {
      apiKey: string;
      from: string;
      fetchImpl?: typeof fetch;
    },
  ) {}

  async dispatch(input: EmailDispatchInput): Promise<EmailDispatchResult> {
    const fetchImpl = this.opts.fetchImpl ?? fetch;
    const res = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.opts.apiKey}`,
        "content-type": "application/json",
        "idempotency-key": input.idempotency_key,
      },
      body: JSON.stringify({
        from: this.opts.from,
        to: input.to,
        ...(input.cc.length ? { cc: input.cc } : {}),
        subject: input.subject,
        text: input.text_body,
        html: input.html_body,
      }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      id?: string;
      message?: string;
      error?: { message?: string };
    };
    if (!res.ok) {
      return {
        mode: "resend",
        status: "FAILED",
        message:
          body.error?.message ??
          body.message ??
          `Resend HTTP ${res.status}`,
      };
    }
    return {
      mode: "resend",
      status: "SENT",
      ...(body.id ? { provider_message_id: body.id } : {}),
      message: `Resend accepted ${input.template}`,
    };
  }
}

export function createEmailAdapter(opts?: {
  mode?: EmailMode;
  apiKey?: string;
  from?: string;
  fetchImpl?: typeof fetch;
}): EmailAdapter {
  const mode = opts?.mode ?? resolveEmailMode();
  if (mode === "dry_run") {
    return new DryRunEmailAdapter();
  }
  const apiKey = (opts?.apiKey ?? process.env.RESEND_API_KEY ?? "").trim();
  if (!apiKey) {
    throw new EmailModeBlockedError(
      "MOS_EMAIL_MODE=resend requires RESEND_API_KEY. Use dry_run for CI and local.",
    );
  }
  const from =
    (opts?.from ?? process.env.MOS_EMAIL_FROM ?? "").trim() ||
    "Marketing OS <noreply@example.test>";
  return new ResendHttpEmailAdapter({
    apiKey,
    from,
    ...(opts?.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}),
  });
}
