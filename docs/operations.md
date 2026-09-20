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

Independent hosting should retain the Cloudflare Worker/D1/R2 architecture, but is not ready for a direct deploy: `lib/auth.ts` trusts a Sites-injected identity header and grants a local preview identity by hostname. A direct public Worker must instead validate sessions and reject spoofed identity headers, provision real D1/R2 resources, apply migrations, and verify user isolation and backups. Do not infer these protections from successful build tests.

Domain purchase and changing the audience are separate user decisions. No domain was purchased and no new paid infrastructure was provisioned by this setup.
