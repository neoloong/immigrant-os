# Development and delivery

## Local development

Use Node 22.13 or later. Run `npm ci`, then `npm run dev` for local development.
Run `npm test` to build, validate the Sites artifact and test HTML rendering.
The portable build uses Node for a three-minute timeout and requires no Homebrew coreutils.
The old `npm run install:ci` helper is Linux-only; ordinary `npm ci` uses the same lockfile on Mac.

## Agent usage

Codex owns coordination and final verification. OpenCode is configured per-project to use only OpenCode Go, avoiding an implicit switch to metered Zen models. Claude Code uses its native claude.ai login (Pro was confirmed on this Mac).

For a bounded read-only review, the coordinator can run:

```sh
opencode run --agent plan 'Review the assigned files without editing; report findings.'
claude -p --tools Read,Glob,Grep --allowedTools Read,Glob,Grep --permission-mode dontAsk --strict-mcp-config 'Review the assigned files without editing; report findings.'
```

Assign exact files and an acceptance check for implementation. Use separate worktrees for simultaneous writers. Never auto-switch a subscription task to paid API credentials. Check login through `claude auth status` and `opencode providers list`; these do not establish remaining quota. A rate-limit response should pause that provider or route a suitable task to another already-authorized subscription. No reliable combined remaining-quota meter has been configured.

OpenCode reads AGENTS.md; Claude reads CLAUDE.md, which imports the same coordination rules. Restart existing OpenCode sessions after changing project configuration. Skill availability can be inspected with `opencode debug skill`; installed skills remain in their original user directories.

## GitHub

The origin remote is the user's existing `neoloong/immigrant-os` repository. Preserve both its initial commit and recovered Sites history when importing. Never force-push. Keep work reviewable on a branch/PR. Account credentials belong in the existing local credential store, not this repository.

The bootstrap PR imports the recovered history while retaining GitHub's original LICENSE commit. Main stays unchanged until the PR is approved and merged. Future changes should also use branches/PRs. GitHub Actions is enabled at repository level, but no CI workflow or auto-deploy is configured. The local GitHub credential reports `repo` scope without `workflow`; workflow-file setup remains a separate step.

## Hosting

The existing owner-private Site is https://immigrant-os.neoloong.chatgpt.site. For continued Sites releases, use the installed Sites publishing workflow with the existing `.openai/hosting.json` project ID: build and test, push the exact source revision to the Sites source repository using a short-lived credential, save and deploy that revision, then verify deployment status. A push to GitHub alone does not publish to Sites. Source backups do not include the hosted database or uploaded files.

Independent hosting should retain the Cloudflare Worker/D1/R2 architecture, but is not ready for a direct deploy: set `AUTH_MODE=session` and a `SESSION_SECRET` (>= 32 chars) so the Worker rejects the Sites-injected identity header and validates HMAC-signed `immigrant_session` cookies against the `sessions` table. A sign-in flow (IdP/OAuth) that issues sessions still needs to be wired up. The default `AUTH_MODE` is `dispatch`, which preserves the current owner-private Sites behavior (identity from `oai-authenticated-user-email` behind dispatch). A direct public Worker must also provision real D1/R2 resources, apply migrations, and verify user isolation and backups. Do not infer these protections from successful build tests.

Domain purchase and changing the audience are separate user decisions. No domain was purchased and no new paid infrastructure was provisioned by this setup.

### Independent hosting provisioning (runbook)

These commands assume a Cloudflare account login (`wrangler login`) and a `wrangler.jsonc` for the Worker — neither exists yet, so treat this as the sequence to run once credentials are available. Drizzle migrations under `drizzle/` are generated and kept in sync, but the app currently creates schema inline in `db/index.ts` (`ensureDatabase`) rather than running a migrator.

1. Login and create resources:

   ```sh
   wrangler login
   wrangler d1 create immigrant-os-db        # record the returned database_id
   wrangler r2 bucket create immigrant-os-files
   ```

2. Configure `wrangler.jsonc` with the `DB` D1 binding (id from step 1), the `BUCKET` R2 binding, and vars `AUTH_MODE = "session"` and `SESSION_SECRET` (>= 32 chars). Set the Workers compatibility flag `nodejs_compat`.

3. Apply schema (choose one):
   - Inline path (matches current runtime): the first request runs `ensureDatabase()` and creates all tables including `sessions`.
   - Drizzle path (recommended long-term): add `drizzle-orm/d1/migrator` to a startup hook and run `wrangler d1 migrations apply immigrant-os-db`.

4. Backup and restore:

   ```sh
   wrangler d1 export immigrant-os-db --output ./backups/d1-$(date +%F).sql
   wrangler d1 execute immigrant-os-db --file ./backups/d1-YYYY-MM-DD.sql
   # R2 is copied per object; script a list + copy, or use rclone with S3-compatible credentials.
   ```

5. Verify before opening the audience: run `npm test` (includes two-account D1/R2 isolation and session-mode auth), then a real external-viewer login trial through the wired IdP.

The sign-in flow that issues `immigrant_session` cookies is the one remaining code dependency for a direct deploy; it is not implemented because the identity provider has not been chosen.
