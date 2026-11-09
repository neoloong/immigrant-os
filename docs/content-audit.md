# Content audit inventory — 2026-11-08

Historical inventory below: audited source `eb664836f0479fd8c1537876c6a56c8d5c06083a`. See **2026-11-09 closure** for current dispositions, code changes, and validation limits. The original run changed documentation only. No product wording or rules were changed, and no source URLs were added to the product.

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


## 2026-11-09 closure

Work based on main `0a6d2c2`, on `content-gate-close`. The historical tables above retain their original findings; this section supersedes their unsourced verdicts and the specifically corrected wording/gating flags.

**Current inventory: 30 rows — 13 sourced, 17 non-assertions, 0 remaining unsourced immigration assertions, 0 eligibility/filing determinations, 0 P0.** The 11 previously sourced rows retain their official code-attached URLs; the two naturalization labels now share a verified N-400 hint immediately under their selector. The other 17 rows are explicitly classified below. “Sourced” retains the original provenance meaning; it does not certify every broad reference or establish a user's legal position. Full acceptance was completed by Muse in a non-sandbox shell on 2026-11-09 (see validation addendum below); live verification of the existing Visa Bulletin URL remains blocked by HTTP 403.

### Disposition of all 19 previously unsourced rows

| Row ID | Final state | Change / one-line rationale |
| --- | --- | --- |
| `answer:missing` | Non-assertion | Unchanged input request for missing saved-profile fields and an administrative description of recalculation; no filing decision. |
| `answer:fallback` | Non-assertion | Reworded to “profile has the fields needed for the supported checks”; describes app inputs, retaining the referral to a DSO, employer counsel, or immigration attorney. |
| `limitations` | Non-assertion | Administrative scope notice now says “General administrative information only; not legal advice and not an eligibility determination.” |
| `error:empty-question` | Non-assertion | Unchanged input-validation message asking for a question. |
| `error:no-profile` | Non-assertion | Unchanged setup requirement asking the user to save a profile. |
| `error:unauthorized` | Non-assertion | Unchanged authentication requirement asking the user to sign in. |
| `error:failure` | Non-assertion | Unchanged operational error reporting a failed request, not an immigration rule. |
| `missingFields:F1-program` | Non-assertion | Unchanged input request naming the user's I-20 program-end field. |
| `missingFields:F1-admission` | Non-assertion | Unchanged input request naming the user's I-94 admission-basis field. |
| `missingFields:F1-fixed-date` | Non-assertion | Unchanged input request naming the user's I-94 date field when fixed-date admission is selected. |
| `missingFields:H1B-date` | Non-assertion | Unchanged input request naming the user's most recent I-94 date field. |
| `missingFields:GC-priority` | Non-assertion | Unchanged input request naming the user's priority-date field. |
| `missingFields:resident-since` | Non-assertion | Unchanged input request naming the user's resident-since field. |
| `missingFields:LPR-card` | Non-assertion | Unchanged input request naming the user's Green Card expiration field. |
| `summary:missing` | Non-assertion | Unchanged UI count of missing app timeline inputs derived from the saved profile. |
| `summary:open` | Non-assertion | Unchanged UI count of open supported-rule actions derived from the saved profile and completion records. |
| `empty-plan` | Non-assertion | Heading now says “No open actions in the supported rules.”; the unchanged sub-copy scopes the zero count to this profile's supported rules. |
| `five_year` | Sourced | Existing label now has an adjacent [USCIS Form N-400 requirements][n400] link, with conditions-apply and no-eligibility-determination wording. |
| `three_year` | Sourced | Existing label shares the same adjacent [USCIS Form N-400 requirements][n400] link and conditional scope notice. |

### Previously sourced rows corrected

- `answer:relevant`: replaced “governing source” with “official source”; the action-opening instruction explicitly directs users to descriptions and caveats as well as inputs and confidence. Item descriptions remain available in the plan; titles alone do not convey those caveats. Source inheritance is unchanged.
- `f1-i94-end`: now requires both `admissionBasis === "FIXED_DATE"` and a saved I-94 date. A retained date no longer surfaces this action after switching to `DS_TRANSITION` (D/S), or when admission basis is unset. Existing wording and official source remain unchanged; the broad OPT reference and categorical title still need review.
- The other nine previously sourced rows retain their existing sources and wording. No new deadline, calculation, eligibility decision, or filing-date determination was introduced.

### Live source evidence — 2026-11-09

Executed from this machine before attaching the hint:

```text
$ curl -sI https://www.uscis.gov/n-400
HTTP/2 200
content-type: text/html; charset=utf-8
content-language: en
date: Mon, 09 Nov 2026 19:46:30 GMT
exit 0
```

A repeat returned HTTP 200 at 19:47:05 GMT. A direct `curl -s https://www.uscis.gov/n-400` GET also returned the page: its introduction conditions use of the form on meeting eligibility requirements, and its “When to File” section identifies the five-year and married-to-a-U.S.-citizen three-year bases. This supports the existing shorthand labels plus the new conditional review hint; no filing calculation or timing language from that page was added to the product. The hint uses the exact N-400 URL already in `lib/rules.ts`, with an accessible `aria-describedby` connection to the selector.

Additional direct `curl -sI` checks at 19:47:15 GMT returned HTTP 200 for the existing OPT, H-1B, I-765, I-90, and Green Card Processes URLs. The existing State Department Visa Bulletin URL returned **HTTP 403**; successful live verification of that URL is not claimed. Initial subprocess-batched checks and a GET with extra flags encountered DNS resolution failures; direct curl invocations produced the evidence above. The web-reader service also returned 403 for N-400, so the successful local curl response and GET were used. No replacement source URLs were invented or attached.

### Validation and acceptance status

- Environment: Node `v22.22.0`, npm `11.14.1`.
- `npm ci --no-audit --no-fund`: exit 0, installed 504 packages; only existing dependency deprecation warnings. Lockfile unchanged.
- `npm test`: **exit 1**. Production build and Sites Worker/hosting-manifest validation passed. TAP reported `tests 4`, `pass 2`, `fail 2`: calendar and rendered HTML passed; `tests/auth.test.mjs:7` and `tests/workspace.test.mjs:6` failed before their nested tests with `listen EPERM: operation not permitted 127.0.0.1`. This is an observed sandbox listener restriction, not a passing 14-test run. All 14 tests must still pass in a listener-capable environment before full acceptance.
- `npx tsc --noEmit`: exit 0, no diagnostics.
- Inspected all existing test files: there is no dedicated rules suite; workspace coverage exercises H1B through Miniflare, while calendar uses TypeScript transpilation. Kept tracked changes within the five-file allowlist and used the permitted one-off Node check, following the calendar test's `typescript.transpileModule` / data-URL import approach against the actual `buildPlan` implementation.
- One-off `buildPlan` check: **exit 0; all 8 assertions passed**. Fixed-date plus saved date produces the F1 I-94 action with the same date; retained date with D/S produces none; retained date with unset basis produces none; fixed-date without a date produces none and requests the missing date; D/S does not request that fixed date; the F1 program-end action remains; H1B I-94 behavior remains unchanged. No persistent test file or dependency was added.
- `git diff --check`: passed. Changes are confined to `lib/rules.ts`, `app/api/assistant/route.ts`, `app/page.tsx`, this audit, and `docs/project_state.md`.
- Local commit attempted on `content-gate-close`, but explicit-path `git add` failed in the Codex sandbox session: `Unable to create '/Users/chao/Projects/immigrant-os/.git/index.lock': Operation not permitted`. That session exposes `.git` read-only and does not permit approval escalation. No commit was created there; the five-file patch remained in the working tree.
- **Muse acceptance (2026-11-09, non-sandbox shell on `content-gate-close`): `npm test` exit 0 — 14/14 pass, 0 fail (production build + Sites Worker/hosting-manifest validation passed); `npx tsc --noEmit` exit 0.** The Miniflare EPERM failure above was specific to the Codex sandbox session; the same suite passes in a normal shell.

### NOT done today — follow-up items

These are explicitly deferred by the task brief; changing them needs separate source/content or product work:

- H-1B six-month planning convention: source remapping/validation, including the existing H-4 coverage flag.
- Visa Bulletin next-month convention and missing category/country profile fields; also recheck the existing URL from an environment where the site permits access.
- `gc-case-receipts`: broad source mapping for the case-organization convention.
- `lpr-card-expiry`: I-90 versus removal-of-conditions (I-751) source split.
- `universal-passport-expiry`: broad immigration references versus country-specific passport guidance.
- Assistant keyword routing: OPT still misses the F1 items, and the green-card branch still misses `lpr-card-expiry`.
- Existing F1/H1B status-end wording and broad references beyond the requested F1 admission-basis gate; no legal judgment was attempted.

No push, merge to main, deployment, audience change, hosting configuration, schema change, dependency addition, or provider/billing change was performed.
