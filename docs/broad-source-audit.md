# Broad-source remapping audit — 2026-11-21

## Scope and evidence

Audited `/Users/chao/Projects/immigrant-os` on `broad-source-audit`, already checked out at `acc92514453df8d3c2e1272578aa29cdd59cb740`, exactly the `polish-1` tip. The initial working tree was clean. No branch recreation was necessary. Only this document and one registration line in `docs/project_state.md` are deliverables. All fixes below are proposals; no product code, copy, tests, configuration, or source mappings were changed.

Verification date: **2026-11-21 UTC**; the local clock returned `2026-11-21T03:40:22Z` (2026-11-20 in America/Los_Angeles). This is a citation-to-wording audit, not legal advice, a legal conclusion, or an eligibility/filing determination. Quoted product text is evidence of the implementation, not endorsed immigration guidance.

Locations and line numbers refer to the audited commit. `lib/rules.ts:83–85` appends `:<dueDate>` or `:review` to the action IDs below. `app/page.tsx:447` renders each action's title, description, date, basis, source label, and reference-version text. `lib/calendar.ts:25` reuses title, description, and source URL. Assistant selection and its separate reply text are covered in item 6.

Verdicts describe the mapping: **OK** = appropriate for the stated scope; **TOO-BROAD** = a general reference is used for a more specific assertion or app convention; **TOO-NARROW** = the reference does not cover the full audience/process named; **MISSING** = required routing or supporting information is absent. **UNVERIFIED** is a separate evidence status, not a claim that the official page is false or missing. Findings concerning inaccessible pages are provisional; failure to retrieve a page is not proof that it lacks a passage.

| Brief item | Current verdict | Still present? |
| --- | --- | --- |
| 1. H-1B planning and I-94 actions | TOO-BROAD; live USCIS content UNVERIFIED | Yes, both actions; H-4 also receives them |
| 2. Visa Bulletin reminder and absent category/country inputs | TOO-BROAD for the scheduling attribution; MISSING inputs | Yes; the source topic itself is appropriate |
| 3. `gc-case-receipts` | TOO-BROAD; current source content UNVERIFIED | Yes |
| 4. `lpr-card-expiry` | TOO-NARROW | Yes; only I-90 is attached |
| 5. Passport action | TOO-NARROW for the current universal mapping | Action remains; the old OPT/H-1B citation no longer exists here |
| 6. Assistant keyword routing | MISSING in both branches | Both reported gaps remain |

## Live source ledger

Each URL below was requested on **2026-11-21 UTC**. Local `curl -L -sS --max-time 15` attempts failed DNS resolution, exit 6, for every listed URL; `curl` printed `000`, which is **not an HTTP response status**. Independent web-tool opens returned the outcomes below. Successful text extraction does not expose a numeric HTTP status, so none is guessed as 200. Thus the requested numeric-status verification remains **UNVERIFIED** for readable pages, while their retrieved content can still be inspected. The 403 entries are the actual HTTP errors reported by the web tool, not by local curl. No cached search snippet or historical 200 was substituted for a successful live fetch.

| Key / exact URL | Role in this audit | HTTP status reported by web tool | Live result on 2026-11-21 |
| --- | --- | --- | --- |
| [H1B](https://www.uscis.gov/working-in-the-united-states/h-1b-specialty-occupations) | Current `SOURCES.h1b` | 403 Forbidden | UNVERIFIED content |
| [VB](https://travel.state.gov/content/travel/en/legal/visa-law0/visa-bulletin.html) | Current `SOURCES.visaBulletin` | Not exposed — UNVERIFIED status | Content retrieved; current/upcoming headings and monthly archive inspected |
| [GC](https://www.uscis.gov/green-card/green-card-processes-and-procedures) | Current `SOURCES.greenCard` | 403 Forbidden | UNVERIFIED content |
| [I90](https://www.uscis.gov/i-90) | Current `SOURCES.i90` | 403 Forbidden | UNVERIFIED content |
| [VISITOR](https://travel.state.gov/content/travel/en/us-visas/tourism-visit/visitor.html) | Current `SOURCES.passport` | Not exposed — UNVERIFIED status | Content retrieved; Overview and Gather Required Documentation inspected |
| [OPT](https://www.uscis.gov/working-in-the-united-states/students-and-exchange-visitors/optional-practical-training-opt-for-f-1-students) | Current `SOURCES.opt`, inherited by F1 actions | 403 Forbidden | UNVERIFIED content |
| [EAD](https://www.uscis.gov/i-765) | Current `SOURCES.ead`, inherited by EAD action | 403 Forbidden | UNVERIFIED content |
| [VISA-DATE](https://travel.state.gov/content/travel/en/us-visas/visa-information-resources/visa-expiration-date.html) | Proposed I-94 context reference | Not exposed — UNVERIFIED status | Content retrieved; visa-expiration and duration-of-stay sections inspected |
| [I751](https://www.uscis.gov/i-751) | Proposed separate form reference | 403 Forbidden | UNVERIFIED content |
| [I829](https://www.uscis.gov/i-829) | Proposed additional form reference | 403 Forbidden | UNVERIFIED content |
| [USCIS-STATUS](https://www.uscis.gov/tools/checking-your-case-status-online) | Candidate receipt reference, not selected because unreadable | 403 Forbidden | UNVERIFIED content |
| [USA-STATUS](https://www.usa.gov/immigration-case-status) | Proposed receipt reference | Not exposed — UNVERIFIED status | Content retrieved; receipt-based case lookup section inspected |
| [USA-CARD](https://www.usa.gov/renew-green-card) | Supporting official overview for form-reference split | Not exposed — UNVERIFIED status | Content retrieved; separate I-90, I-751, I-829 links inspected |

All rule-related supporting references in this document are official `.gov` URLs. No non-government result is used as supporting evidence. The ledger supplies the URL, date, transport outcome, and limitation for each item's current and proposed citations.

## 1. H-1B-related actions

**Current locations:** `lib/rules.ts:119–143`, IDs `h1b-extension-planning` and `h1b-i94-end`; source definition `SOURCES.h1b`, lines 41–45. Both are generated for lifecycle `H1B` with a saved I-94 date, without checking `statusSubtype`. The UI explicitly offers `H1B` and `H4` (`app/page.tsx:55–58`); this is implementation evidence, not a statement about either group's legal requirements.

**Exact displayed text:**

- `h1b-extension-planning` title: “Begin employer extension planning”
- Description: “This six-month planning reminder is not a legal filing deadline. Confirm timing with the petitioning employer or counsel.”
- Basis: `I-94 ends: ${formatDate(profile.i94ExpirationDate)}` and “Planning reminder set six months earlier”. Date is `addMonths(profile.i94ExpirationDate, -6)`; the helper at lines 269–275 clamps to the last day of the destination month.
- `h1b-i94-end` title: “I-94 authorized stay ends”
- Description: “The visa stamp is an entry document; it is not a substitute for checking the authorized stay shown on the latest I-94 and approval records.”
- Basis: `I-94 admit-until date: ${formatDate(profile.i94ExpirationDate)}`; date is the entered I-94 date.

**Current citation:** both show “USCIS: H-1B Specialty Occupations” at <https://www.uscis.gov/working-in-the-united-states/h-1b-specialty-occupations>, followed by “Official reference · check current instructions”. Live verification: ledger H1B, **403 / UNVERIFIED**, 2026-11-21.

**Verdict: TOO-BROAD, provisional for inaccessible source content.** The six-month offset is demonstrably an app calculation and is already called a planning reminder. The source has not been verified as support for that offset; do not relabel it a filing window. The source also does not verify the user's saved date. A more targeted readable reference distinguishes visa expiration from the I-94/admission record; it does not certify an individual's status or establish this app's six-month convention. [Department of State: What the Visa Expiration Date Means](https://travel.state.gov/content/travel/en/us-visas/visa-information-resources/visa-expiration-date.html).

**Proposed fix, exact copy and mapping:** keep the existing six-month date calculation solely as an explicit app preference; change the planning title to “Review your saved I-94 date” and description to “Immigrant OS sets this planning reminder six months before the I-94 date you entered. This is an app preference, not a USCIS filing window or deadline. Discuss next steps with qualified counsel; involve your employer for employment-related questions.” Change its basis strings to `Saved I-94 date: ${formatDate(profile.i94ExpirationDate)}` and “App planning preference: six months before the saved date”. This avoids applying an employer-specific instruction to every H-4 profile.

For `h1b-i94-end`, use title “Saved I-94 admit-until date” and description “This is the I-94 date you entered. Review your latest I-94 and any USCIS notices with qualified counsel. This tracker does not determine your authorized stay.” Keep the saved date and existing basis. For both actions, use URL `https://travel.state.gov/content/travel/en/us-visas/visa-information-resources/visa-expiration-date.html`, label “Department of State: Visa expiration and admission records”, and `ruleVersion` “Background reference; reminder timing is an app preference”. The replacement supports the reference's subject, not a six-month legal rule. Live content inspected; HTTP status remains UNVERIFIED as logged.

## 2. Visa Bulletin / green-card reminder

**Current locations:** `lib/rules.ts:161–174`, ID `gc-visa-bulletin`; `SOURCES.visaBulletin` at lines 46–50; `firstDayNextMonth()` at lines 278–281. `lib/profile.ts:4–23,32–45` has `priorityDate` but no preference-category or chargeability-country field; `app/page.tsx:58,740` offers a workflow step (`PERM`, `I140`, `I485`, `CONSULAR`) and priority date, not those missing inputs.

**Exact displayed text:** title “Review the current Visa Bulletin”. With a saved priority date:

```text
Your saved priority date is ${formatDate(profile.priorityDate)}. Compare it with the correct employment or family category and country column; this product does not infer those missing facts. The Department of State publishes a new Visa Bulletin each month, so this reminder returns on the 1st of every month.
```

Without one:

```text
Add your priority date, preference category, and chargeability country before any personalized availability check. The Department of State publishes a new Visa Bulletin each month, so this reminder returns on the 1st of every month.
```

Basis is `Priority date: ${formatDate(profile.priorityDate)}` or “Priority date missing”. Due date is always `firstDayNextMonth()` when the plan is generated.

**Current citation:** “Department of State: Visa Bulletin”, <https://travel.state.gov/content/travel/en/legal/visa-law0/visa-bulletin.html>, version “Current monthly bulletin required”. Live result: ledger VB, content retrieved on 2026-11-21, **numeric HTTP status UNVERIFIED**. The fetched page listed November 2026 as current and the upcoming bulletin as “Coming Soon”; its monthly archive supports the topic, not an app's recurrence or a guaranteed next-month publication date. [Official Visa Bulletin index](https://travel.state.gov/content/travel/en/legal/visa-law0/visa-bulletin.html).

**Verdict: TOO-BROAD for the full scheduling attribution; MISSING category/country inputs.** The bulletin reference is **OK as a general review link**. The implementation performs no availability comparison and does not fetch a next-month bulletin. More precisely than the historical flag: the next-month behavior is a reminder-date convention. Regeneration during a new month immediately points to the following month; there is no retained reminder for the first day of the current month in this function. No source can establish that app behavior.

**Proposed fix:** retain the current source URL and title, set this action's `dueDate` to `null`, and use these replacement descriptions verbatim:

```ts
profile.priorityDate
  ? `Your saved priority date is ${formatDate(profile.priorityDate)}. Open the official Visa Bulletin for a general review. This tracker does not collect preference category or chargeability country and does not check visa availability or filing eligibility.`
  : "Open the official Visa Bulletin for a general review. You can save a priority date in your profile, but this tracker does not collect preference category or chargeability country and does not check visa availability or filing eligibility."
```

Keep the existing priority-date basis. This resolves the wording with the current data model; it does not require pretending new fields exist. The future coding task should account for the changed completion key (`gc-visa-bulletin:review`) and removal from dated calendar exports. Adding category/country fields or personalized calculations is separate work, not this proposed copy correction.

## 3. `gc-case-receipts`

**Current location:** `lib/rules.ts:175–184`, ID `gc-case-receipts`, source definition lines 51–55. Generated for every `GREEN_CARD` profile, without a date.

**Exact displayed text:** title “Add every USCIS receipt to your case tracker”; description “Keep the I-140, I-485, I-765, I-131, and dependent cases separate so a change in one does not hide another.” Basis: “Green-card journey selected”.

**Current citation:** “USCIS: Green Card Processes and Procedures”, <https://www.uscis.gov/green-card/green-card-processes-and-procedures>, version “Official reference · check current instructions”. Live verification: ledger GC, **403 / UNVERIFIED**, 2026-11-21.

**Verdict: TOO-BROAD, provisional for inaccessible source content.** The current copy describes an app organization convention and lists several forms; it does not say they must all be filed. No live evidence from the attached page was obtained to support that convention. The readable official alternative specifically describes checking an existing USCIS case with its receipt number. [USAGov: Check immigration case status](https://www.usa.gov/immigration-case-status).

**Proposed fix:** title “Track the USCIS receipts you already have”; description “Add each receipt you want to track as a separate case in this app. This is an organization suggestion, not a list of forms to file. Use the official case-status guidance to check a receipt with USCIS.” Keep the ID, null date, and basis. Replace the source with URL `https://www.usa.gov/immigration-case-status`, label “USAGov: Check immigration case status”, version “Official case-status guidance”. The organization suggestion is explicitly the app's; the citation supports receipt lookup. Ledger USA-STATUS records readable content and UNVERIFIED numeric status. The more direct USCIS candidate was also tried and returned 403 (USCIS-STATUS); do not silently call it verified.

## 4. `lpr-card-expiry`: separate form references

**Current location:** `lib/rules.ts:187–197`, ID `lpr-card-expiry`; source definition lines 56–60. Generated for `LPR` or `CITIZENSHIP` with a saved card-expiration date. No card-type or conditional-residence field is present in `lib/profile.ts:4–23`.

**Exact displayed text:** title “Green Card expiration date”; description “Date printed on your card. Review the correct renewal or removal-of-conditions process; card expiration alone does not determine your immigration status.” Basis: `Your card date: ${formatDate(profile.greenCardExpirationDate)}`; due date is the saved card date.

**Current citation:** “USCIS: Form I-90”, <https://www.uscis.gov/i-90>, version “Official reference · check current instructions”. Live verification: ledger I90, **403 / UNVERIFIED**, 2026-11-21.

**Verdict: TOO-NARROW.** The copy names both renewal and removal of conditions but exposes only an I-90 reference. The readable official overview provides distinct I-90, I-751, and I-829 references; an I-90-only mapping cannot stand in for all of those subjects. This is a source-coverage finding, not a form selection for a user. [USAGov: Renew or replace a Green Card](https://www.usa.gov/renew-green-card). Do not claim that I-751 covers every removal-of-conditions situation or infer which form applies from an expiration date.

**Proposed fix:** retain ID, saved date, and basis; title “Saved Green Card expiration date”; description “This is the card-expiration date you entered. Review the separate official form references with qualified counsel to identify the relevant process. This tracker does not select a form, calculate a filing window, or determine immigration status.”

Render separate references with these exact labels and URLs, rather than attaching I-90 alone to the combined wording:

| Proposed label | Exact URL | Live verification, 2026-11-21 |
| --- | --- | --- |
| USCIS: Form I-90 | `https://www.uscis.gov/i-90` | 403; UNVERIFIED content |
| USCIS: Form I-751 | `https://www.uscis.gov/i-751` | 403; UNVERIFIED content |
| USCIS: Form I-829 | `https://www.uscis.gov/i-829` | 403; UNVERIFIED content |

Use version “Official form reference; review current instructions” for each. The URLs are also linked by the inspected [official overview](https://www.usa.gov/renew-green-card); that corroborates the reference split without claiming the blocked form pages were read. The later coding task must support multiple references in `PlanItem` (currently only `source: Source`, `lib/rules.ts:17`) and preserve them in the action UI, assistant source collection, and calendar text. Show all references without automatically selecting a procedure; recheck the blocked pages before treating their content as verified. No such model change is made here.

## 5. Passport actions

**Current location:** `lib/rules.ts:218–228`, ID `universal-passport-expiry`; `SOURCES.passport` at lines 71–75. It applies to every lifecycle stage with `passportExpirationDate`.

**Exact displayed text:** title “Passport expires”; description “Renewal timing and the effect on travel or admission can vary by country and status. Plan early and re-check travel documents before every trip.” Basis: `Passport expiration: ${formatDate(profile.passportExpirationDate)}`; due date is the entered passport-expiration date.

**Current citation:** “Department of State: Visitor Visa & Passport Validity”, <https://travel.state.gov/content/travel/en/us-visas/tourism-visit/visitor.html>, version “Official reference · check current instructions”. Live verification: ledger VISITOR, readable content on 2026-11-21; **numeric HTTP status UNVERIFIED**.

**Historical mapping no longer exists:** the old F1-to-OPT / other-stages-to-H-1B selection described in `docs/content-audit.md` is absent. Line 227 now unconditionally uses `SOURCES.passport`. The action itself remains. Other passport mentions in the visitor extension checklist are not this historical universal action.

**Verdict: TOO-NARROW for the current universal wording.** The inspected page is visitor-visa guidance and contains a passport-document section; it is not an issuing-country passport-renewal guide for every stage or trip. [Department of State: Visitor Visa](https://travel.state.gov/content/travel/en/us-visas/tourism-visit/visitor.html). The prior broad immigration citation was replaced, but this does not finish the mapping audit.

**Proposed wording-only fix:** retain ID, entered date, basis, and current URL. Use title “Saved passport expiration date”; description “This is the passport-expiration date you entered. Review renewal information from your passport's issuing authority and check your travel documents before a trip. This tracker does not check renewal or admission requirements. The linked Department of State page is background information for U.S. visitor visas only.” Set the source label to “Department of State: U.S. visitor visas (background only)” and version to “Not passport-renewal guidance”. This preserves a clearly scoped reference without presenting it as support for universal renewal rules. Do not replace it with a U.S.-passport renewal page without establishing that the user holds a U.S. passport; the current profile has no passport-issuing-country field (`lib/profile.ts:4–23`).

## 6. Assistant keyword routing

**Current locations:** `app/api/assistant/route.ts:34–56`; OPT branch at line 37, green-card branch at lines 42–43, shared reply templates at lines 46–50, source deduplication at line 52. These routing branches have no action IDs of their own; they select the existing action IDs below.

**Exact current branch expressions:**

```ts
if (/opt|stem|ead/.test(normalized)) relevant = plan.items.filter((item) => /opt|ead/.test(item.id));
// Other branches occur between these two:
} else if (/green card|i-?90|renew/.test(normalized)) {
  relevant = plan.items.filter((item) => /i90|gc-/.test(item.id));
}
```

**Exact product reply templates** (interpolations retained so the text can be matched against source):

```ts
`Based on your saved ${plan.stageLabel} profile, ${relevant.map((item) => `${item.title}${item.dueDate ? ` is ${item.dueDate}` : ""}`).join("; ")}. Open each action to review its description and caveats, inputs, confidence level, and official source.`
`I cannot calculate that reliably yet. Add: ${plan.missingFields.join(", ")}. I will recalculate the plan after you save the profile.`
`Your ${plan.stageLabel} profile has the fields needed for the supported checks. This assistant only answers from the deterministic plan today; questions requiring strategy or legal judgment should go to a DSO, employer counsel, or immigration attorney.`
```

Every successful response also displays “General administrative information only; not legal advice and not an eligibility determination.” The first template repeats titles and dates, not action descriptions. Empty selections carry no sources; nonempty selections inherit and deduplicate the selected actions' `source` objects.

### 6a. OPT/STEM/EAD — MISSING F1 matches

`f1-program-end` (`lib/rules.ts:109–115`) and `f1-i94-end` (lines 96–106) contain neither `opt` nor `ead`. Only `ead-expiry` (lines 209–215) matches the current selector when present. The source on each F1 action is “USCIS: Optional Practical Training for F-1 Students”, <https://www.uscis.gov/working-in-the-united-states/students-and-exchange-visitors/optional-practical-training-opt-for-f-1-students>; the EAD action cites “USCIS: Employment Authorization”, <https://www.uscis.gov/i-765>. Both use version “Official reference · check current instructions”. Live results on 2026-11-21: ledger OPT and EAD, **403 / UNVERIFIED**. These are currently inherited citations, not independent sources for the routing logic.

Exact action text that can be omitted by the routing bug:

- `f1-program-end`: title “I-20 program end date”; description “Date you entered from your I-20. Ask your DSO to confirm any OPT application window and recommendation deadline; this tracker does not determine filing eligibility.” Basis: `Your I-20 date: ${formatDate(profile.programEndDate)}`.
- `f1-i94-end`: title “I-94 authorized admission period ends”; description “Treat this as a controlling date. Review any need for an extension of stay with your DSO or qualified counsel well before it arrives.” Basis: `I-94 admit-until date: ${formatDate(profile.i94ExpirationDate)}`. It is generated only for `FIXED_DATE` admission with a date, not D/S.
- The currently matching `ead-expiry`: title “EAD expiration date”; description “Date printed on your EAD. Any extension of work authorization depends on your category and circumstances; verify it separately.” Basis: `Your EAD date: ${formatDate(profile.eadEndDate)}`.

**Evidence the gap still exists:** a read-only in-memory execution of the current `buildPlan`, followed by the exact route predicate, with F1, fixed-date admission, program end `2027-06-01`, and I-94 date `2027-07-01`, produced both F1 action IDs and **zero OPT matches**. No EAD date was supplied. An OPT question would therefore take a fallback despite those saved dates.

**Proposed replacement for line 37:**

```ts
if (/opt|stem|ead/.test(normalized)) relevant = plan.items.filter((item) => /^(?:f1-program-end|f1-i94-end|ead-expiry):/.test(item.id));
```

This explicitly includes the two existing F1 reminders and EAD reminder as profile context, without adding legal calculations. Routing correction alone does not validate their citations. In particular, the F1 I-94 action's OPT citation remains a separate scope concern: use the same “Saved I-94 admit-until date” title, non-determinative description, and VISA-DATE URL proposed in item 1 if that action is remapped in a later task. Preserve its existing fixed-date gate.

### 6b. Green card / I-90 / renew — MISSING card-expiry match

`lpr-card-expiry` (`lib/rules.ts:193–196`) contains neither `i90` nor `gc-`; its exact text and I-90 citation are in item 4, including **403 / UNVERIFIED** live verification. `gc-visa-bulletin` and `gc-case-receipts` match, with the exact text and sources recorded in items 2 and 3. The route attaches no source for a card action it fails to select.

**Evidence the gap still exists:** a read-only `buildPlan` execution for LPR with resident-since `2020-01-01` and card expiry `2030-01-01` returned `lpr-card-expiry:2030-01-01` and `lpr-n400-review:review`; applying `/i90|gc-/` returned **zero matches**. The unchanged route therefore falls back for the question “green card renewal”.

**Proposed replacement for the filter at line 43:**

```ts
relevant = plan.items.filter((item) => /^(?:gc-visa-bulletin|gc-case-receipts|lpr-card-expiry):/.test(item.id));
```

Keep the existing question trigger and branch order for this bounded fix. Mixed questions still follow the earlier matching branch; for example, “green card expiration” hits the expiration branch, which already matches `lpr-card-expiry`. The defect is therefore a specific routing gap, not a claim that every card question fails. No official source is needed to substantiate these regex/code observations. Future implementation should add focused routing regression cases; this audit changes no tests.

## Validation and delivery limits

- `npm ci --offline --no-audit --no-fund --cache /Users/chao/Projects/immigrant-os/.sites-runtime/npm-cache`: exit 0, 712 packages installed from the existing cache; no dependency/lockfile change.
- `npm test`: exit 1. Build and artifact validation completed; runner reported **57 tests, 54 pass, 3 fail, 0 skipped**. The failing Access-session, session-auth, and workspace suites could not start local listeners (`listen EPERM: operation not permitted 127.0.0.1`), preventing their nested checks. This does **not** satisfy the brief's **74 passing tests** acceptance. No test was altered or bypassed. Log: `/private/tmp/broad-source-npm-test.log`.
- `npx tsc --noEmit`: exit 0. Log: `/private/tmp/broad-source-tsc.log`.
- Read-only in-memory rule inspection reproduced both routing gaps, the H4 planning action (`2027-08-31` minus six months becomes `2027-02-28`), and the current next-month bulletin date (`2026-12-01` during this run). It was not a replacement test suite and created no repository file.
- Remaining acceptance work: rerun all 74 tests where local listeners are permitted; obtain actual HTTP status codes for the readable sources and recheck the blocked USCIS pages. UNVERIFIED outcomes are deliberately retained rather than guessed.
- Final scope check: the only tracked difference from `polish-1` is the registration in `docs/project_state.md`; the only untracked deliverable is `docs/broad-source-audit.md`. `git diff --check` passed. Explicit-path staging failed with `.git/index.lock: Operation not permitted`, so there is no new commit; changes remain uncommitted on the requested branch.
- The requested summary write to `/Users/chao/broad-source.summary.md` failed with `PermissionError: Operation not permitted` because that path is outside the sandbox's writable roots. Approval escalation is unavailable. The prepared summary is preserved at `/private/tmp/broad-source.summary.md`; the coordinator must copy it to the requested location. No alternate repository or branch was created.
- No push, merge, deployment, Cloudflare/Access/audience change, external message, purchase, provider change, or deletion of user data was performed. Official-source reads were the brief-authorized live verification.
