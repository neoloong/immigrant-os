# Content audit inventory — 2026-11-08

Audited source: `eb664836f0479fd8c1537876c6a56c8d5c06083a`. This run changes documentation only. No product wording or rules were changed, and no source URLs were added to the product.

## Scope and counting

Read `lib/`, `app/`, `db/`, `examples/`, and the tracked file inventory, including data/config files. All generated checklist content lives in `lib/rules.ts`; all successful assistant reply templates live in `app/api/assistant/route.ts`. There is no separate content dataset. `app/page.tsx` renders these results; `lib/calendar.ts` reuses each open dated item's title, description, and source URL without adding rules. The D1 example contains no immigration guidance.

**Requested inventory: 18 items — 11 sourced, 7 unsourced, 0 makes-a-determination, 0 P0.** This comprises 10 checklist definitions, 3 successful assistant reply templates, and 5 assistant limitation/error responses. Runtime dates, repeated display surfaces, and combinations of reply items are not counted as new definitions. The supplementary table inventories 12 adjacent prompts/labels separately: all 12 are unsourced, none is an eligibility/filing determination. Including those gives **30 rows: 11 sourced, 19 unsourced, 0 P0**.

- **sourced** means an official `.gov` URL is attached by the code, including sources inherited by the assistant. It is a provenance verdict, not a finding that the page supports every assertion, is current, or establishes an individual's legal position. Broad/mismatched references are flagged below; this inventory is not legal validation.
- **unsourced** means the response or prompt has no attached official URL. Administrative errors and disclaimers are included for completeness; their lack of a source is not itself a legal claim.
- **makes-a-determination** takes priority if the text decides eligibility or whether/when a person may file. An unsourced determination would be marked **P0** in its row. No such determination was found. Status-date wording and overbroad labels still warrant review.

All official URLs below are copied from code, using link references for readability. No replacement URLs have been inferred.

## Checklist definitions

Locations refer to the stable `id` inside `buildPlan` in `lib/rules.ts`. Returned IDs append `:<dueDate>` or `:review`.

| Item id / location | What it tells the user; trigger and date basis | Official source URL found in code | Verdict / flag |
| --- | --- | --- | --- |
| `f1-i94-end` — `lib/rules.ts` | For F1 with a saved I-94 date: authorized admission ends on that date; treat it as controlling and review extension needs with a DSO/counsel. Checks the date's presence, not whether admission basis is fixed-date. | [USCIS OPT][opt] | sourced — **review:** categorical authorized-admission wording and broad OPT citation; could surface a retained fixed date after switching to D/S. |
| `f1-program-end` — `lib/rules.ts` | For F1 with a program-end date: repeats the I-20 date; ask the DSO to confirm OPT windows/recommendation deadlines. Explicitly does not determine filing eligibility. | [USCIS OPT][opt] | sourced |
| `h1b-extension-planning` — `lib/rules.ts` | For H1B stage with an I-94 date: begin employer planning six calendar months earlier, clamped to the destination month's last day. Explicitly a planning cue, not a legal deadline. | [USCIS H-1B][h1b] | sourced — **review:** six months is an app planning convention, not a source-validated deadline; also applies to the H-4 subtype. |
| `h1b-i94-end` — `lib/rules.ts` | For H1B stage with an I-94 date: authorized stay ends on the saved date; visa stamp is an entry document, not a substitute for the latest I-94/approval records. | [USCIS H-1B][h1b] | sourced — **review:** categorical status-date title and H-4 coverage under an H-1B source. |
| `gc-visa-bulletin` — `lib/rules.ts` | Every GREEN_CARD profile: review the bulletin on the first day of next month. With a priority date, compare the correct category/country; without one, add priority date, category, and chargeability country. Does not infer missing facts. | [State Department Visa Bulletin][bulletin] | sourced — **review:** next-month date is an app convention; category/country are requested but have no dedicated profile fields. |
| `gc-case-receipts` — `lib/rules.ts` | Every GREEN_CARD profile: add receipts and keep I-140, I-485, I-765, I-131, and dependent cases separate. No due date; does not say all forms must be filed. | [USCIS Green Card Processes][green-card] | sourced — **review:** broad process page, not a citation for the app's organization convention. |
| `lpr-card-expiry` — `lib/rules.ts` | LPR or CITIZENSHIP with card-expiration date: repeats the card date; review the correct renewal/removal-of-conditions process; card expiration alone does not decide status. | [USCIS I-90][i90] | sourced — **review:** I-90 citation does not by itself cover the mentioned removal-of-conditions process. |
| `lpr-n400-review` — `lib/rules.ts` | LPR or CITIZENSHIP with resident-since date: review naturalization guidance, residence, travel, and spouse-based requirements; dates alone cannot establish eligibility or earliest filing. No due date. | [USCIS N-400][n400] | sourced |
| `ead-expiry` — `lib/rules.ts` | Any stage with EAD date: repeats printed expiration; extensions depend on category and circumstances and need separate verification. | [USCIS I-765][ead] | sourced |
| `universal-passport-expiry` — `lib/rules.ts` | Any stage with passport date: passport expires on entered date; plan renewal and recheck travel documents; effects vary by country/status. | F1: [USCIS OPT][opt]; all other stages: [USCIS H-1B][h1b] | sourced — **review:** these are broad immigration references, not passport-renewal guidance for every country/stage. |

## Assistant replies and response branches

| Item id / location | What it tells the user | Official source URL found in code | Verdict / flag |
| --- | --- | --- | --- |
| `answer:relevant` — `app/api/assistant/route.ts`, `relevant.length` | “Based on your saved … profile,” lists selected item titles and any dates, then directs the user to inputs, confidence, and the governing source. | Deduplicated `item.source.url`: [OPT][opt], [I-765][ead], [H-1B][h1b], [Visa Bulletin][bulletin], [Green Card Processes][green-card], [I-90][i90], [N-400][n400], depending on selected items. | sourced — **review:** omits item descriptions, including their planning/status caveats; “governing source” overstates broad references. |
| `answer:missing` — same file, `plan.missingFields.length` | Cannot calculate reliably yet; asks for missing fields and says the plan recalculates after saving. | NONE (`relevant` is empty, so `sources` is empty) | unsourced — administrative profile-completeness response, not a filing decision. |
| `answer:fallback` — same file, final answer branch | Profile is complete enough for supported checks; explains deterministic scope and directs strategy/legal judgment to a DSO, employer counsel, or attorney. | NONE | unsourced — **review:** completeness wording may appear after an unsupported question or an item-matching miss. |
| `limitations` — same file, every successful response | General administrative information only; not legal advice or a “complete eligibility determination.” | NONE for this statement (other response sources depend on `relevant`) | unsourced — **review:** “complete” could imply a partial determination; the product red line prohibits any eligibility determination. This disclaimer itself makes none. |
| `error:empty-question` — same file, empty input | Ask a question first; HTTP 400. | NONE | unsourced — input validation. |
| `error:no-profile` — same file, no saved profile | Complete a profile before asking a personalized question; HTTP 400. | NONE | unsourced — setup requirement. |
| `error:unauthorized` — `lib/auth.ts::unauthorized`, called by assistant route | Sign in to access the immigration workspace; HTTP 401. | NONE | unsourced — authentication requirement. |
| `error:failure` — assistant route catch and `app/page.tsx::AssistantView` catch | Displays the thrown error message or “Unable to answer.” The shared UI API helper may produce `Request failed (<status>)`. | NONE | unsourced — operational error; arbitrary exception text is not a rule-based immigration answer. |

The assistant's keyword routing is also part of the inventory. These are selection paths into the three reply templates above, not additional reply definitions:

| Selection location — `app/api/assistant/route.ts` | Actual behavior / audit note |
| --- | --- |
| Default | First three incomplete plan items, already sorted by date. |
| OPT / STEM / EAD | Selects IDs containing `opt` or `ead`. Only `ead-expiry` currently matches; neither F1 item contains `opt`, so the I-20 review is missed. |
| I-94 / status / expire / expiration | Selects IDs containing `i94`, `passport`, `expiry`, or `end`; includes program-end dates. |
| Citizen / N-400 / naturalization | Selects IDs containing `n400`. |
| Green card / I-90 / renew | Selects IDs containing `i90` or `gc-`. `lpr-card-expiry` contains neither and is missed. |
| Missing / document / upload | Forces an empty selection; returns the missing-fields or fallback reply. |

Branches are evaluated in the listed order; a mixed question uses the first match. Keyword branches replace the default selection and do not exclude completed items or cap their count. No branch performs a live USCIS lookup or a legal eligibility calculation.

## Adjacent prompts and labels (12 additional rows)

These are not separate generated checklist items, but they are user-facing rule-related content and are recorded to avoid concealing unsourced wording.

| Item id / location | What it tells the user | Official source URL found in code | Verdict / flag |
| --- | --- | --- | --- |
| `missingFields:F1-program` — `lib/rules.ts` | Add program end date from Form I-20 when missing. | NONE attached to prompt | unsourced — input request. |
| `missingFields:F1-admission` — `lib/rules.ts` | Add I-94 admission basis, D/S or fixed date, when missing. | NONE attached to prompt | unsourced — input request. |
| `missingFields:F1-fixed-date` — `lib/rules.ts` | Add I-94 admit-until date when fixed-date admission is selected. | NONE attached to prompt | unsourced — input request. |
| `missingFields:H1B-date` — `lib/rules.ts` | Add most recent I-94 admit-until date when missing. | NONE attached to prompt | unsourced — input request. |
| `missingFields:GC-priority` — `lib/rules.ts` | Add priority date when missing. | NONE attached to prompt | unsourced — input request. |
| `missingFields:resident-since` — `lib/rules.ts` | LPR/CITIZENSHIP: add resident-since date when missing. | NONE attached to prompt | unsourced — input request. |
| `missingFields:LPR-card` — `lib/rules.ts` | LPR: add Green Card expiration when missing. | NONE attached to prompt | unsourced — input request. |
| `summary:missing` — `lib/rules.ts` | A count of items is needed to complete the timeline. | NONE attached to summary | unsourced — UI completeness summary. |
| `summary:open` — `lib/rules.ts` | A count of open actions is calculated from the saved profile. | NONE attached to summary | unsourced — UI count. |
| `empty-plan` — `app/page.tsx::PlanView` | “You're caught up”; no open actions in supported rules. | NONE | unsourced — limited to supported rules, not legal compliance. |
| `five_year` — `app/page.tsx::ProfileFields` | Naturalization basis label: “General 5-year rule.” | NONE attached to selector (N-400 appears on the separate review item only) | unsourced — **review:** shorthand omits conditions; selection does not control an eligibility/date calculation. |
| `three_year` — `app/page.tsx::ProfileFields` | Naturalization basis label: “3-year spouse rule.” | NONE attached to selector | unsourced — **review:** shorthand omits conditions; selection does not control an eligibility/date calculation. |

Other surfaces inspected: stage labels, document-type choices, receipt-format validation, official receipt-status link, assistant starter questions, onboarding/disclaimers, page metadata, and calendar export. They contain no additional generated checklist or assistant rules. Receipt linking uses `https://egov.uscis.gov/casestatus/mycasestatus.do?appReceiptNum=` plus the escaped receipt; it opens USCIS and does not fetch a status.

## Follow-up flags (inventory only)

Before describing the content as fully verified, review the broad source mappings, status-end titles, unsourced naturalization labels, and the assistant's lost caveats/completeness wording. Fixing keyword routing and the requested-but-unavailable category/country fields is separate product work. **No unsourced eligibility/filing determination requiring P0 was found in this revision.** This does not resolve the deployment/authentication blockers recorded in the hosting guide.

[opt]: https://www.uscis.gov/working-in-the-united-states/students-and-exchange-visitors/optional-practical-training-opt-for-f-1-students
[ead]: https://www.uscis.gov/i-765
[h1b]: https://www.uscis.gov/working-in-the-united-states/h-1b-specialty-occupations
[bulletin]: https://travel.state.gov/content/travel/en/legal/visa-law0/visa-bulletin.html
[green-card]: https://www.uscis.gov/green-card/green-card-processes-and-procedures
[i90]: https://www.uscis.gov/i-90
[n400]: https://www.uscis.gov/n-400
