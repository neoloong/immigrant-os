# Immigrant OS Branded Email-PIN Login — Design Document

Status: Implemented behind feature flag `BRANDED_LOGIN_ENABLED` (default **OFF**) on branch `feat/branded-login`.

## Goal

Replace the Cloudflare-branded Cloudflare Access login screen with Immigrant OS's own branded email-PIN login flow while reusing the existing self-owned `sessions` table and HMAC-signed `immigrant_session` cookie (`lib/auth.ts`).

---

## (a) Authentication Flow

1. **Step 1 — Enter email (`GET /auth/login`)**
   - When `AUTH_MODE=session` and `BRANDED_LOGIN_ENABLED="true"`, `GET /auth/login` serves a standalone, server-rendered HTML login page styled identically to the public landing page (`lib/public-pages.ts`), headed **Immigrant OS**, carrying the approved invite-only and no-legal-advice boundary copy, and containing zero references to Cloudflare.
   - No JavaScript or third-party assets are required (`Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`).
   - The user submits their email via `<form method="post" action="/auth/login/code">` (JSON callers are also supported via `Content-Type: application/json`).

2. **Step 2 — Generate & send 6-digit code (`POST /auth/login/code`)**
   - Validates same-origin (`Origin` / `Sec-Fetch-Site`), checks per-IP rate limits, normalizes the email (`trim().toLowerCase()`), validates basic email syntax, and records per-email rate limiting.
   - Checks **eligibility**: the normalized email must either already own at least one row in `profiles` OR appear in the `BRANDED_LOGIN_ALLOWLIST` environment variable.
   - If eligible (and not per-email rate-limited):
     - Generates a cryptographically random 6-digit numeric PIN (`000000`–`999999`) via `crypto.getRandomValues` with rejection sampling (no modulo bias).
     - Replaces any previous active `login_codes` row for that email with a new row containing `(id, email, code_hash, expires_at, attempts = 0, created_at)`, where `expires_at = now + 10 minutes`.
     - Sends the plaintext 6-digit code via the `Mailer` interface (`lib/mailer.ts`). The plaintext code is never stored in D1 and never logged in production.
   - Returns an **identical** `200 OK` response (same status, wording, and Step 2 HTML form / JSON shape) whether or not the email is eligible or throttled by per-email rate limits.

3. **Step 3 — Verify code & issue session (`POST /auth/login/verify`)**
   - Validates same-origin and per-IP rate limits, normalizes the email, and reads the submitted 6-digit code.
   - Looks up the active `login_codes` row for the normalized email:
     - If missing, expired (`expires_at <= now`), or already at `attempts >= 5`: cleans up the stale row if present and returns `401 Unauthorized` with a single uniform error message.
     - Recomputes the keyed hash for the submitted code and compares it in constant time (`timingSafeEqual`).
     - On mismatch: atomically increments `attempts`. Once `attempts` reaches `5`, the row is deleted (invalidated immediately). Returns `401 Unauthorized` with the same uniform error message.
     - On match: atomically consumes/deletes the row (`DELETE FROM login_codes WHERE id = ? AND attempts < 5 RETURNING id`) to prevent concurrent double-redemption, revokes any previous `immigrant_session` cookie on the request, calls the existing `issueSession(email)` (`lib/auth.ts`), sets `immigrant_session=<id>.<hmac>; Path=/; Secure; HttpOnly; SameSite=Lax; Expires=...`, and returns `303 See Other` with `Location: /`.

4. **Authenticated app requests & logout**
   - When `BRANDED_LOGIN_ENABLED="true"`, `handleAccessAuth` honors a valid `immigrant_session` cookie via `ownerFromSessionCookie()` without requiring a Cloudflare Access JWT.
   - `POST /auth/logout` revokes the D1 session row and clears `immigrant_session`. If an Access token is present and Access is configured, it redirects to `/cdn-cgi/access/logout`; otherwise it redirects to `/`.

---

## (b) Security Design

### Code hashing: Keyed HMAC-SHA-256 with `SESSION_SECRET`

We use **keyed HMAC-SHA-256** using the Worker's `SESSION_SECRET` (already required to be `>= 32` characters and stored only as a Wrangler secret, outside D1), with explicit domain separation and per-row binding:

```text
code_hash = hex(HMAC-SHA-256(
  key     = SESSION_SECRET,
  message = "login-code:v1:" + row.id + ":" + normalizedEmail + ":" + code
))
```

**Why HMAC-SHA-256 with `SESSION_SECRET` instead of plain salted SHA-256:**
- A 6-digit PIN has only $10^6$ possible values. With unsalted or salted SHA-256 alone, anyone who obtains a D1 backup or read-only database dump can brute-force all $10^6$ candidates offline in milliseconds per row.
- With HMAC-SHA-256 keyed by `SESSION_SECRET`, the verification key lives only in Worker secrets, never in D1. A D1 snapshot leak alone cannot be used to mount an offline brute-force attack against active codes.
- Including the random UUID `row.id` acts as a unique per-code salt; including `normalizedEmail` binds the hash to its intended recipient; and the `"login-code:v1:"` prefix domain-separates code hashes from `immigrant_session` cookie signatures (which sign raw session IDs).
- Verification uses constant-time byte comparison (`timingSafeEqual`) so hash verification leaks no timing signal.
- Plaintext codes are never persisted to D1 and never written to production logs.

### Expiry and attempt limits
- **Expiry**: 10 minutes (`CODE_TTL_MS = 10 * 60 * 1000`). Expired rows are rejected and deleted on lookup.
- **Max verify attempts**: 5 (`MAX_VERIFY_ATTEMPTS = 5`). Every failed verification against an active code increments `attempts` atomically. On the 5th failed attempt, the `login_codes` row is deleted/invalidated so even the real code can no longer succeed.
- **Single-use consumption**: Successful verification deletes the row atomically with `WHERE id = ? AND attempts < 5 RETURNING id`, preventing replay and concurrent race conditions.
- **Superseding previous codes**: Issuing a new code for an email deletes any prior unexpired `login_codes` row for that email so only one code is valid at a time.

### Rate limits
- **Per-IP rate limits** (sliding 15-minute window, keyed on `CF-Connecting-IP` with `X-Forwarded-For` fallback outside Cloudflare):
  - `POST /auth/login/code`: max **20 requests / 15 min / IP** (returns `429 Too Many Requests` with `Retry-After`).
  - `POST /auth/login/verify`: max **30 requests / 15 min / IP** (returns `429 Too Many Requests` with `Retry-After`).
  - Because per-IP limits depend only on the caller's IP and never on whether an email exists, returning `429` does not leak account existence.
  - **Edge caveat**: Worker in-memory rate-limit state is per-isolate (best-effort across edge PoPs). Before opening traffic publicly without Access at the edge, pair this with a Cloudflare WAF Rate Limiting rule on `/auth/login/code` and `/auth/login/verify`.
- **Per-email rate limit** (sliding 15-minute window, max **5 code requests / 15 min / email**):
  - Tracked in-memory for **every** syntactically valid email (eligible or not) so throttling behavior never differs between known and unknown addresses, plus cross-checked against recent `login_codes` rows in D1.
  - When the per-email limit is exceeded, the handler skips code generation/email dispatch and still returns the **exact same `200 OK` uniform response**, preventing both email bombing and enumeration.

### Anti-enumeration
- `POST /auth/login/code` returns the **exact same HTTP status (`200`), headers, body shape, and wording** (`"If your email is authorized for Immigrant OS, we sent a 6-digit sign-in code. It expires in 10 minutes."`) whether the email:
  1. owns a profile in D1,
  2. is listed in `BRANDED_LOGIN_ALLOWLIST`,
  3. is completely unknown, or
  4. has exceeded the per-email rate limit.
- `POST /auth/login/verify` returns the **exact same `401` status and uniform error message** (`"Invalid or expired sign-in code. Please try again or request a new code."`) for unknown emails, missing codes, expired codes, exhausted codes, malformed codes, and wrong codes.
- Same-origin CSRF checks (`Origin` and `Sec-Fetch-Site`) protect both POST endpoints.

---

## (c) Coexistence & Switch Plan with Cloudflare Access

### Feature-flagged parallel rollout

The implementation is gated behind `BRANDED_LOGIN_ENABLED` (default **OFF** when unset or any value other than `"true"`).

1. **Phase 1 — Safe deploy with flag OFF (zero behavior change)**
   - Apply D1 migration `drizzle/0005_login_codes.sql` (`wrangler d1 migrations apply`).
   - Deploy the Worker with `BRANDED_LOGIN_ENABLED` unset (or `"false"`). All existing Cloudflare Access behavior and all 86 existing tests remain unchanged.
   - Complete mailer provisioning (Resend domain DNS records + `RESEND_API_KEY` secret) and set `BRANDED_LOGIN_ALLOWLIST` for any invited users who do not yet have a `profiles` row.

2. **Phase 2 — Parallel rollout while Access is still at the edge**
   - Enable `BRANDED_LOGIN_ENABLED="true"`.
   - **How sessions coexist in the Worker**:
     - `handleAccessAuth` checks `ownerFromSessionCookie(request, auth)` first when `BRANDED_LOGIN_ENABLED` is on. A valid `immigrant_session` cookie is honored immediately for all app paths (`/`, `/api/*`, `/_vinext/image`) without requiring `Cf-Access-Jwt-Assertion` or `CF_Authorization`.
     - If no valid `immigrant_session` cookie is present and `ACCESS_TEAM_DOMAIN` / `ACCESS_AUD` are still configured, the Worker still verifies any incoming Access JWT and continues supporting `GET /auth/access` to mint `immigrant_session` cookies.
   - **Important edge constraint while Access still fronts `/*`**:
     - Cloudflare Access runs at the Cloudflare edge *before* requests reach the Worker. While an Access application gates `/*`, unauthenticated visitors cannot reach `/auth/login`, `/auth/login/code`, `/auth/login/verify`, or even app paths carrying only `immigrant_session` (without `CF_Authorization`) because Access intercepts the request first.
     - Therefore, during parallel validation, either:
       - validate branded login on a staging hostname / route not fronted by Access, OR
       - add Access Bypass rules for `/auth/login`, `/auth/login/code`, `/auth/login/verify` while validating code issuance, and then transition the Access application scope in Phase 3.

3. **Phase 3 — Cutover**
   - Remove the catch-all `/*` Cloudflare Access policy from the app hostname (or narrow it to `/auth/access` only — see below) while keeping `BRANDED_LOGIN_ENABLED="true"`, `AUTH_MODE="session"`, `SESSION_SECRET`, and `RESEND_API_KEY` active.
   - Confirm:
     - Unauthenticated `GET /` serves the public landing page.
     - Unauthenticated `/api/*` returns `401`.
     - `GET /auth/login` -> `POST /auth/login/code` -> `POST /auth/login/verify` issues `immigrant_session` and lands signed-in users on `/`.
     - Mobile shells (iOS/Android Capacitor WebViews) now complete login entirely on the app's own origin without bouncing to `*.cloudflareaccess.com`.

### Feasibility judgment: Keeping Cloudflare Access as an admin backdoor after switch-over

**Verdict: Feasible, low-risk, and practically useful — provided Access is scoped strictly to `/auth/access` (or a dedicated admin hostname) and locked to owner-only email(s).**

- **How it works**:
  - Narrow the Cloudflare Access self-hosted application from `immigrantos.com/*` to **only** `immigrantos.com/auth/access`, with an Allow policy containing exclusively the owner's email address(es).
  - Keep `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` configured in the Worker.
  - Regular users sign in at `/auth/login` and never touch `/auth/access` or see Cloudflare branding.
  - If Resend has an outage or the owner needs break-glass access, the owner visits `/auth/access`. Cloudflare Access authenticates the owner at the edge, forwards the signed Access JWT to `/auth/access`, and the Worker mints a standard `immigrant_session` cookie and redirects to `/`. Subsequent requests to `/` and `/api/*` succeed via `immigrant_session` without needing Access on those paths.
- **Constraints & trade-offs**:
  - The Access policy on `/auth/access` must remain strictly owner-only (never `Everyone` or `Bypass`), because any user authorized by `ACCESS_AUD` can mint an `immigrant_session` for their email via `/auth/access`.
  - On `POST /auth/logout`, when an Access cookie/header is present alongside `ACCESS_TEAM_DOMAIN`/`ACCESS_AUD`, the Worker redirects to `/cdn-cgi/access/logout` so the admin's Access session is also terminated; normal branded-login users (no Access cookie) redirect cleanly to `/`.
  - When unused, keeping `ACCESS_TEAM_DOMAIN`/`ACCESS_AUD` adds zero latency to branded-login requests because `ownerFromSessionCookie` succeeds before any Access check or JWKS fetch runs.

---

## (d) Mailer Options (Facts Only)

### 1. Resend (HTTP REST API)
- **How it works**: `POST https://api.resend.com/emails` with `Authorization: Bearer <RESEND_API_KEY>` and a JSON body (`from`, `to`, `subject`, `text`, `html`). Uses standard Web `fetch` — zero npm packages required in Cloudflare Workers.
- **What it requires**:
  1. A Resend account.
  2. A Resend API key (`RESEND_API_KEY`, stored as a Worker secret via `wrangler secret put RESEND_API_KEY`).
  3. A verified sending domain (`immigrantos.com` or a subdomain such as `mail.immigrantos.com`) with Resend's required **SPF** (TXT/MX on the send subdomain) and **DKIM** (CNAME/TXT) DNS records published on the domain's DNS zone (plus recommended DMARC TXT record).
  4. Optional `RESEND_FROM` env var (defaults to `Immigrant OS <login@immigrantos.com>`).
- **Single step only the owner can do**: Create the Resend account / accept Resend's terms of service and generate the API key (`RESEND_API_KEY`).

### 2. Cloudflare-side email options
- **Current repo state**: The repository has no email binding or mailer today (`wrangler.jsonc` binds only `DB`, `BUCKET`, `ASSETS`, and `IMAGES`; `docs/cloudflare-hosting.md` confirms the app has no mailer).
- **Cloudflare Email Routing (Free)**: Supports inbound routing and a `send_email` Workers binding that is restricted to pre-verified destination addresses owned by the account. It **cannot** send login PINs to arbitrary external user email addresses.
- **Cloudflare Email Service — Email Sending (Beta, Paid)**: Cloudflare offers native outbound transactional email from Workers via the `send_email` binding (`env.SEND_EMAIL.send(...)`) to arbitrary recipients after onboarding the sending domain (bounce MX, SPF, DKIM, and DMARC records in Cloudflare). However, per Cloudflare's documentation, outbound sending to arbitrary recipients is in **beta**, is **not available on the Workers Free plan**, and requires a **Workers Paid plan** (base $5/month, including 3,000 outbound emails/month and $0.35 per 1,000 overage).
- **Bottom line**: There is **no free Cloudflare-native mailer** for arbitrary recipients. Cloudflare Email Service is a real Cloudflare-side option if the account is on the Workers Paid plan and the owner opts into the beta; otherwise an external transactional API like Resend is required.

### What this implementation provides
- `lib/mailer.ts` defines a minimal provider-agnostic `Mailer` interface: `sendLoginCode(email: string, code: string): Promise<void>`.
- Implemented adapters:
  1. **Resend (`createResendMailer`)**: uses native `fetch` against `https://api.resend.com/emails`; active automatically whenever `RESEND_API_KEY` is set.
  2. **Dev stub (`createDevMailer`)**: active only when `RESEND_API_KEY` is absent; logs the code to the local dev console **only** when `import.meta.env.DEV` is true, and throws without logging in all non-dev/production builds.
- If the owner later adopts Cloudflare Email Service (`send_email` binding), adding a Cloudflare adapter behind `Mailer` requires changing only `lib/mailer.ts` and `wrangler.jsonc`.
