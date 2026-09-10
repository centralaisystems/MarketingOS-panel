# PHASE 2D — Critical Blocker Decision Book

**Purpose:** Clear the remaining readiness-critical fields so brands can reach `READY_FOR_INTERNAL_DRAFTS`.  
**Scope:** Critical paths only (`identity.location_markets`, `positioning.positioning_statement`, `positioning.category`, `voice.tone`, `claims.prohibited_claims`).  
**Rule:** Do not invent new commercial claims, ROI, named partners, or cross-brand links. Prefer values already supported by Phase 2C VERIFIED pack fields or conservative operating restrictions.  
**Phase 3:** Not started. Not authorized by this pass.

Machine-readable decisions: [`PHASE_2D_DECISIONS.json`](PHASE_2D_DECISIONS.json).

---

## LOTIN

### LQ-2D-01 — Positioning statement (critical MISSING)
**Need:** `positioning.positioning_statement`  
**Candidate (derived from VERIFIED identity.description):**  
Lotin Real Estate is a UAE real estate brokerage and advisory firm for investors, home buyers, international buyers entering Dubai, and property owners — focused on residential sales, leasing, property management, sales representation, and private portfolio advisory (not fund management).  
**Recommended:** EDIT  
**Operator decision:** [filled in PHASE_2D_DECISIONS.json]

### LQ-2D-02 — Voice tone (critical MISSING)
**Need:** `voice.tone`  
**Candidate (public-site observation; not a full brand kit):** Professional, Trust-focused, Discreet  
**Recommended:** EDIT (Brand Intelligence for internal drafts; expand kit later)  
**Operator decision:** [filled in PHASE_2D_DECISIONS.json]

---

## Villa Glory

### VG-2D-01 — Voice tone (critical MISSING)
**Need:** `voice.tone`  
**Candidate (aligned with VERIFIED luxury / private-consultation positioning):** Refined, Warm, Consultative, Premium  
**Recommended:** EDIT  
**Operator decision:** [filled in PHASE_2D_DECISIONS.json]

### VG-2D-02 — Prohibited claims (critical UNVERIFIED)
**Need:** `claims.prohibited_claims`  
**Candidate (existing precautionary list + operating restrictions):**  
Do not invent product specs, prices, or stock; do not claim materials/certifications without verification; do not invent exclusivity or superiority claims.  
**Recommended:** VERIFY as MarketingOS operating restrictions (`marketing_approved=false`)  
**Operator decision:** [filled in PHASE_2D_DECISIONS.json]

---

## NOX FORM

### NF-2D-01 — Positioning category (critical UNVERIFIED)
**Need:** `positioning.category`  
**Candidate (consistent with VERIFIED positioning_statement):** `architecture_interior_design_turnkey`  
**Recommended:** VERIFY  
**Operator decision:** [filled in PHASE_2D_DECISIONS.json]

### NF-2D-02 — Prohibited claims (critical UNVERIFIED)
**Need:** `claims.prohibited_claims`  
**Candidate (existing precautionary list):** Do not invent completed projects, awards, or client names; do not fabricate timelines or budgets.  
**Recommended:** VERIFY as operating restrictions (`marketing_approved=false`)  
**Operator decision:** [filled in PHASE_2D_DECISIONS.json]

---

## NOX TECH

### NT-2D-01 — Location markets (critical MISSING)
**Need:** `identity.location_markets`  
**Candidate (internal orientation from product/audience context; not campaign geo approval):** `GCC`  
**Recommended:** EDIT with `marketing_approved=false` until campaign-level markets are confirmed  
**Operator decision:** [filled in PHASE_2D_DECISIONS.json]

### NT-2D-02 — Positioning category (critical UNVERIFIED)
**Need:** `positioning.category`  
**Candidate (aligned with VERIFIED positioning_statement):** `ai_assisted_sales_implementation`  
**Recommended:** EDIT  
**Operator decision:** [filled in PHASE_2D_DECISIONS.json]

### NT-2D-03 — Voice tone (critical MISSING)
**Need:** `voice.tone`  
**Candidate:** Clear, Technical, Professional, Implementation-focused  
**Recommended:** EDIT for internal drafts  
**Operator decision:** [filled in PHASE_2D_DECISIONS.json]

---

## After apply

1. `pnpm apply-brand-decisions -- --file reports/onboarding/PHASE_2D_DECISIONS.json`
2. `pnpm onboard-all`
3. Confirm no critical blockers; expect at least `READY_FOR_INTERNAL_DRAFTS`.
4. **Do not start Phase 3** without explicit approval.
