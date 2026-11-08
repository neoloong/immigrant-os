# Project state

## Active assignments

None. Auth hardening (session-mode identity) implemented and verified; assignment cleared. Sites remains owner-private.

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
