# PHASE 2C — Brand Decision Book

> **Evidence-audit update — 2026-08-14:** The operator delegated a read-only local/public evidence audit. Supported decisions are recorded in `PHASE_2C_DECISIONS.json` and were applied with `marketing_approved=false`; unsupported questions remain PENDING. The original blank questionnaire below is retained as the human follow-up template. See `PHASE_2C_EVIDENCE_AUDIT.md` and `PHASE_2C_APPLY_AUDIT.json` for the current disposition and provenance.

**Purpose:** Convert Phase 2B candidate evidence into human-approved Brand Intelligence.  
**Rule:** Do **not** treat repository presence as marketing approval.  
**Status today:** All fields remain UNVERIFIED until you decide.  
**How to respond:** For each ID, set Operator decision to VERIFY / REJECT / EDIT (with correction). Then update `PHASE_2C_DECISIONS.json` the same way and run `pnpm apply-brand-decisions` only after decisions are filled.

VERIFY = accepted as current **business truth**  
Marketing approval = separate (especially ROI / guarantees / superiority)

---

# 1. LOTIN — Critical Operator Questions

Local Lotin source folder is empty. Weak orientation candidates exist — confirm or correct them.

## LQ-01 — Official identity
What is the official marketing name, and the legal entity name if different?

> Current candidate: **LOTIN** (orientation only — low confidence)  
> Confirm / Correct:

Operator decision: [ ]

## LQ-02 — One-sentence business description
In one sentence (no investment promises): what does LOTIN actually do?

> Current candidate: *(missing)*  
> Confirm / Correct:

Operator decision: [ ]

## LQ-03 — What LOTIN sells today
List only **live** offerings. Also list what marketing must **not** claim (e.g. brokerage, fund management).

> Current candidates (weak): property investment opportunities; buyer/seller support; off-plan guidance; developer partnerships  
> Confirm / Correct:

Operator decision: [ ]

## LQ-04 — Geographic markets
Which cities/countries may LOTIN market in?

> Current candidate: **Dubai, UAE** (orientation only)  
> Confirm / Correct:

Operator decision: [ ]

## LQ-05 — Customers
Who is the primary buyer? Who is explicitly **not** a target?

> Current candidate: *(missing / generic)*  
> Confirm / Correct:

Operator decision: [ ]

## LQ-06 — Developers / projects
Which developer brands or projects may be referenced by name (if any)?

Operator decision: [ ]

## LQ-07 — Property categories
Which property types are in scope (e.g. residential, off-plan, commercial)?

Operator decision: [ ]

## LQ-08 — Positioning
How should LOTIN be described vs a generic “real-estate advisory”?

> Current candidate category: **real_estate** (orientation only)  
> Confirm / Correct:

Operator decision: [ ]

## LQ-09 — Primary CTA / lead route
What is the only approved primary CTA and contact path (form, WhatsApp, call, etc.)?

Operator decision: [ ]

## LQ-10 — Languages
Which languages for public marketing (EN / AR / TR / other)?

> Current candidate: **en, ar** (orientation only)  
> Confirm / Correct:

Operator decision: [ ]

## LQ-11 — Compliance / investment claims
Confirm hard bans (no guaranteed returns, etc.) and any required disclosures.

> Current candidate prohibitions: no inventing ROI/guarantees; no fabricated inventory/pricing/developer partnerships; fresh evidence for time-sensitive property facts  
> Confirm / Correct:

Operator decision: [ ]

## LQ-12 — Channels & objectives
Near-term: which 1–2 marketing channels matter first, and what business outcome matters most (leads, consultations, etc.)?

Operator decision: [ ]

## LQ-13 — Lead qualification
What makes a lead qualified vs reject?

Operator decision: [ ]

## LQ-14 — Voice / visual direction
Any approved tone phrases, brand kit location, or visual do/don’ts?

Operator decision: [ ]

## LQ-15 — Competitors (internal only)
Names useful for internal strategy (not for public attack ads)?

Operator decision: [ ]

---

# 2. Villa Glory

## VG-01 — Brand name
**Candidate:** Villa Glory is the public brand name.  
**Source:** Villa-Glory About page  
**Evidence:** Customer-facing About copy names “Villa Glory”.  
**Current status:** UNVERIFIED  
**Recommended decision:** VERIFY  
**Confidence:** High  
**Operator decision:** [ ]

## VG-02 — Brand description
**Candidate:** Villa Glory is a UAE luxury furniture and interiors destination offering curated collections, bespoke furniture, showroom consultation, and project support.  
**Source:** About page lead  
**Evidence:** Public About paragraph.  
**Current status:** UNVERIFIED  
**Recommended decision:** VERIFY (or EDIT wording)  
**Confidence:** High  
**Operator decision:** [ ]

## VG-03 — Markets / showrooms
**Candidate:** Markets include UAE with showrooms in Dubai and Sharjah.  
**Source:** About page  
**Evidence:** “Visit our showrooms in Dubai and Sharjah…”  
**Current status:** UNVERIFIED  
**Recommended decision:** VERIFY  
**Confidence:** High  
**Operator decision:** [ ]

## VG-04 — Category & positioning
**Candidate:** Luxury furniture and interiors house serving private clients, developers, and design professionals — curated + bespoke, showroom consultation, project support.  
**Source:** About page  
**Evidence:** Combined About narrative (audiences + offer).  
**Current status:** UNVERIFIED  
**Recommended decision:** VERIFY (or EDIT)  
**Confidence:** Medium–High  
**Operator decision:** [ ]

## VG-05 — Differentiators
**Candidate:** Dubai & Sharjah showrooms; curated + bespoke furniture; Private Concierge / professional project support; quote-first commerce (no standard online checkout).  
**Source:** About + product content model  
**Evidence:** Showroom/concierge copy; documented quote-first sales model.  
**Current status:** UNVERIFIED  
**Recommended decision:** VERIFY  
**Confidence:** Medium–High  
**Operator decision:** [ ]

## VG-06 — Audiences
**Candidate:** Primary — private clients. Secondary — developers; design professionals.  
**Source:** About page  
**Evidence:** Explicit audience sentence on About.  
**Current status:** UNVERIFIED  
**Recommended decision:** VERIFY  
**Confidence:** High  
**Operator decision:** [ ]

## VG-07 — Product collections (category-level)
**Candidate:** Room collections include Living, Dining, Bedroom, Lighting, Decor, Outdoor, Office, Custom Made. (Individual SKUs not verified here. CRM-test product excluded.)  
**Source:** Collection structure doc  
**Evidence:** Documented live room-collection architecture.  
**Current status:** UNVERIFIED  
**Recommended decision:** VERIFY as **categories**, not as SKU claims  
**Confidence:** Medium  
**Operator decision:** [ ]

## VG-08 — Primary CTAs
**Candidate:** Primary CTA “Request Private Quote”; also Private Concierge and Contact.  
**Source:** Product content model + About  
**Evidence:** Quote-first UX; concierge named publicly.  
**Current status:** UNVERIFIED  
**Recommended decision:** VERIFY  
**Confidence:** High  
**Operator decision:** [ ]

## VG-09 — Official website URL
**Candidate:** *(missing in Brand Brain)* Store context mentions villa-glory.myshopify.com in ops docs — **not** auto-promoted as marketing website.  
**Source:** Internal commerce docs  
**Evidence:** Store hostname in collection docs only.  
**Current status:** MISSING / risky  
**Recommended decision:** EDIT with approved public URL, or REJECT store hostname as public site  
**Confidence:** Low for public marketing URL  
**Operator decision:** [ ]

---

# 3. NOX FORM

> Keep design-studio facts separate from Villa Glory furniture/retail facts.  
> “Luxury Furnishing” here means **studio FF&E**, not Villa Glory catalog.

## NF-01 — Brand name
**Candidate:** NOX FORM  
**Source:** NOXFORM siteConfig  
**Evidence:** `siteConfig.name`  
**Current status:** UNVERIFIED  
**Recommended decision:** VERIFY  
**Confidence:** High  
**Operator decision:** [ ]

## NF-02 — Legal / operating relationship
**Candidate:** A Division of Woodex Global LLC (legal name Woodex Global LLC).  
**Source:** siteConfig legalName / divisionNote  
**Evidence:** Explicit legal attribution in site config.  
**Current status:** UNVERIFIED  
**Recommended decision:** VERIFY after legal confirm — or EDIT  
**Confidence:** Medium  
**Operator decision:** [ ]

## NF-03 — Description / positioning
**Candidate:** Dubai-based architecture, interior design, and turnkey delivery studio for private villas, residences, and hospitality spaces. Tagline context: “Designing the Next Era of Spatial Living”.  
**Source:** siteConfig description + tagline  
**Evidence:** Public site copy.  
**Current status:** UNVERIFIED  
**Recommended decision:** VERIFY (or EDIT)  
**Confidence:** High  
**Operator decision:** [ ]

## NF-04 — Geography
**Candidate:** Dubai, UAE (studio at Dubai Investment Park 2).  
**Source:** siteConfig address / studioDescriptor  
**Evidence:** Public address fields.  
**Current status:** UNVERIFIED  
**Recommended decision:** VERIFY  
**Confidence:** High  
**Operator decision:** [ ]

## NF-05 — Website & contacts
**Candidate:** Website https://www.noxform.design; email studio@noxform.design; phone/WhatsApp +971 50 834 4351.  
**Source:** siteConfig  
**Evidence:** Public contact block.  
**Current status:** UNVERIFIED  
**Recommended decision:** VERIFY  
**Confidence:** High  
**Operator decision:** [ ]

## NF-06 — Services (design studio)
**Candidate:** Interior Architecture; Turnkey Fit-Out; Luxury Furnishing; Bespoke Joinery; Material Curation; Visualization & CGI; Lighting Design; Project Management.  
**Source:** siteConfig.services  
**Evidence:** Editorial service list on site.  
**Current status:** UNVERIFIED  
**Recommended decision:** VERIFY as **services offered**, noting Luxury Furnishing ≠ Villa Glory retail  
**Confidence:** High  
**Operator decision:** [ ]

## NF-07 — Project / client types
**Candidate:** Private villas, residences, hospitality; audiences include residential and hospitality clients.  
**Source:** siteConfig description  
**Evidence:** Project types named in description.  
**Current status:** UNVERIFIED  
**Recommended decision:** VERIFY  
**Confidence:** Medium–High  
**Operator decision:** [ ]

## NF-08 — Tone
**Candidate:** Refined, atmospheric, material-honest, professional studio (inferred from public copy).  
**Source:** site description language  
**Evidence:** Tone attributes derived — not a formal voice bible.  
**Current status:** UNVERIFIED  
**Recommended decision:** EDIT if you have approved voice words; else VERIFY cautiously or REJECT  
**Confidence:** Low–Medium  
**Operator decision:** [ ]

## NF-09 — Visual identity
**Candidate:** Default palette includes noir `#15110f`, bronze `#9a7b4f`; typography Archivo (primary) / Fraunces (editorial).  
**Source:** brand-kit defaults / fonts  
**Evidence:** Brand kit token defaults in product.  
**Current status:** UNVERIFIED  
**Recommended decision:** VERIFY as current default kit (or EDIT with brand-kit file)  
**Confidence:** Medium–High  
**Operator decision:** [ ]

## NF-10 — Primary CTA
**Candidate:** “Start a Project” (+ WhatsApp conversation path).  
**Source:** primaryCta in content.ts  
**Evidence:** Public CTA label.  
**Current status:** UNVERIFIED  
**Recommended decision:** VERIFY  
**Confidence:** High  
**Operator decision:** [ ]

## NF-11 — Confidentiality
**Candidate:** *(missing explicit confidentiality policy in Brand Brain)* Portfolio/project NDAs may apply — not extracted as verified rule.  
**Source:** —  
**Evidence:** None authoritative in Phase 2B ingestion.  
**Current status:** MISSING  
**Recommended decision:** EDIT with your rule, or leave MISSING  
**Confidence:** —  
**Operator decision:** [ ]

---

# 4. NOX TECH

## Brand / Positioning

### NT-01 — Brand name
**Candidate:** NOX TECH  
**Source:** README  
**Evidence:** Product README title.  
**Current status:** UNVERIFIED  
**Recommended decision:** VERIFY  
**Confidence:** High  
**Operator decision:** [ ]

### NT-02 — Product description (business truth)
**Candidate:** Internal software sales and implementation platform managing client lifecycle from discovery through proposal to implementation.  
**Source:** README  
**Evidence:** Documented product story.  
**Observed in code:** YES (platform exists)  
**Documented:** YES  
**Publicly claimed:** PARTIAL (internal/public marketing assets mixed)  
**Marketing approved:** NO  
**Recommended decision:** VERIFY as **internal product truth**; do **not** treat as ad copy approval  
**Confidence:** Medium  
**Operator decision:** [ ]

### NT-03 — Positioning statement
**Candidate:** AI-assisted sales/implementation spanning discovery, module marketplace, proposals, delivery tracking (per README).  
**Source:** README features  
**Observed in code:** YES  
**Documented:** YES  
**Publicly claimed:** UNCLEAR  
**Marketing approved:** NO  
**Recommended decision:** EDIT into approved external wording, or VERIFY for internal use only  
**Confidence:** Low–Medium  
**Operator decision:** [ ]

## Commercial Services

### NT-04 — What is commercially sold
**Candidate:** *(not established)* Seed modules ≠ commercial SKU list.  
**Source:** seed catalog / README marketplace mention  
**Observed in code:** YES (large seed catalog)  
**Documented:** YES (marketplace concept)  
**Publicly claimed:** UNCLEAR  
**Marketing approved:** NO  
**Recommended decision:** EDIT with the real sellable packages/services — or REJECT seed names as offers  
**Confidence:** Low  
**Operator decision:** [ ]

## Technical Capabilities

### NT-05 — Module marketplace samples
**Candidate samples observed:** CRM Core; Sales Pipeline; Lead Management; Solution Builder; Proposal Generator (plus many more in seed data).  
**Observed in code:** YES  
**Documented:** YES (README marketplace)  
**Publicly claimed:** NO (as commercial guarantee)  
**Marketing approved:** NO  
**Recommended decision:** Do **not** marketing-approve from code. VERIFY only as “technically present in product,” or REJECT as marketing offers.  
**Operator decision:** [ ]

## Marketing Claims

### NT-06 — ROI / performance copy ⚠️ HIGH RISK
**Candidate:** marketing-data.ts contains quantified ROI strings (e.g. “180–240% ROI within 18 months”).  
**Observed in code:** YES (static copy)  
**Documented:** NO (as proven results)  
**Publicly claimed:** YES (in code marketing assets)  
**Marketing approved:** NO  
**Recommended decision:** REJECT for marketing **or** EDIT with approved evidence-backed wording. Requires `marketing_approved = true` to enter approved claims.  
**Confidence:** Low for truth of ROI  
**Operator decision:** [ ]

### NT-07 — Claim guardrails
**Candidate:** Do not claim guaranteed ROI without approval; do not treat every seeded module as a sold product; OBSERVED_IN_CODE ≠ MARKETING_APPROVED.  
**Source:** Marketing OS policy + evidence posture  
**Recommended decision:** VERIFY as operating restrictions  
**Confidence:** High (policy)  
**Operator decision:** [ ]

## Target Customers

### NT-08 — Audience
**Candidate:** Businesses needing sales/implementation tooling (weak ICP from README).  
**Observed in code:** N/A  
**Documented:** Weak  
**Publicly claimed:** NO  
**Marketing approved:** NO  
**Recommended decision:** EDIT with real ICP  
**Confidence:** Low  
**Operator decision:** [ ]

## CTA

### NT-09 — Primary CTA
**Candidate:** *(orientation CTAs only — not repository-verified)*  
**Recommended decision:** EDIT with approved primary CTA  
**Operator decision:** [ ]

---

# 5. Cross-brand relationships

## XB-01 — Villa Glory ↔ NOX FORM
**Candidate:** RELATED_COMPANY in group context. Villa Glory = furniture / quote-first retail. NOX FORM = architecture / interiors / turnkey studio. Knowledge must **not** merge.  
**Source:** Marketing OS relationship registry (orientation + isolation rules)  
**Current status:** UNVERIFIED  

Approve **separately** (yes/no each):

| Permission | Approved? |
|------------|-----------|
| Internal knowledge awareness | [ ] |
| Public mention of relationship | [ ] |
| Content collaboration | [ ] |
| Asset sharing | [ ] |
| Lead referral | [ ] |

**Recommended decision:** VERIFY relationship existence only if true; set each permission explicitly (do not infer).  
**Operator decision:** [ ]

## XB-02 — Other cross-brand links
Any LOTIN ↔ others or NOX TECH ↔ others relationships to record?

Operator decision: [ ]

---

# Reminder

1. Fill Operator decision lines above.  
2. Mirror answers into `reports/onboarding/PHASE_2C_DECISIONS.json` (`decision`, `corrected_value`, `decided_by`, `decided_at`, `marketing_approved` when needed).  
3. Run `pnpm apply-brand-decisions` **only after** decisions are no longer PENDING.  
4. Do not start Phase 3 until Brand Brains are human-verified to your satisfaction.
