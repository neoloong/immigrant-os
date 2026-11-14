# Independent Cloudflare hosting preparation

Updated 2026-11-09 on `independent-hosting`, based on main `35c8e70`. The branch implements independent hosting configuration and Access-to-session authentication. **No Wrangler cloud command, deployment, push, or merge was performed.** The existing owner-private ChatGPT Site and its audience remain unchanged.

## Branch status and remaining operator work

The requested resources are already provisioned (operator-supplied identifiers; not remotely inspected):

- Account: `8fba78f3e5f52d302a5482370c61c15c`
- D1: `immigrant-os-db`, ID `b9fe7d41-8f74-49cd-9e5b-dacf60ca9f7a`, binding `DB`
- Private R2: `immigrant-os-files`, binding `BUCKET`
- Worker: `immigrant-os`

The original checkout's `.git` is read-only in the execution sandbox. The implementation branch and commit are in the isolated local clone at `work/independent-hosting`; original `main` remains untouched. Run the commands below from that clone or from a checkout of its commit. Do not recreate the cloud resources.

| Repository evidence | Independent deployment behavior |
| --- | --- |
| `wrangler.jsonc`, `vite.config.ts` | Real account/D1/R2 configuration, `AUTH_MODE=session`, assets/images bindings, `drizzle` migrations, empty routes, disabled default/preview URLs. Vite reads this file without inline binding overrides. |
| `lib/access-jwt.ts`, `lib/access-auth.ts`, `worker/index.ts` | Validates Access JWTs, issues existing D1/HMAC sessions, checks Access identity against session owner, bootstraps at `/auth/access`, and revokes on logout. |
| `lib/auth.ts` | Existing session signing, lookup, expiry, and revocation remain authoritative. Dispatch mode still exists for Sites; local preview identity bypass applies only to dispatch mode. |
| `app/page.tsx` | Error-screen sign-in uses `/auth/login`; a POST sign-out form uses `/auth/logout`. Worker selects the login/logout destination for the runtime auth mode. The unused `app/chatgpt-auth.ts` remains a Sites helper. |
| `drizzle/0000_new_maria_hill.sql`, `drizzle/0001_round_ted_forrester.sql` | Committed migrations create workspace tables and sessions. Apply to the fresh remote D1 before traffic. |
| `db/index.ts::ensureDatabase` | Inline table initialization does not record Wrangler migration history. It is not a substitute for remote migrations. |
| `build/sites-vite-plugin.ts`, `scripts/validate-artifact.mjs` | Existing Sites artifact packaging/validation remains in the build, but passing it does not establish Sites runtime compatibility. |

**Sites merge warning:** this branch replaces the Sites placeholder binding configuration with the owner's Cloudflare resources and selects session authentication. Rebuilding/publishing it as the existing Site could bind the wrong resources or reject Sites dispatch identity (503 without Access/secret settings; 401 without a verified Access JWT). Keep the current Sites deployment on main until the operator decides cutover timing or separates deployment configurations. A GitHub push does not deploy either host.

Remaining sequence: configure Access and its two non-secret vars (steps 2–3); apply remote migrations (6); rerun checks outside the sandbox (7); deploy without routes, then install `SESSION_SECRET` (8); attach only the protected hostname and rebuild/deploy (9); complete synthetic two-account and recovery checks (10). The hostname, team domain, and audience are operator choices and have intentionally not been invented.

This guide supersedes the **independent-hosting provisioning subsection** of [operations.md](operations.md): use Wrangler secrets for the session secret, apply committed SQL to an explicit remote target, and preserve the existing Site audience.

## Ordered provisioning checklist

### 1. Prepare the owner's account and deployment machine

- Use Node.js 22.13.0 or later and `npm ci`; run commands below from the repository root with its pinned Wrangler (`npx wrangler`). Do not upgrade dependencies as part of provisioning.
- The owner needs an existing Cloudflare account with Workers, D1, and R2 enabled and permission to create resources, manage Worker secrets/deployments, and administer Zero Trust Access. R2 activation or account plan changes may require billing authorization by the owner.
- Configure a Zero Trust organization/team domain. This runbook uses a dedicated hostname in an existing Cloudflare-managed DNS zone; the owner must control that zone. No domain purchase is implied.
- The operator must already have an owner-authorized Wrangler login, or supply a scoped API token through the deployment environment. Token permissions must cover Workers deployment/secrets, D1, R2, and the chosen zone's routing as needed. Access setup below can be performed in the dashboard by an authorized administrator. Do not put credentials in commands, source, screenshots, or Git.
- Decide whether the new pilot starts empty or imports existing Sites data. No Sites D1/R2 export or account-owner remapping tool exists here. Back up and separately plan any transfer; do not assume a source checkout includes hosted data. Retain the current Site and audience during validation.

### 2. Set up the Access email-PIN gate before attaching a Worker hostname

In the Cloudflare dashboard's **Zero Trust → Integrations → Identity providers**, add **One-time PIN**. Under **Access → Applications**, add a **Self-hosted** application for the exact planned hostname and all paths, including `/api/*` and `/auth/*`. Select One-time PIN as the allowed login method. Create an **Allow** policy listing only the owner's approved email addresses; begin with the owner and add pilot testers only when authorized. Do not use an Everyone allow rule or a Bypass rule. Record the application's audience tag and the team issuer domain for the server integration. Choose and record a session duration. See Cloudflare's [OTP setup](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/) and [self-hosted application setup](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/).

### 3. Configure the implemented Access session bridge

Access's `CF_Authorization` cookie is not the app's `immigrant_session` cookie. In session mode the Worker now handles:

- `GET /auth/access`: verify `Cf-Access-Jwt-Assertion` using RS256 and the team JWKS, exact issuer, matching application audience (string or array claim), expiry, optional not-before, and a usable email claim. Use only the normalized verified email. Missing/invalid JWTs return 401, with no plain-email-header fallback.
- `GET /`: require a valid Access JWT and redirect to `/auth/access` if the app session is missing, expired, or belongs to a different owner. The bridge revokes the previous signed session, calls the existing `issueSession`, and redirects to `/` with a host-only `immigrant_session` cookie (`Secure; HttpOnly; SameSite=Lax; Path=/; Expires=...`).
- Every routed protected request: require a valid Access JWT and a matching session owner. Missing/expired Access cannot be bypassed with a surviving app cookie. Mismatched identities revoke the old session and APIs return 401; they do not perform an operation under the previous identity.
- `GET /auth/login`: select `/auth/access` in session mode, or the original Sites sign-in path in dispatch mode.
- `POST /auth/logout`: reject explicitly cross-origin submissions, call `revokeSession`, clear the app cookie, and redirect to `/cdn-cgi/access/logout` to end Access login. Logout can clear an app session even if its Access JWT has expired. The successful workspace UI exposes the form. In dispatch mode the route redirects to Sites sign-out.

Set `ACCESS_TEAM_DOMAIN` to the hostname only, such as `<team>.cloudflareaccess.com` (no `https://` or slash), and `ACCESS_AUD` to the self-hosted application's audience tag. Add these non-secret values alongside `AUTH_MODE` in root `wrangler.jsonc` `vars`, then rebuild. The issuer is `https://<ACCESS_TEAM_DOMAIN>` and keys come only from `https://<ACCESS_TEAM_DOMAIN>/cdn-cgi/access/certs`. Public keys are cached for up to 60 seconds; a newly rotated key may take that long to be accepted. JWKS failure fails closed. No JWTs or identities are cached or logged.

Until both Access vars and a valid `SESSION_SECRET` are set, session-mode protected routes and the bridge return 503. No session-mode request falls back to dispatch email headers, including localhost development requests. Auth responses use `private, no-store`.

Tests cover absent JWT/configuration, forged email headers, bad signatures, wrong issuer/audience, malformed/expired/premature claims, invalid algorithms/keys, JWKS failure, secure session cookies, owner isolation, identity switching, and logout/revocation. Review and run the complete suite before deployment. See Cloudflare's [JWT validation](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/) and [logout behavior](https://developers.cloudflare.com/cloudflare-one/access-controls/access-settings/session-management/#log-out-as-a-user).

### 4. Use the already-provisioned D1 and private R2

Use `immigrant-os-db` (`b9fe7d41-8f74-49cd-9e5b-dacf60ca9f7a`) and `immigrant-os-files` in account `8fba78f3e5f52d302a5482370c61c15c`, exactly as committed in `wrangler.jsonc`. Do not run resource-create commands. Verify in the operator's dashboard that R2 remains private, without a public custom domain or `r2.dev` access. The app uses native bindings and needs no R2 S3 credentials.

### 5. Review production configuration and its Vite connection

The committed root `wrangler.jsonc` contains the following configuration. Add only the operator-selected Access vars and, at step 9, the protected hostname:

```jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "immigrant-os",
  "account_id": "8fba78f3e5f52d302a5482370c61c15c",
  "main": "./worker/index.ts",
  "compatibility_date": "2026-05-15",
  "compatibility_flags": ["nodejs_compat"],
  "workers_dev": false,
  "preview_urls": false,
  "routes": [],
  "assets": { "binding": "ASSETS" },
  "images": { "binding": "IMAGES" },
  "vars": { "AUTH_MODE": "session" },
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "immigrant-os-db",
      "database_id": "b9fe7d41-8f74-49cd-9e5b-dacf60ca9f7a",
      "migrations_dir": "drizzle"
    }
  ],
  "r2_buckets": [
    { "binding": "BUCKET", "bucket_name": "immigrant-os-files" }
  ]
}
```

The account and D1 identifiers are already set; use owner-authorized Wrangler credentials for that account. The compatibility date above matches the current toolchain's generated artifact. Keep initial routes empty and both default/preview URLs disabled until the gate and secret are ready. The Vite plugin generates the static-asset directory in the deployment output; do not point production at the TypeScript entry without first building.

In `vite.config.ts`, `configPath: "./wrangler.jsonc"` now replaces `config: localBindingConfig`, and the obsolete inline overrides/imports are removed. `vinext()`, `sites()`, and `viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] }` are preserved. The plugin applies inline `config` overrides after reading a file, which is why retaining the placeholder override would be incorrect. See its [configuration API](https://developers.cloudflare.com/workers/vite-plugin/reference/api/). Keep the current Sites configuration on the existing deployment until cutover.

Keep `vars.AUTH_MODE` set to **session** and add `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` using the operator-supplied settings from step 3. Do not place the session secret in `vars`.

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

Once the Access vars are configured and checks pass, deploy the artifact with routes still empty and both default and preview URLs disabled. This establishes the Worker so its secret can be stored without publishing the app to a public hostname:

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
| `ACCESS_TEAM_DOMAIN` | Runtime non-secret team hostname, `<team>.cloudflareaccess.com`; implemented, but operator must supply the value. No URL scheme/path. |
| `ACCESS_AUD` | Runtime non-secret audience tag of the self-hosted Access application; implemented, but operator must supply the value. |
| `CLOUDFLARE_ACCOUNT_ID` | Operator/CLI account selection, not application data. |
| `CLOUDFLARE_API_TOKEN` | Optional operator/CLI secret if using token authentication instead of an existing authorized login. Not a Worker secret. |
| `DB` | Existing native D1 binding, not a connection-string environment variable. |
| `BUCKET` | Existing native R2 binding, not an S3 credential. |
| `ASSETS` | Native static-assets binding used by the Worker. |
| `IMAGES` | Native Images binding required if the existing optimizer route is retained. |

No OpenAI, USCIS, SMTP, OAuth-client, or database-password secrets are required by today's code. Access sends PINs; the app has no mailer. Never populate `VITE_SESSION_SECRET` for a deployed build. Both `.env*` and `.dev.vars*` are ignored. Keep all credentials, runtime data, uploads, backup files, and exports outside Git.

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

**Remaining launch gates:** complete tests outside the listener-restricted sandbox; operator-provided Access hostname/team/audience and session secret; remote D1 migration verification; gated deployment and real two-account login/isolation smoke tests; backup/restore verification. Local build success does not establish these external results.

## Implementation validation (2026-11-09)

- Node 22.22.0; `npm ci --offline --cache /Users/chao/Projects/immigrant-os/.sites-runtime/npm-cache --no-audit --no-fund` passed using the existing local cache. Lockfile/dependencies unchanged.
- `npm run build` passed, including the existing artifact validator. The generated `dist/server/wrangler.json` has the real account/D1/R2, `AUTH_MODE=session`, `ASSETS`/`IMAGES`, and disabled default/preview routes. Migrations continue to use the root config, not the generated config.
- `npx tsc --noEmit` passed.
- `npm test` exited 1: 12 passing results (nine nested Access validation/bootstrap checks, their parent, calendar, rendered HTML); three Miniflare suite initializations failed with `listen EPERM: operation not permitted 127.0.0.1`. Their nested session/owner/storage tests did not run. The suites were not weakened or skipped; rerun the entire command outside this sandbox.
- No Wrangler command was run, including no dry-run deploy. All cloud commands in this document are remaining operator actions.
