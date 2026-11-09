# Independent Cloudflare hosting preparation

Prepared 2026-11-08 against `eb664836f0479fd8c1537876c6a56c8d5c06083a`. **This is an ordered future provisioning runbook, not a deployment performed by this documentation change.** No account login, cloud provisioning, secret upload, or deployment was run. The current owner-private ChatGPT Site and its audience remain unchanged.

## What exists and what is missing

| Repository evidence | Consequence for independent hosting |
| --- | --- |
| `package.json`: vinext 0.0.50, Cloudflare Vite plugin 1.37.1, Wrangler 4.92.0; `build` runs `node scripts/build.mjs` | Use the lockfile and repo build. There is no `deploy` npm script. |
| `vite.config.ts`: inline `localBindingConfig`; `.openai/hosting.json`: `DB` and `BUCKET` | Bindings currently use the fake D1 ID `00000000-0000-4000-8000-000000000000`, `site-creator-d1`, and `site-creator-r2`. These are local/Sites settings, not provisioned resources in the owner's account. |
| No tracked `wrangler.jsonc`, `wrangler.json`, or `wrangler.toml` | A production Wrangler configuration must be created and Vite must actually read it. Adding a file alone leaves the inline overrides in place. |
| `worker/index.ts` | Worker entry; injects D1/R2 and auth config. The image route references `ASSETS` and `IMAGES`, which also need configuration if retained. API responses receive `private, no-store`. |
| `lib/auth.ts` | Default dispatch mode trusts the Sites email header. Session mode ignores it and verifies a signed cookie against D1. `issueSession` and `revokeSession` exist, but no login/logout routes call them. |
| `app/page.tsx::ErrorScreen`, `app/chatgpt-auth.ts` | Sign-in links/helpers target Sites-owned paths. They are not a working Cloudflare Access login integration. |
| `drizzle.config.ts`, `drizzle/0000_new_maria_hill.sql`, `drizzle/0001_round_ted_forrester.sql` | SQL migrations exist. The first creates profiles/documents/cases/completions; the second creates sessions. No remote migration script is configured. |
| `db/index.ts::ensureDatabase` | Creates tables/indexes inline on first use; does not record Wrangler migration history. Migrate a fresh database before any app traffic. |
| `build/sites-vite-plugin.ts`, `scripts/validate-artifact.mjs` | Build copies Sites metadata/migrations and requires `dist/server/index.js` with `default.fetch`. Keep this packaging for the existing validation workflow. |

This guide supersedes the **independent-hosting provisioning subsection** of [operations.md](operations.md): store the session secret with Wrangler secrets, apply committed SQL with an explicit remote target, and do not confuse inline schema creation with migrations. A runtime Drizzle migrator is not required for the Wrangler SQL migration path below.

## Ordered provisioning checklist

### 1. Prepare the owner's account and deployment machine

- Use Node.js 22.13.0 or later and `npm ci`; run commands below from the repository root with its pinned Wrangler (`npx wrangler`). Do not upgrade dependencies as part of provisioning.
- The owner needs an existing Cloudflare account with Workers, D1, and R2 enabled and permission to create resources, manage Worker secrets/deployments, and administer Zero Trust Access. R2 activation or account plan changes may require billing authorization by the owner.
- Configure a Zero Trust organization/team domain. This runbook uses a dedicated hostname in an existing Cloudflare-managed DNS zone; the owner must control that zone. No domain purchase is implied.
- The operator must already have an owner-authorized Wrangler login, or supply a scoped API token through the deployment environment. Token permissions must cover Workers deployment/secrets, D1, R2, and the chosen zone's routing as needed. Access setup below can be performed in the dashboard by an authorized administrator. Do not put credentials in commands, source, screenshots, or Git.
- Decide whether the new pilot starts empty or imports existing Sites data. No Sites D1/R2 export or account-owner remapping tool exists here. Back up and separately plan any transfer; do not assume a source checkout includes hosted data. Retain the current Site and audience during validation.

### 2. Set up the Access email-PIN gate before attaching a Worker hostname

In the Cloudflare dashboard's **Zero Trust → Integrations → Identity providers**, add **One-time PIN**. Under **Access → Applications**, add a **Self-hosted** application for the exact planned hostname and all paths, including `/api/*` and the eventual session bootstrap route. Select One-time PIN as the allowed login method. Create an **Allow** policy listing only the owner's approved email addresses; begin with the owner and add pilot testers only when authorized. Do not use an Everyone allow rule or a Bypass rule. Record the application's audience tag and the team issuer domain for the server integration. Choose and record a session duration. See Cloudflare's [OTP setup](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/) and [self-hosted application setup](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/).

### 3. Implement the missing authentication integration — deployment blocker

**Stop before deploying the app until this separate implementation is reviewed and tested.** Access's `CF_Authorization` cookie is not the app's `immigrant_session` cookie. Merely turning on Access and choosing session mode leaves the current APIs returning 401.

Required code work:

- Validate `Cf-Access-Jwt-Assertion` on the server using the team's signing keys. Verify signature, permitted algorithm, issuer, application audience, expiry, and any not-before constraint; reject missing/invalid claims. Derive the normalized account email from verified claims, never a user-supplied email header. Cloudflare documents [JWT validation](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/).
- Connect verified identity to `issueSession` and set the app cookie with `Secure`, `HttpOnly`, `SameSite=Lax`, a host-only scope, `Path=/`, and the returned expiry. Enforce that the verified Access identity and session owner agree; prevent switching identities from retaining a previous account's session.
- Require valid Access identity for every protected request, even if an app cookie survives longer. Add a real logout path that calls `revokeSession`, clears the app cookie, and ends the Access session. Replace the Sites-only login/error links for this independent deployment.
- Wire the proposed Access configuration names below into Worker env/types and the validation code. They are not read by today's app. Cover identity switching, expiry/revocation, invalid audience/issuer/signature, and forged headers in tests.

Retain the existing session authentication mode for independent hosting. Do not copy an unverified Access email header into `oai-authenticated-user-email`, expose dispatch mode directly, or set any client-visible secret. The existing `VITE_SESSION_SECRET` fallback is unsuitable for production; use the Worker runtime secret.

### 4. Provision D1 and private R2

Only after the owner has authorized account access, run:

```sh
npx wrangler d1 create immigrant-os-db
npx wrangler r2 bucket create immigrant-os-files
```

Record the returned D1 database ID for the configuration. Keep the R2 bucket private: no public custom domain or `r2.dev` access. The app uses the native R2 binding, so no R2 S3 credentials or browser upload tokens are needed. These command forms are supported by the repository's Wrangler and documented in the [D1 CLI](https://developers.cloudflare.com/d1/wrangler-commands/) and [R2 CLI](https://developers.cloudflare.com/r2/reference/wrangler-commands/).

### 5. Create production configuration and connect Vite to it

Create a root `wrangler.jsonc` on the future hosting implementation branch. This is a template for the missing file, not a file added by this run:

```jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "immigrant-os",
  "main": "./worker/index.ts",
  "compatibility_date": "2026-05-15",
  "compatibility_flags": ["nodejs_compat"],
  "workers_dev": false,
  "preview_urls": false,
  "routes": [],
  "assets": { "binding": "ASSETS" },
  "images": { "binding": "IMAGES" },
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "immigrant-os-db",
      "database_id": "<D1_ID_RETURNED_BY_CREATE>",
      "migrations_dir": "drizzle"
    }
  ],
  "r2_buckets": [
    { "binding": "BUCKET", "bucket_name": "immigrant-os-files" }
  ]
}
```

Replace the D1 placeholder; select the owner's account through the authorized Wrangler environment. The compatibility date above matches the current toolchain's generated artifact. Keep initial routes empty and both default/preview URLs disabled until the gate and secret are ready. The Vite plugin generates the static-asset directory in the deployment output; do not point production at the TypeScript entry without first building.

In `vite.config.ts`, replace `config: localBindingConfig` with `configPath: "./wrangler.jsonc"` for the independent-hosting configuration, removing the obsolete local-binding declarations/imports as appropriate. Preserve `vinext()`, `sites()`, and `viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] }`. The plugin applies inline `config` overrides after reading a file, which is why the placeholder override must be removed. See its [configuration API](https://developers.cloudflare.com/workers/vite-plugin/reference/api/). Keep the current Sites configuration on the existing deployment until cutover.

Add a `vars` object containing the runtime non-secret names listed below with operator-supplied settings. `AUTH_MODE` must select the existing **session** mode, not the dispatch default. The Access settings must match the implementation from step 3. Values are deliberately not listed here.

The image binding supports the retained `/_vinext/image` handler. Configure the corresponding Cloudflare Images capability if retaining this route; otherwise disable/remove the unused optimizer in the hosting implementation and omit that binding. The present UI uses inline SVG and does not require optimized uploaded-file previews. Do not silently leave a reachable handler that calls an absent binding. See [Images bindings](https://developers.cloudflare.com/images/transform-images/bindings/).

### 6. Apply committed Drizzle SQL to the fresh remote database

With the root configuration populated, before the Worker serves requests:

```sh
npx wrangler d1 migrations list immigrant-os-db --remote --config wrangler.jsonc
npx wrangler d1 migrations apply immigrant-os-db --remote --config wrangler.jsonc
npx wrangler d1 migrations list immigrant-os-db --remote --config wrangler.jsonc
npx wrangler d1 execute immigrant-os-db --remote --config wrangler.jsonc --command "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name;"
```

Verify both SQL files were applied and `profiles`, `documents`, `tracked_cases`, `completed_actions`, and `sessions` exist. Wrangler maintains its migration ledger; `drizzle/meta/` is not a set of executable SQL files. Setting `migrations_dir` to `drizzle` is sufficient for these two top-level SQL files. See [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/).

`npm run db:generate` only generates SQL from `db/schema.ts`; it does not migrate remote D1. Do not regenerate or rewrite the two committed migrations during provisioning. They use ordinary `CREATE TABLE`, so a database previously initialized by `ensureDatabase()` may conflict: stop and reconcile schema/history after backup instead of blindly applying or dropping tables. No runtime migrator needs to be added for this CLI-managed path.

### 7. Build, test, and inspect the production artifact locally

```sh
npm ci
npm run build
npm test
npx tsc --noEmit
npx wrangler deploy --dry-run --config dist/server/wrangler.json
```

`npm test` builds again, so inspect the final generated `dist/server/wrangler.json`. For this pinned setup the Worker is `dist/server/index.js` and assets are in `dist/client`; the Cloudflare plugin emits the adjacent Wrangler JSON. Verify real D1/R2 resources, auth vars, asset/image bindings, the compatibility settings, and disabled public/preview routes. Reject any artifact still containing the fake database ID or `site-creator-*` resource names. Never hand-edit generated config; correct the source configuration and rebuild. `dist/.openai` is Sites metadata, not the owner's Cloudflare provisioning state.

The explicit generated-config command deploys the bundled Worker and its assets, not a Pages site. Vite-based deployments use Wrangler after building; see [Cloudflare Vite deployment](https://developers.cloudflare.com/workers/vite-plugin/get-started/). A dry run does not prove remote authentication, storage, migrations, or Access coverage.

### 8. Bootstrap without public routes, then install the secret

Once step 3 is complete and checks pass, deploy the artifact with routes still empty and both default and preview URLs disabled. This establishes the Worker so its secret can be stored without publishing the app to a public hostname:

```sh
npx wrangler deploy --config dist/server/wrangler.json
npx wrangler secret put SESSION_SECRET --config wrangler.jsonc
```

Supply the secret through Wrangler's protected prompt; do not echo it or put it in `vars`. The app requires at least 32 characters; generate and retain it in the owner's secret manager. Rotation invalidates signatures on existing cookies and requires users to sign in again.

Environment/binding inventory (names only; no values):

| Name | Role and status |
| --- | --- |
| `AUTH_MODE` | Existing runtime non-secret variable; must select session authentication. |
| `SESSION_SECRET` | Existing required runtime secret for session signing. Store with Wrangler secrets. |
| `TEAM_DOMAIN` | Proposed non-secret Access issuer configuration; must be implemented in step 3. |
| `POLICY_AUD` | Proposed non-secret Access audience configuration; must be implemented in step 3. |
| `CLOUDFLARE_ACCOUNT_ID` | Operator/CLI account selection, not application data. |
| `CLOUDFLARE_API_TOKEN` | Optional operator/CLI secret if using token authentication instead of an existing authorized login. Not a Worker secret. |
| `DB` | Existing native D1 binding, not a connection-string environment variable. |
| `BUCKET` | Existing native R2 binding, not an S3 credential. |
| `ASSETS` | Native static-assets binding used by the Worker. |
| `IMAGES` | Native Images binding required if the existing optimizer route is retained. |

No OpenAI, USCIS, SMTP, OAuth-client, or database-password secrets are required by today's code. Access sends PINs; the app has no mailer. Never populate `VITE_SESSION_SECRET` for a deployed build. `.env*` is ignored, but `.dev.vars*` and backup files are not currently explicitly ignored: add ignore rules before using them, and keep all credentials, runtime data, uploads, and exports outside Git.

### 9. Attach only the protected hostname and deploy the final artifact

Confirm that the Access application from step 2 covers the exact hostname and all paths. Add its custom-domain route to the source Wrangler configuration:

```jsonc
"routes": [
  { "pattern": "<APP_HOSTNAME>", "custom_domain": true }
]
```

Keep `workers_dev` and `preview_urls` disabled so they cannot provide an alternate route around the hostname policy. Use an unused hostname in the owner's active zone, and resolve any existing DNS conflict before attachment. Cloudflare documents [Worker custom domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/).

```sh
npm run build
npx wrangler deploy --dry-run --config dist/server/wrangler.json
npx wrangler deploy --config dist/server/wrangler.json
```

This route-only rebuild follows the already-tested implementation. Re-run the full tests if implementation changes. Inspect the emitted route/auth/binding settings before the real deploy. Neither these commands nor a GitHub push alter the current ChatGPT Site; retaining or retiring that Site is a separate owner decision.

### 10. Smoke-test with synthetic data before invitations

- An anonymous browser sees Access login on `/` and `/api/profile`; an unapproved email cannot obtain access. The approved owner receives a PIN and reaches the app. Default `workers.dev`, preview URLs, and any other route must not bypass the gate.
- Valid Access login results in a secure app session and functioning APIs, not a loop to `/signin-with-chatgpt` or repeated 401s. Invalid/missing Access JWTs, wrong audience/issuer, expired/tampered app cookies, and forged Sites/Access email headers cannot read or write records. Test logout and identity switching.
- In two separate approved browser sessions, create distinct profiles and verify profile/plan persistence after reload. Account B must not see A's profile, receipts, completion state, or documents. B's attempts to download/delete A's document by ID must return 404 without affecting A.
- Save and relabel the same receipt, open the official USCIS link, and delete the test receipt. Confirm the app does not imply an automatic status refresh.
- Upload a synthetic PDF/JPEG/PNG, download and compare it, then delete it. Verify unsupported types and files over 10 MB are rejected; verify the bucket remains private and API/download responses have `private, no-store`.
- Complete/reopen a checklist action; change its date and verify a new uncompleted action. Inspect displayed official links and assistant response caveats against the content audit.
- Export `.ics`; import into a test calendar. Confirm only open dated actions appear as all-day dates with correct dates and source links, and that no sync/notification promise is shown.
- Verify HTML, JS/CSS, mobile layout, and the image endpoint if retained. Check Worker errors without logging cookies, JWTs, profile content, or uploaded files.
- Define retention and recovery procedures, back up D1 and R2 outside Git, and rehearse restore into separate test resources. A D1 backup does not include file objects. Ensure restored document metadata matches R2 object keys before relying on recovery.

**Launch blockers at this revision:** Access-to-session login/logout integration and its configuration; a real production Wrangler/Vite configuration; owner-provisioned D1/R2 plus remote migrations; backup/restore verification; and real two-account login/isolation smoke tests. The content audit also records source/wording review work. This run prepares documentation and does not claim any blocker is resolved by a successful local build.
