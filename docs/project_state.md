# Project state

## Active assignments

None. Content-gate closure finished and accepted 2026-11-09 (npm test 14/14, tsc clean); see docs/content-audit.md 2026-11-09 closure. Sites remains owner-private.

## Content-gate closure work (2026-11-09)

- Branch `content-gate-close` was already checked out at main `0a6d2c2` with a clean working tree. Codex was the sole writer for the five authorized files; assignment cleared after implementation and validation. No other agent/provider used.
- Updated assistant scope/caveat wording, scoped the empty-plan heading, attached the existing N-400 URL beneath the naturalization selector, and gated F1 I-94 actions on fixed-date admission.
- Current inventory: 30 rows — 13 sourced, 17 explicitly classified non-assertions, 0 remaining unsourced immigration assertions, 0 eligibility/filing determinations, 0 P0. Full 19-row dispositions and deferred source/routing work are in `docs/content-audit.md`.
- Local `curl -sI https://www.uscis.gov/n-400`: HTTP 200; direct GET reviewed for the conditional labels/hint. Other existing USCIS URLs returned 200; the existing Visa Bulletin URL returned 403 and remains a live-verification limitation.
- Node 22.22.0: `npm ci --no-audit --no-fund` passed; `npx tsc --noEmit` passed; eight one-off `buildPlan` assertions passed, including retained-date suppression for D/S. Build and artifact validation passed.
- `npm test` exited 1: calendar and rendered HTML passed; auth/workspace suites could not start Miniflare (`listen EPERM: operation not permitted 127.0.0.1`), preventing their nested tests. Required full 14-test acceptance remains outstanding in a listener-capable environment; this is not reported as a passing test run.
- Commit creation blocked: explicit-path `git add` failed to create `.git/index.lock` with `Operation not permitted`; `.git` is read-only in this session and approval escalation is unavailable. Five-file patch remains uncommitted on `content-gate-close` at `0a6d2c2`; no alternate checkout or branch was created.
- No push, merge, deployment, audience/hosting change, schema/dependency change, or provider/billing change.

## Launch-prep documentation (2026-11-08)

- Branch: `launch-prep-readme-audit`, based on main `eb664836f0479fd8c1537876c6a56c8d5c06083a`. The original checkout's Git metadata is read-only in the execution sandbox; the branch and commit are in an isolated local clone. Original main and tracked files remain untouched. No push, cloud account commands, provisioning, or deployment.
- Replaced the starter README with current product features, privacy/disclaimer, local scripts, and a hosting-guide link. Added `docs/content-audit.md` and `docs/cloudflare-hosting.md`; product code/content is unchanged.
- Audit: 18 checklist/assistant rows (11 sourced, 7 unsourced), plus 12 adjacent prompt/label rows (all unsourced). Overall: 30 rows, 11 sourced, 19 unsourced, 0 eligibility/filing determinations, 0 P0. Sourced means a code-attached official URL, not validation that every assertion is supported; broad citations and wording/routing gaps are flagged.
- Node 22.22.0: `npm ci --offline --no-audit --no-fund` passed using a copied local npm cache after the initial registry attempt encountered restricted DNS and was interrupted. Lockfile unchanged.
- `npm run build`: passed, including Sites artifact validation. `npx tsc --noEmit`: passed.
- `npm test`: failed in this sandbox, with 2 top-level tests passing and 2 failing before their nested checks could run. `tests/auth.test.mjs:7` and `tests/workspace.test.mjs:6` cannot start Miniflare: `listen EPERM: operation not permitted 127.0.0.1`. Calendar and rendered HTML pass. Reproduced the same failure with `npm test` in an untouched archive of base `eb66483`; this is an environment restriction, not a documentation regression. A full passing test run remains required in an environment permitting local listeners.
- Independent hosting still needs Access JWT-to-session login/logout integration, real Wrangler/Vite configuration, D1/R2 provisioning/migrations, backup/restore validation, and real two-account smoke tests. The new guide corrects the older operations subsection's secret/migration instructions without changing runtime behavior.

## Validation (2026-09-20)

- Locked dependency install succeeded on macOS with Node 22.22.0.
- `npm test`: portable build, artifact validation and 8 tests passed (including real local D1/R2 profile, completion, cases, file isolation, and calendar formatting).
- `npx tsc --noEmit`: passed.
- OpenCode resolved the Go-only project configuration successfully; both CLI model calls completed.
- Local GitHub login works. Wrangler reports no independent Cloudflare login.
- A Codex heartbeat checks GitHub main every 30 minutes and privately publishes tested changes. It requires the Mac and Codex to be available. GitHub cloud CI is not configured.
- Browser pilot: local test profile creation/edit, date persistence after reload, completion persistence, calendar export action and 390px mobile layout checked. Test data is local only.

## Lightweight pilot

- Start with optional dates and a nickname; fill missing information later.
- Save and reopen a checklist; changed dates get new completion keys. Old completion records reopen once after this upgrade.
- Track receipts, update their labels by re-adding the same receipt, and open official USCIS status pages.
- Optional PDF/image storage and owner-scoped downloads/deletes remain available.
- Export open dated actions as an all-day .ics snapshot; imports do not sync future edits or promise notifications.
- Removed unverified 2026 F-1 transition assertions and precise OPT/N-400 filing-date calculations. Show entered dates and review tasks without blanket Verified labels.
- No new runtime dependencies or database schema changes. Access remains owner-private. Simulated two-account API tests do not replace a real external-viewer login trial before invitations.

## Source provenance

- Recovered Sites commit: `adbb4d3`, with two earlier commits.
- GitHub: https://github.com/neoloong/immigrant-os (existing public repository).
- Original chat's newer `3a0e0f4` remains unavailable; recovery is incomplete for that newer work.
- Local checkout: `/Users/chao/Projects/immigrant-os`.

## Hosting

- Existing Site: https://immigrant-os.neoloong.chatgpt.site
- Owner-only access was reported by Sites. It has not been changed.
- GitHub and Sites publication are separate. No independent cloud migration has been completed.

## Known gaps

- External hosting requires a sign-in provider that issues signed sessions; the session mechanism and spoofed-header rejection are in place, but no independent IdP/login flow is wired up yet.
- D1 migrations, R2 provisioning, backup/restore and user-isolation tests are needed for independent hosting.
- Assistant replies are rule-based; OCR, real AI, scheduled notifications and live case-status integrations are not connected.
- Real external-viewer login remains to be tested before opening the audience. Sites identity headers remain trusted only behind its managed dispatch.

## Auth hardening (2026-09-21)

- `lib/auth.ts` now supports two identity modes via `AUTH_MODE`: `dispatch` (default, preserves Sites behavior) and `session` (independent hosting).
- In `session` mode the `oai-authenticated-user-email` header is ignored entirely, so spoofed headers are rejected; identity comes from an HMAC-SHA256 signed `immigrant_session` cookie backed by a new `sessions` table (owner, expiry).
- `SESSION_SECRET` (>= 32 chars) is required for session mode; `worker/index.ts` injects `AUTH_MODE`/`SESSION_SECRET` from Worker env.
- Added `tests/auth.test.mjs` covering spoof rejection, anonymous rejection, tampered signature, owner scoping, and expiry. `npm test` now runs 14 tests; `npx tsc --noEmit` and `npm run lint` clean (one pre-existing unused-param warning in `app/api/profile/route.ts`).
- No deploy: Sites continues in the default `dispatch` mode.
