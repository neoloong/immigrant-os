# Project state

## Active assignments

None. Lightweight pilot implementation and independent Claude Pro/OpenCode Go read-only reviews completed. Sites remains owner-private.

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

- External hosting requires verified sessions instead of trusting incoming identity headers.
- D1 migrations, R2 provisioning, backup/restore and user-isolation tests are needed for independent hosting.
- Assistant replies are rule-based; OCR, real AI, scheduled notifications and live case-status integrations are not connected.
- Real external-viewer login remains to be tested before opening the audience. Sites identity headers remain trusted only behind its managed dispatch.
