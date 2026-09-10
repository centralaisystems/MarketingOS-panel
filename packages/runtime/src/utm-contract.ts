import {
  UtmParamsSchema,
  type BrandId,
  type UtmParams,
} from "@marketing-os/contracts";

export function evaluateUtmContract(
  brand_id: BrandId,
  raw: unknown,
): { utm?: UtmParams; utm_valid: boolean; utm_issues: string[] } {
  if (raw === undefined || raw === null) {
    return {
      utm_valid: false,
      utm_issues: ["MISSING utm — row is not UTM-contract attributed"],
    };
  }
  const parsed = UtmParamsSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      utm_valid: false,
      utm_issues: parsed.error.issues.map(
        (i) => `${i.path.join(".") || "utm"}: ${i.message}`,
      ),
    };
  }
  if (parsed.data.brand_id !== brand_id) {
    return {
      utm: parsed.data,
      utm_valid: false,
      utm_issues: [
        `utm.brand_id ${parsed.data.brand_id} does not match active ${brand_id}`,
      ],
    };
  }
  return { utm: parsed.data, utm_valid: true, utm_issues: [] };
}
