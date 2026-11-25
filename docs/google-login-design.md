# Immigrant OS Google Sign-In ("Continue with Google") — Design Document

Status: Implemented behind feature flag `GOOGLE_LOGIN_ENABLED` (default **OFF**, requires `BRANDED_LOGIN_ENABLED="true"`, `GOOGLE_CLIENT_ID`, and `GOOGLE_CLIENT_SECRET`) on branch `feat/google-login`.

## Goal

Add one-click **Continue with Google** sign-in as a parallel option alongside the existing branded email-PIN flow (`POST /auth/login/code` + `/auth/login/verify`). Google sign-in does **not** replace email-PIN login, creates **no** new D1 table, stores **no** Google OAuth tokens, and reuses the exact same eligibility gate (`isEmailEligible`) and self-owned session issuance (`issueSession` + `immigrant_session` cookie).

---

## 1. Feature Gating & Route Isolation

- **Injection (`worker/index.ts` → `lib/auth.ts`)**:
  `__IMMIGRANT_AUTH_CONFIG__.googleLoginEnabled` is computed as:
  ```ts
  env.GOOGLE_LOGIN_ENABLED === "true"
    && Boolean(env.GOOGLE_CLIENT_ID?.trim())
    && Boolean(env.GOOGLE_CLIENT_SECRET?.trim())
  ```
- **Zero behavior change when OFF**:
  - In `lib/access-auth.ts`, `GET /auth/google/start` and `GET /auth/google/callback` are intercepted **only** when `auth.authMode === "session" && auth.brandedLoginEnabled && auth.googleLoginEnabled`.
  - When any of those conditions is false, both paths fall through untouched to existing routing/auth logic, no Google button is rendered on `/auth/login`, and zero outbound `fetch` calls to Google can occur.
  - Non-`GET` methods to either endpoint return `405 Method Not Allowed` with `Allow: GET` and `Cache-Control: private, no-store`.
  - Defense-in-depth: both handlers also verify `env.GOOGLE_CLIENT_ID` and `env.GOOGLE_CLIENT_SECRET` directly and return `404 Not Found` if either is missing/blank.

---

## 2. Full OAuth 2.0 Authorization Code + PKCE (S256) + State + Nonce Sequence

```mermaid
sequenceDiagram
    participant U as User Browser
    participant W as Immigrant OS Worker
    participant G as Google OAuth / OIDC
    participant D as D1 (profiles, sessions)

    U->>W: GET /auth/login
    W-->>U: 200 HTML branded login page (PIN form + "Continue with Google" link)

    U->>W: GET /auth/google/start
    Note over W: Generate state (32B), code_verifier (48B),<br/>nonce (32B), code_challenge = BASE64URL(SHA256(verifier))<br/>Sign payload into immigrant_google_oauth cookie (10m)
    W-->>U: 303 https://accounts.google.com/o/oauth2/v2/auth<br/>+ Set-Cookie: immigrant_google_oauth (HttpOnly; Secure; SameSite=Lax; Path=/auth/google)

    U->>G: Authorize (client_id, redirect_uri, response_type=code,<br/>scope="openid email", state, nonce, code_challenge, S256, prompt=select_account)
    G-->>U: 302 {origin}/auth/google/callback?code=...&state=... (or ?error=...)

    U->>W: GET /auth/google/callback?code=...&state=...<br/>Cookie: immigrant_google_oauth=...
    Note over W: 1. Reject if ?error present or code/state missing<br/>2. Verify HMAC cookie signature, exp, and constant-time state match
    W->>G: POST https://oauth2.googleapis.com/token (timeout 10s)<br/>grant_type=authorization_code, code, client_id, client_secret,<br/>redirect_uri, code_verifier
    G-->>W: 200 { id_token, ... } (other tokens discarded immediately)

    W->>G: GET https://www.googleapis.com/oauth2/v3/certs (cached; refresh once on unknown kid; timeout 10s)
    G-->>W: 200 { keys: [...] }
    Note over W: 3. Verify RS256 signature via WebCrypto<br/>4. Validate iss, aud, exp, iat, nonce, email, email_verified

    W->>D: isEmailEligible(normalizeEmail(email), BRANDED_LOGIN_ALLOWLIST)
    D-->>W: eligible?

    alt Eligible
        W->>D: Revoke previous immigrant_session (if present) + issueSession(email)
        W-->>U: 303 Location: /<br/>+ Set-Cookie: immigrant_session=...<br/>+ Set-Cookie: immigrant_google_oauth= (Max-Age=0)
    else Any failure (provider error, bad cookie/state, token/JWKS/ID-token error, unverified or ineligible email)
        W-->>U: 303 Location: /auth/login?error=google<br/>+ Set-Cookie: immigrant_google_oauth= (Max-Age=0)
        U->>W: GET /auth/login?error=google
        W-->>U: 200 Login page with single uniform error banner
    end
```

### Start Endpoint Details (`GET /auth/google/start`)
- Generates cryptographically random values via `crypto.getRandomValues`:
  - `state`: 32 random bytes, base64url-encoded (43 chars).
  - `code_verifier`: 48 random bytes, base64url-encoded (64 chars, within RFC 7636's 43–128 char range).
  - `code_challenge`: `BASE64URL(SHA-256(ASCII(code_verifier)))` with `code_challenge_method=S256`.
  - `nonce`: 32 random bytes, base64url-encoded (43 chars).
- Constructs `redirect_uri` dynamically from the incoming request URL origin: `${new URL(request.url).origin}/auth/google/callback` (no hardcoded domain).
- Redirects (`303 See Other`, `Cache-Control: private, no-store`) to `https://accounts.google.com/o/oauth2/v2/auth` with parameters:
  - `client_id`
  - `redirect_uri`
  - `response_type=code`
  - `scope=openid email`
  - `state`
  - `nonce`
  - `code_challenge`
  - `code_challenge_method=S256`
  - `prompt=select_account`
- Does **not** request `access_type=offline` or any scope beyond `openid email`.

---

## 3. State & PKCE Carrier: Signed Cookie (No New D1 Table)

- **Cookie name**: `immigrant_google_oauth`
- **Attributes**: `Path=/auth/google; Secure; HttpOnly; SameSite=Lax; Max-Age=600; Expires=<UTC + 10 min>`
  - `SameSite=Lax` allows the browser to send the cookie on Google's top-level `GET` redirect back to `/auth/google/callback` while blocking cross-site subresource/POST requests.
  - `Path=/auth/google` scopes the cookie strictly to the OAuth endpoints so it is never sent on `/` or `/api/*`.
- **Payload** (UTF-8 JSON, base64url-encoded):
  ```json
  {
    "state": "<43-char base64url>",
    "code_verifier": "<64-char base64url>",
    "nonce": "<43-char base64url>",
    "exp": 1764000600
  }
  ```
  where `exp` is a Unix epoch timestamp in seconds (`now + 600`).
- **Signature**:
  Reuses `hmacSha256` and `timingSafeEqual` from `lib/auth.ts` with `SESSION_SECRET` and explicit domain separation:
  ```text
  cookie_value = encodedPayload + "." + BASE64URL(
    HMAC-SHA-256(key = SESSION_SECRET, message = "google-oauth:v1:" + encodedPayload)
  )
  ```
  This domain prefix (`"google-oauth:v1:"`) cryptographically separates Google OAuth cookies from `immigrant_session` signatures (raw session ID) and `login-code:v1:` PIN hashes.
- **Clearing**: On every callback outcome (both success and failure), the Worker clears `immigrant_google_oauth` via `Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/auth/google; Secure; HttpOnly; SameSite=Lax` so a callback state cookie cannot be replayed.

---

## 4. Token Exchange & ID Token Verification Checklist

### Authorization Code Exchange
- Endpoint: `POST https://oauth2.googleapis.com/token`
- Headers: `Content-Type: application/x-www-form-urlencoded`, `Accept: application/json`
- Body: `grant_type=authorization_code`, `code`, `client_id`, `client_secret`, `redirect_uri` (constructed from request URL origin, identical to `/auth/google/start`), `code_verifier` (from verified cookie).
- Options: `redirect: "manual"`, `signal: AbortSignal.timeout(10_000)` (consistent with `lib/mailer.ts`).
- Only `id_token` is extracted from the JSON response; any `access_token` or other fields are discarded and never stored or logged.

### ID Token Verification (`verifyGoogleIdToken`)
1. **Structure & Header**:
   - Reject tokens longer than `32_768` bytes or without 3 non-empty dot-separated base64url segments.
   - Decode UTF-8 JSON header; require `alg === "RS256"`, non-empty string `kid`, and `crit === undefined`.
2. **JWKS Fetch, Caching & Single Refresh**:
   - Endpoint: `GET https://www.googleapis.com/oauth2/v3/certs` with `redirect: "manual"` and `signal: AbortSignal.timeout(10_000)`.
   - Cached in module-level memory (respecting `Cache-Control: max-age` clamped to `<= 3600s`, defaulting to `300s` when absent), with in-flight promise deduplication.
   - Select RSA signing keys matching `key.kid === header.kid && key.kty === "RSA" && (key.alg === undefined || key.alg === "RS256") && (key.use === undefined || key.use === "sig")`.
   - If the cached JWKS has no match for `header.kid`, force-refresh the JWKS **once** and retry key lookup. Require exactly 1 matching key.
3. **Cryptographic Signature**:
   - Import public JWK via WebCrypto (`RSASSA-PKCS1-v1_5`, `SHA-256`) and verify the signature over `${encodedHeader}.${encodedPayload}`.
4. **Claims**:
   - `iss`: must be `"https://accounts.google.com"` or `"accounts.google.com"`.
   - `aud`: must strictly equal `GOOGLE_CLIENT_ID` (`payload.aud === clientId`).
   - `exp`: finite number and strictly in the future (`payload.exp > now`).
   - `iat`: finite positive number and not excessively in the future: `payload.iat <= now + 300` (**300 seconds / 5-minute clock-skew tolerance**).
   - `nbf` (if present): finite number and `payload.nbf <= now + 300`.
   - `nonce`: string matching `cookiePayload.nonce` via constant-time `timingSafeEqual`.
   - `email`: string that passes `normalizeEmail()` from `lib/branded-login.ts`.
   - `email_verified`: **strictly** boolean `true` or string `"true"`; all other values (`false`, `"false"`, `1`, `undefined`, etc.) are rejected.

### Testability & Mock Points
- Token exchange and JWKS retrieval use standard module-level `fetch(...)` calls (never captured at import time), matching the repository's existing test convention (`tests/branded-login.test.mjs` and `tests/helpers/access.mjs`) where tests stub `globalThis.fetch`.
- `lib/google-login.ts` also exports `resetGoogleJwksCache()` so tests can isolate JWKS caching and key-rotation cases cleanly, and `verifyGoogleIdToken(...)` for direct unit verification.

---

## 5. Minimal Data Scope, Eligibility, Session Issuance & Unified Failure Handling

- **Minimal data**: Scope is strictly `openid email`. Only `email` and `email_verified` are read from the verified ID token. No Google `access_token`, `refresh_token`, `id_token`, profile photo, or Google password is ever stored or requested.
- **Shared eligibility**: After normalizing `email` with `normalizeEmail` from `lib/branded-login.ts`, the callback calls the exported `isEmailEligible(email, env.BRANDED_LOGIN_ALLOWLIST)` from `lib/branded-login.ts` (checks `BRANDED_LOGIN_ALLOWLIST` or an existing `profiles` row owned by `email` — single source of truth, no duplicated logic).
- **Success**:
  1. Revoke any prior `immigrant_session` cookie on the incoming request (`sessionCookieFromRequest` + `revokeSession`).
  2. Call `issueSession(email)` (`lib/auth.ts`).
  3. Set `immigrant_session` (`Path=/; Secure; HttpOnly; SameSite=Lax; Expires=...`) and clear `immigrant_google_oauth` (`Max-Age=0`) using separate `Set-Cookie` headers (`headers.append`).
  4. Return `303 See Other` with `Location: /` and `Cache-Control: private, no-store`.
- **Unified Failure Handling (PRG Redirect)**:
  - **Chosen strategy**: `303 See Other` to `/auth/login?error=google` (with `Cache-Control: private, no-store` and `Set-Cookie` clearing `immigrant_google_oauth`).
  - Why PRG redirect instead of rendering HTML directly at `/auth/google/callback`:
    - Removes sensitive `?code=...&state=...` query parameters from the browser address bar and prevents page refresh from replaying a stale callback.
    - `handleBrandedLoginPage` accepts only the exact allowlisted literal `error=google` (never reflects arbitrary query text) and displays a single uniform error banner matching the PIN login error style:
      `"Unable to sign in with Google. Please try again or sign in with an email code."`
  - Every failure path (Google `error` param, missing params, bad/expired cookie, state mismatch, token exchange error, JWKS error, signature/claim failure, unverified email, ineligible email) produces the exact same HTTP response and error copy, leaking neither the failed step nor the invite allowlist.
  - **Logging hygiene**: Server-side `console.error` emits only fixed non-sensitive reason codes (e.g., `google_login_token_exchange_failed`, `google_login_ineligible`). Authorization `code`, `id_token`, `client_secret`, `state`, `nonce`, `code_verifier`, and email addresses are never logged.

---

## 6. Privacy Disclosure Draft

> **上线时并入 `/privacy`，本轮不改 privacy 页。**

Draft sentence (English):

> If you choose "Continue with Google", Google only shares your email address and whether it is verified—Immigrant OS never receives your Google password or access to your Google account.

---

## 7. Launch Checklist (Documentation Only — Do Not Execute Until Ready)

### Step A — Google Cloud Console: Create OAuth 2.0 Client ID (Web application)
1. Open [Google Cloud Console](https://console.cloud.google.com/) and select (or create) the Immigrant OS project.
2. Configure **Google Auth Platform → Branding / OAuth consent screen**:
   - **App name**: `Immigrant OS`
   - **User support email**: `neoloong@gmail.com` (or owner-confirmed support email)
   - **Privacy policy link**: `https://immigrant-os.neoloong.workers.dev/privacy`
   - **Application home page**: `https://immigrant-os.neoloong.workers.dev`
   - **Audience**: External (Testing mode during invite-only beta, or In production once ready; note `openid` and `email` are non-sensitive scopes).
   - **Scopes**: `openid`, `.../auth/userinfo.email` (`email`).
3. Create **Clients → Create client → Web application**:
   - **Name**: `Immigrant OS Web`
   - **Authorized redirect URI**:
     `https://immigrant-os.neoloong.workers.dev/auth/google/callback`
   - *(If a custom production domain is added later, add `https://<custom-domain>/auth/google/callback` as well.)*
4. Copy the generated **Client ID** and **Client Secret**.

### Step B — Cloudflare Worker Configuration
Ensure `AUTH_MODE="session"`, `SESSION_SECRET`, and `BRANDED_LOGIN_ENABLED="true"` are already active, then configure:
1. Store the client secret as a Wrangler secret (never commit to `wrangler.jsonc` or Git):
   ```bash
   npx wrangler secret put GOOGLE_CLIENT_SECRET
   ```
2. Set `GOOGLE_CLIENT_ID` (via Wrangler secret or `wrangler.jsonc` vars) and enable the feature flag:
   - `GOOGLE_CLIENT_ID=<client-id-from-step-A>`
   - `GOOGLE_LOGIN_ENABLED="true"`
3. Update `privacyPage()` in `lib/public-pages.ts` with the privacy disclosure sentence from Section 6 before turning `GOOGLE_LOGIN_ENABLED` on.
4. Deploy and smoke-test:
   - Verify `/auth/login` displays both the 6-digit email-PIN form and **Continue with Google**.
   - Verify invited Gmail account signs in and lands on `/`.
   - Verify non-invited account redirects back to `/auth/login?error=google` with the uniform error banner and no session cookie.
   - Verify cancelling on Google's consent screen redirects cleanly to `/auth/login?error=google`.
