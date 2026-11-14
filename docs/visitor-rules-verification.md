# VISITOR (B1/B2) rules verification — 2026-11-14

Verifier: dispatcher (Muse), independent of the Antigravity author of commit `9fa5d11`.
Scope: `lib/rules.ts` VISITOR block (`visitor-i94-end`, `SOURCES.i539`,
`SOURCES.passport`, passport-source selection, EAD suppression) and the VISITOR
tests in `tests/workspace.test.mjs`. Branch `visitor-stage`, HEAD `9fa5d11`.

## Official sources fetched

- **S1 — USCIS, Extend Your Stay**: https://www.uscis.gov/visit-the-united-states/extend-your-stay
  — fetched 2026-11-14 via browser copy crawled 2026-10-13 (note: copy is 32 days
  old; wording quoted below is from that copy).
- **S2 — Department of State, Visitor Visa**:
  https://travel.state.gov/content/travel/en/us-visas/tourism-visit/visitor.html
  — fetched 2026-11-14 19:50 UTC, fresh copy.

## Claim verdicts

### C1 — "a visitor who needs to stay beyond the CBP admit-until date on Form I-94 files Form I-539 before the current authorized stay expires" — CONFIRMED
- S1: "A request for an extension of stay (EOS) is generally filed on ...
  Application to Extend/Change Nonimmigrant Status (Form I-539)".
- S1: "Check the date in the lower right-hand corner of your Form I-94,
  Arrival-Departure Record, to determine the date your authorized stay expires.
  We recommend that you apply to extend your stay at least 45 days before your
  authorized stay expires."
- S1 lists as a condition to apply: "Your nonimmigrant visa status remains valid".
- Note (optional improvement, not a blocker): the rule text does not surface the
  USCIS 45-day recommendation. The action's due date is the I-94 date itself,
  which is the correct hard boundary; adding the 45-day note to the description
  would be a later enhancement.

### C2 — "The visa expiration date is an entry-document date, not the authorized stay period" — CONFIRMED
- S2: "A visa allows a foreign citizen to travel to a U.S. port-of-entry
  (generally an airport) and request permission to enter the United States.
  A visa does not guarantee entry into the United States."
- S2, "Extending Your Stay": "See Extend Your Stay ... to learn about requesting
  to extend your stay beyond the date indicated on your admission stamp or paper
  Form I-94."
- The authorized stay is governed by the admission stamp / Form I-94, not by the
  visa — the rule's distinction is supported.

### C3 — Passport action source for VISITOR points at the State Dept visitor page — CONFIRMED
- S2: "Passport valid for travel to the United States – Your passport must be
  valid for at least six months beyond your period of stay in the United States
  (unless exempt by country-specific agreements)."
- The action itself only reminds the user of the printed passport expiry date; it
  does not assert the six-month rule, so the country-specific-agreement exemption
  does not make the reminder wrong. Citation is adequate as a general
  visitor-passport reference.

### C4 — EAD-expiry action suppressed for VISITOR — CONFIRMED
- S2: "An individual on a visitor visa (B1/B2) is not permitted to accept
  employment or work in the United States."
- A B1/B2 visitor has no work authorization in the normal case, so suppressing
  the EAD action is correct.

### C5 — No legal conclusion / eligibility determination in the VISITOR rules — CONFIRMED
- The `visitor-i94-end` action is labeled "Scheduling information only",
  confidence `needs-review`, severity `critical`, due date = the I-94 admit-until
  date. It states what USCIS guidance says and what form is used; it does not
  decide eligibility or advise that the user qualifies.

### C6 — Tests assert the rules, not just that the code runs — CONFIRMED
- `tests/workspace.test.mjs` VISITOR test asserts: stageLabel "Visitor (B1/B2)",
  exactly 2 plan items, `visitor-i94-end:2027-04-15` id and due date, description
  matches /I-539/, source URL is the USCIS extend-your-stay page, passport action
  id/due date and a uscis.gov-or-travel.state.gov source host, per-profile
  isolation, reopen of the I-94 action when the I-94 date changes, and per-profile
  case isolation.
- Dispatcher acceptance on this branch, 2026-11-14: `npm test` 47/47 pass,
  `npx tsc --noEmit` exit 0.

## Overall verdict
**Safe to deploy as-is.** No NEEDS FIX items. One optional enhancement (surface the
USCIS 45-day filing recommendation in the `visitor-i94-end` description) is noted
under C1 for a later pass.
