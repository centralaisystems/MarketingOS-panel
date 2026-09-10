# Phase 2C Evidence Audit

**Audit date:** 2026-08-14 (evidence pass) · **Human approval:** 2026-08-14 (Ahmet Oney) · **Doc sync:** 2026-09-10  
**Scope:** MarketingOS plus the authorized read-only sibling folders for LOTIN, Villa Glory, NOX FORM, and NOX TECH; current official public websites where identifiable.  
**Application result (final Phase 2C):** 68 applied, 0 PENDING, 0 errors — see `PHASE_2C_APPLY_AUDIT.json` and `PHASE_2C_DECISIONS.json`.  
**Marketing approval:** Mixed per decision (59 `marketing_approved=true` for routine business truth; claim/restriction and REJECT paths remain non-ad surfaces). No publishing, ads, customer contact, production integration, or Phase 3 authorization was created.

## Evidence posture

- `VERIFIED` / `EDIT` means accepted as low-risk business or internal product truth for Brand Intelligence under the operator-delegated evidence audit.
- `PUBLICLY_CLAIMED` means visible on a current official website but not independently proven as legal, regulatory, performance, or marketing-approved truth.
- `OBSERVED_IN_CODE` means technically present; it is not automatically a sellable offer or approved marketing claim.
- `PENDING` remains UNVERIFIED and requires human confirmation.
- Current official sites checked: [LOTIN](https://lotin.ae/), [Villa Glory](https://villagloryfurniture.com/), [Villa Glory Stores](https://villagloryfurniture.com/pages/stores), and [NOX FORM](https://www.noxform.design/). No independently indexed NOX TECH marketing domain was found; its evidence is internal source/product documentation.

## LOTIN

Local source folder: `/Users/aismacstudio/Development/Lotin` (empty at audit time). The official domain is live but contains template residue, so only explicit low-risk facts were promoted.

| ID | Disposition | Evidence-backed answer / boundary |
|---|---|---|
| LQ-01 | EDIT, partial | Marketing name: **Lotin Real Estate**. The site states **Lotin Real Estate LLC**, but the legal entity still needs registry/operator confirmation. |
| LQ-02 | EDIT | UAE-based real estate brokerage/advisory offering residential sales, leasing, property management, sales representation, and portfolio advisory. Promotional superiority and return wording excluded. |
| LQ-03 | EDIT + four applied fields | Off-plan property brokerage; buying/selling brokerage; leasing and property management; sales representation and portfolio advisory. Must not claim fund management, guaranteed returns, undocumented exclusivity, or unverified developer authorization. |
| LQ-04 | EDIT | **UAE**. The site lists a Dubai office; campaign-level city/emirate use still requires live inventory or mandate evidence. |
| LQ-05 | PENDING | The site names local/international investors and several buyer/owner types, but the primary ICP and explicit exclusions are not operator-approved. |
| LQ-06 | PENDING | No developer/project names are approved. The generic website statement about working with leading developers is insufficient for named-partner claims. |
| LQ-07 | Evidence only | Public copy supports off-plan, residential brokerage, leasing, villas, apartments, branded residences, and property management. Commercial leasing is also claimed. Exact in-scope property categories need human confirmation because the site contains template/category residue. |
| LQ-08 | EDIT | `real_estate_brokerage_and_advisory`. |
| LQ-09 | PENDING | Contact and WhatsApp routes exist, but one approved primary CTA was not established. |
| LQ-10 | PENDING | English is live. Arabic/Turkish or other public-marketing languages need confirmation. |
| LQ-11 / LQ-11b | VERIFY | Conservative controls applied: no invented/guaranteed ROI, fabricated inventory/pricing/partnerships, or unsupported regulatory/financial claims; property facts require current evidence. |
| LQ-12 | PENDING | No evidence for the operator's top 1–2 channels or near-term outcome priority. |
| LQ-13 | PENDING | No approved qualification/rejection rules found. |
| LQ-14 | PENDING | The public site suggests premium, trust, and discretion, but no approved voice/visual kit was located. |
| LQ-15 | PENDING | No operator-approved internal competitor list found. |

## Villa Glory

Primary local evidence: `Villa-Glory-Commerce-Ops/imports/pages-content/about.html`, `docs/PRODUCT_CONTENT_MODEL.md`, `docs/COLLECTION_STRUCTURE.md`, and the current Shopify theme. The current official site supersedes older cached WordPress wording where they differ.

| ID | Disposition | Evidence-backed answer / boundary |
|---|---|---|
| VG-01 | VERIFY | Public brand name: **Villa Glory**. Legal entity remains outside this decision. |
| VG-02 | EDIT | **Villa Glory is a UAE luxury furniture and complete home living destination for villas, apartments, and private residences.** |
| VG-03 | VERIFY | UAE market with current private showrooms in **Dubai** and **Sharjah**; addresses and contact details are live on the Stores page. |
| VG-04 / VG-04b | EDIT / VERIFY | Luxury furniture and complete home living, with curated collections, custom/bespoke options, material guidance, and private consultation for residences. |
| VG-05 | EDIT | Current differentiators: Dubai/Sharjah private showrooms; curated plus custom/bespoke; Private Concierge/appointment-led consultation; quote-first product enquiry model. These are operating characteristics, not superiority claims. |
| VG-06a | VERIFY | Private clients / residence customers. |
| VG-06b | PENDING | “Developers” appears in local About copy but is not sufficiently confirmed as a current target on the current public homepage. |
| VG-06c | VERIFY | Design professionals, supported by the public Trade Program route and customer-facing source. |
| VG-07 | VERIFY/EDIT across eight fields | Category-level only: Living, Dining, Bedroom, Lighting, Décor, Outdoor, Office, Custom & Bespoke. Individual SKU availability remains unverified. |
| VG-08 | PENDING | Current homepage primary CTA is **Book a Private Consultation**; product-level documentation uses **Request Private Quote** and the site also uses **Private Concierge**. Human confirmation is needed for CTA hierarchy and the current pack item ID. |
| VG-09 | EDIT | Official marketing URL: **https://villagloryfurniture.com**. The `myshopify.com` hostname remains an internal commerce identifier. |

## NOX FORM

Primary local evidence: `src/lib/content.ts`, `src/lib/branding/brand-kit.ts`, `src/app/globals.css`, production QA reports, and the live official site. NOX FORM studio FF&E remains isolated from Villa Glory retail/catalog facts.

| ID | Disposition | Evidence-backed answer / boundary |
|---|---|---|
| NF-01 | VERIFY | **NOX FORM**. |
| NF-02 | PENDING | The site publicly states “A Division of Woodex Global LLC,” but legal/registry confirmation was not available. |
| NF-03 / NF-03b | VERIFY | Dubai-based architecture, interior design, and turnkey delivery studio for private villas, residences, and hospitality spaces; “Designing the Next Era of Spatial Living.” |
| NF-04 | VERIFY | Dubai, UAE; public studio address is Dubai Investment Park 2, 61 Street, Warehouse 8. |
| NF-05 | VERIFY | https://www.noxform.design; studio@noxform.design; +971 50 834 4351 for phone/WhatsApp. |
| NF-06 | VERIFY across eight fields | Interior Architecture; Turnkey Fit-Out; Luxury Furnishing (studio FF&E); Bespoke Joinery; Material Curation; Visualization & CGI; Lighting Design; Project Management. |
| NF-07 | VERIFY across two fields | Private villa/residence clients; selected hospitality-space clients. |
| NF-08 | PENDING | Refined/atmospheric/material-honest is an inference, not a formal approved voice guide. |
| NF-09 | VERIFY | Current defaults: noir `#15110f`, bronze `#9a7b4f`; Archivo primary, Fraunces editorial. This is current implementation truth, not a permanent brand-kit guarantee. |
| NF-10 | VERIFY | **Start a Project**, with WhatsApp as a current secondary conversation path. |
| NF-11 | PENDING | Public copy says project stories are shared selectively with privacy/permissions respected, but no authoritative confidentiality/NDA policy was found. |

## NOX TECH

Primary local evidence: `README.md`, implemented source flows, `src/lib/marketing-data.ts`, `src/lib/marketing-links.ts`, and module seed/static catalogs. No independently indexed official marketing domain was available for cross-check.

| ID | Disposition | Evidence-backed answer / boundary |
|---|---|---|
| NT-01 | PENDING / conflict | MarketingOS says **NOX TECH**; README, metadata, and product UI say **NOX TECH AI**. Human brand decision required. |
| NT-02 | VERIFY, internal only | Internal software sales and implementation platform managing the client lifecycle from discovery through proposal to implementation. Not external ad-copy approval. |
| NT-03 | VERIFY, internal only | AI-assisted sales/implementation spanning discovery, module marketplace, proposals, and delivery tracking. External positioning still needs approval. |
| NT-04 | REJECT as commercial offer | CRM Core is observed in code/catalog data, but no approved sellable SKU list establishes it as a commercial offer. |
| NT-05 | REJECT as commercial offer | Sales Pipeline is technically present, not established as a marketed/sold package. Other seeded modules remain capabilities, not offers. |
| NT-06 | REJECT from approved claims | Five quantified ROI strings were found with no substantiation. They were moved only to `claims_requiring_evidence`; none is marketing-approved. |
| NT-07 | VERIFY | Guardrails: code presence ≠ commercial availability ≠ marketing approval; no guaranteed/quantified ROI without evidence and explicit approval. |
| NT-08 | PENDING | The repository suggests GCC businesses and several industries, but no operator-approved ICP/exclusion list exists. |
| NT-09 | EDIT | Current implemented CTA: **Book Discovery**, routed to the configured Calendly discovery URL. Production integration health was not tested or changed. |

## Cross-brand relationships

| ID | Disposition | Evidence-backed answer / boundary |
|---|---|---|
| XB-01 | PENDING | Villa Glory and NOX FORM are represented as related in MarketingOS, but relationship truth and each permission (internal awareness, public mention, collaboration, asset sharing, referral) require explicit human approval. All remain false/unapproved in practice; no memory was merged. |
| XB-02 | PENDING | No LOTIN↔other or NOX TECH↔other relationship was established from authorized evidence. |

## Human confirmations still required

Phase 2C human approval closed the questionnaire items that were PENDING at evidence-audit time (see `PHASE_2C_DECISIONS.json`). Remaining **readiness-critical** gaps moved to Phase 2D (`PHASE_2D_DECISION_BOOK.md`). Non-critical pack depth (full visual kits, audience psychology, channel strategy, competitors) can continue after critical blockers clear.

Cross-brand: XB-01 REJECTED — brands remain separate; no sharing.

## Verification record

- Evidence-audit dry-run / apply (2026-08-14 morning): 54 applied, 11 PENDING.
- Human approval apply (2026-08-14): **68 applied**, 0 PENDING, 0 errors; audit in `PHASE_2C_APPLY_AUDIT.json`.
- `pnpm typecheck` / `pnpm test`: passed around Phase 2C land.
- Post-2C `pnpm onboard-all`: Guardians passed; brands still `BLOCKED` on critical fields → Phase 2D.
- Phase 3 was **not** started.
