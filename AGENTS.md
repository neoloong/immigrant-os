# Immigrant OS agent coordination

Read `docs/project_state.md` before work. Codex coordinates delivery and validates results.

- OpenCode uses the configured OpenCode Go provider for bounded implementation and build tasks.
- Claude Code uses the existing claude.ai subscription login for independent reviews and architecture tasks.
- Do not silently switch to API billing, OpenCode Zen, or a different paid provider when usage is exhausted. Return the limit/reset information to the coordinator.
- Assign one writer per file. For concurrent implementation use separate worktrees; reviewers stay read-only. Record active assignments in `docs/project_state.md` and clear them at completion.
- Use explicit paths when staging. Never overwrite another tool's changes, force-push, or rewrite published history.
- Verify with `npm ci`, `npm test`; use `npx tsc --noEmit` for TypeScript changes. These commands support macOS and Linux. `npm run install:ci` is a legacy Linux-only helper.
- Keep credentials, agent transcripts, runtime databases, uploads, and `.env` files out of Git.
- The current runtime is ChatGPT Sites, with D1/R2 and dispatch-provided identity. A GitHub push does not deploy the Site. Preserve the existing Site audience.
- Do not deploy this app directly to another host until trusted-header authentication is replaced and storage/migrations are configured. See `docs/operations.md`.
- The original chat mentioned commit `3a0e0f4`; it was not present in the recovered repository. Do not claim it has been restored.

The user prefers autonomous completion with minimal interaction. Carry out authorized routine work and report concrete results. Account login, purchases, and changes in public access need the user's own authorization when it has not already been given.
