# Project state

## Active assignments

None. Capacitor scaffold work is recorded below; dependency installation, native generation and device validation remain blocked.

## Capacitor mobile scaffold (2026-11-09)

- **Partial delivery:** `app-capacitor` starts at `independent-hosting` tip `6a7a629` in the isolated local clone `work/app-capacitor`. Creating the branch in the original checkout failed with `.git/index.lock: Operation not permitted`; that checkout remains unchanged on `independent-hosting`. Codex was the sole writer; no other agents/providers were invoked; assignment cleared.
- Added HTTPS server-URL configuration for `https://immigrant-os.neoloong.workers.dev`, app name `Immigrant OS`, placeholder app ID `com.neoloong.immigrantos`, cleartext disabled, and a minimal packaging stub (no static app bundle). Added sync/open scripts, a one-time official tooling installation command, existing-favicon asset generation wiring, signing/build ignore rules, and `docs/mobile-app.md`.
- Registry lookup failed with `ENOTFOUND registry.npmjs.org`; offline Capacitor install and both platform-add attempts failed with `ENOTCACHED`. Capacitor is not installed, no new dependencies or lockfile entries were fabricated, and neither native project nor generated native assets exist yet. `app:assets` prepares the favicon source but cannot start the missing official generator. Remaining package install, generation, sync and explicit-path commit commands are in the runbook.
- Full Xcode, Android Studio, default Android SDK and Java runtime are absent. Only Apple Command Line Tools are selected; `xcodebuild -version` fails. Native compilation, signing, TestFlight/Play uploads and real-device auth/session checks are outstanding. Owner's active Apple team is Chao Wang / WV28UW2GZS; future Play registration is an owner step.
- Node 22.22.0: `npm ci --offline --no-audit --no-fund` passed using a copy of the existing project cache. `npm test` completed its web build/artifact checks, then reported 15 passes and three Miniflare initialization failures (`listen EPERM: operation not permitted 127.0.0.1`). `npx --no-install tsc --noEmit`, script syntax check and `git diff --check` passed. Full tests must be rerun where local listeners are permitted, and all checks repeated after installing Capacitor.
- Confirmed `lib/`, `app/`, `worker/`, production `wrangler.jsonc`, and `package-lock.json` are identical to base. No push, merge, Wrangler cloud command, deploy, audience change, sign-in, purchase or store submission.

## Access bridge rejection diagnostics (2026-11-09)

- Implemented on the existing `independent-hosting` checkout at `3e4f16a`. Codex was the sole writer for `lib/access-jwt.ts`, `lib/access-auth.ts`, `tests/access-auth.test.mjs`, and this state file; assignment cleared after implementation and validation.
- Missing assertion headers now fall back to the exact `CF_Authorization` cookie. Present headers, including invalid/empty headers, remain authoritative. Cookie parsing handles surrounding whitespace, quoted values, and unrelated cookie values containing equals signs. Existing RS256, key selection, issuer, audience, expiry, not-before, and email checks remain enforced.
- The detailed verifier returns a fixed reason code; the existing verifier retains its email-or-null interface. Temporary rejection logging emits only the code, and only `/auth/access` rejection responses expose `detail`. Both diagnostic locations are marked `TEMP-DEBUG: remove before public launch`.
- `npm ci --offline --no-audit --no-fund`, `npm run build` (including artifact validation), and `npx tsc --noEmit` passed. `npm test` exited 1 with 15 passing results, including all 12 Access validation subtests, and three Miniflare suite initialization failures (`listen EPERM: operation not permitted 127.0.0.1`). Access storage/session, session auth, and workspace suites remain for the operator in a listener-capable environment; none were weakened or skipped.
- Best-supported production hypothesis: a wrapper drops `Cf-Access-Jwt-Assertion` while `CF_Authorization` survives. The old verifier ignored cookies and immediately rejected missing assertions. This remains unconfirmed until production exercises the fallback or reports a reason code; JWKS, key, signature, and claim failures are now distinguishable.
- Commit blocked: explicit-path `git add` failed to create `.git/index.lock` with `Operation not permitted`. Git metadata is read-only in this session and approval escalation is unavailable. The four-file change remains uncommitted on `independent-hosting` at `3e4f16a`; no alternate checkout or branch was created.
- No push, merge, Wrangler cloud commands, deployment, audience change, or provider/billing change.


## Independent Cloudflare hosting implementation (2026-11-09)

- Branch `independent-hosting` starts at main `35c8e70834754d41c386db50c37f9166eac3f7e2`. The original checkout's Git metadata is read-only in the sandbox (`git switch` failed with `index.lock: Operation not permitted`), so the branch/commit are in `/Users/chao/Projects/immigrant-os/work/independent-hosting`. Original main and tracked files are unchanged. Codex was the sole writer; no agents or paid providers were invoked. Assignment cleared after implementation/review.
- Root `wrangler.jsonc` uses Worker `immigrant-os`, account `8fba78f3e5f52d302a5482370c61c15c`, D1 `immigrant-os-db` / `b9fe7d41-8f74-49cd-9e5b-dacf60ca9f7a`, and R2 `immigrant-os-files`. Vite reads it with `configPath`; Sites/vinext packaging and Vite environment settings remain. Initial routes are empty; workers.dev and preview URLs are disabled.
- Access JWT verification uses RS256, team JWKS, issuer/audience/expiry/not-before checks, and verified normalized email. `GET /auth/access` reuses existing D1/HMAC sessions. Protected requests require the Access email and session owner to agree; identity switches revoke the old session. Root visits bootstrap sign-in; login/error links and POST logout are wired. Missing Access configuration disables the bridge with 503; plain email headers never substitute for a JWT.
- `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` are runtime non-secret settings to be supplied by the operator. `SESSION_SECRET` remains a Worker secret. `.dev.vars*` is now ignored; no dependencies, migration SQL, or lockfile changes.
- Node 22.22.0: offline `npm ci` from the existing local cache passed; `npm run build` and generated-config inspection passed; `npx tsc --noEmit` passed; lint passed with the pre-existing `_error` warning in `app/api/profile/route.ts`.
- Final `npm test` exited 1: 12 passing results, including all nine Access validation/bootstrap checks, plus three Miniflare suite initialization failures (`listen EPERM: operation not permitted 127.0.0.1`). D1-backed bridge/session creation, owner isolation, and workspace nested checks remain for the operator outside the sandbox. No tests were weakened or skipped.
- No Wrangler command (including dry run), push, merge, deployment, resource provisioning, or audience change. Existing resource identifiers were supplied by the operator and were not remotely inspected.
- **Merge/cutover constraint:** this branch's build selects session auth and independent Cloudflare bindings, so publishing it as the current Sites app can break dispatch sign-in/storage. Keep Sites on main until the operator chooses merge/deployment timing. Remaining Access configuration, remote migrations, secret/deploy commands, two-account smoke tests, and backup/restore checks are in `docs/cloudflare-hosting.md`.


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

- The independent-hosting branch now implements Access-to-session login/logout; full Miniflare validation and real Access login/isolation smoke tests remain outside this sandbox.
- Independent D1/R2 resources are operator-provisioned; remote migration verification, private-bucket verification, backup/restore and real user-isolation tests remain.
- Assistant replies are rule-based; OCR, real AI, scheduled notifications and live case-status integrations are not connected.
- Real external-viewer login remains to be tested before opening the audience. Sites identity headers remain trusted only behind its managed dispatch.

## Auth hardening (2026-09-21)

- `lib/auth.ts` now supports two identity modes via `AUTH_MODE`: `dispatch` (default, preserves Sites behavior) and `session` (independent hosting).
- In `session` mode the `oai-authenticated-user-email` header is ignored entirely, so spoofed headers are rejected; identity comes from an HMAC-SHA256 signed `immigrant_session` cookie backed by a new `sessions` table (owner, expiry).
- `SESSION_SECRET` (>= 32 chars) is required for session mode; `worker/index.ts` injects `AUTH_MODE`/`SESSION_SECRET` from Worker env.
- Added `tests/auth.test.mjs` covering spoof rejection, anonymous rejection, tampered signature, owner scoping, and expiry. `npm test` now runs 14 tests; `npx tsc --noEmit` and `npm run lint` clean (one pre-existing unused-param warning in `app/api/profile/route.ts`).
- No deploy: Sites continues in the default `dispatch` mode.
