/**
 * Placeholder / demo / sample rejection for Phase 2B extraction.
 */
const PLACEHOLDER_PATTERNS: RegExp[] = [
  /\blorem\s+ipsum\b/i,
  /\bplaceholder\b/i,
  /\bsample\b/i,
  /\bdemo\s+data\b/i,
  /\btest\s+product\b/i,
  /\bfixture\b/i,
  /\btodo\b/i,
  /\bcoming\s+soon\b/i,
  /\bexample@/i,
  /\bxxx+\b/i,
  /\byour\s+(company|brand|name)\s+here\b/i,
  /\bvilla-glory-crm-test-product\b/i,
  /\bcrm[- ]?test\b/i,
  /\bqa\s+product\b/i,
];

export function isPlaceholderOrDemoContent(text: string): boolean {
  return PLACEHOLDER_PATTERNS.some((re) => re.test(text));
}

export function filterPlaceholderCandidates<
  T extends { candidate_value: unknown; evidence_summary: string },
>(items: T[]): { kept: T[]; rejected: Array<T & { rejection_reason: string }> } {
  const kept: T[] = [];
  const rejected: Array<T & { rejection_reason: string }> = [];
  for (const item of items) {
    const blob = `${JSON.stringify(item.candidate_value)} ${item.evidence_summary}`;
    if (isPlaceholderOrDemoContent(blob)) {
      rejected.push({
        ...item,
        rejection_reason: "Matched placeholder/demo/sample filter",
      });
    } else {
      kept.push(item);
    }
  }
  return { kept, rejected };
}

/**
 * Marketing claim language that must not auto-approve from code/docs alone.
 */
export function looksLikeUnverifiedMarketingClaim(text: string): boolean {
  return (
    /\b\d+\s*[-–—]\s*\d+%\s*roi\b/i.test(text) ||
    /\bguaranteed?\b/i.test(text) ||
    /\bbest\s+in\s+(the\s+)?(world|uae|market)\b/i.test(text) ||
    /\bno\s+#1\b/i.test(text)
  );
}
