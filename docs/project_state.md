# Project state

## Active assignments

None. OpenCode Go and Claude Pro completed independent read-only reviews on 2026-09-20; Codex implemented and verified the local setup.

## Validation (2026-09-20)

- Locked dependency install succeeded on macOS with Node 22.22.0.
- `npm test`: portable build, artifact validation and the existing HTML-render test passed.
- `npx tsc --noEmit`: passed.
- OpenCode resolved the Go-only project configuration successfully; both CLI model calls completed.
- Local GitHub login works. Wrangler reports no independent Cloudflare login.
- CI and automatic deployment have not been configured. Sites remains the existing hosting path.

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
- Existing automated test covers server HTML rendering, not full product behavior.
