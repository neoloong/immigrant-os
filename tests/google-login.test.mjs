import assert from "node:assert/strict";
import test from "node:test";
import { createHash, createHmac, generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { sqliteD1 } from "./helpers/sqlite-d1.mjs";

// vinext captures globalThis.fetch once at module-load time and later overwrites
// globalThis.fetch on the first App Router request. Installing a delegating
// wrapper before importing the built worker keeps fetch mocks active across all
// subtests, even after hitting App Router routes like /api/profile or /.
const realFetch = globalThis.fetch;
let fetchDelegate = realFetch;
globalThis.fetch = (input, options) => fetchDelegate(input, options);
const { default: worker } = await import("../dist/server/index.js");

// Lightweight in-process TypeScript loader scoped strictly to repo .ts files so
// unit tests can directly invoke handleGoogleStart, handleGoogleCallback,
// handleAccessAuth, and ownerFromSessionCookie without touching production code.
const repoRootUrl = new URL("../", import.meta.url).href;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      context.parentURL?.startsWith(repoRootUrl)
      && context.parentURL.endsWith(".ts")
      && (specifier.startsWith("./") || specifier.startsWith("../"))
      && !/\.[a-z0-9]+$/i.test(specifier)
    ) {
      for (const candidate of [`${specifier}.ts`, `${specifier}/index.ts`]) {
        const resolved = new URL(candidate, context.parentURL);
        if (existsSync(fileURLToPath(resolved))) {
          return { url: resolved.href, shortCircuit: true };
        }
      }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.startsWith(repoRootUrl) && url.endsWith(".ts")) {
      const source = readFileSync(fileURLToPath(url), "utf8");
      const { outputText } = ts.transpileModule(source, {
        compilerOptions: {
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2022,
        },
      });
      return {
        format: "module",
        source: outputText.replaceAll("import.meta.env", "(import.meta.env ?? {})"),
        shortCircuit: true,
      };
    }
    return nextLoad(url, context);
  },
});

const { handleGoogleStart, handleGoogleCallback, resetGoogleJwksCache } = await import("../lib/google-login.ts");
const { handleAccessAuth } = await import("../lib/access-auth.ts");
const { ownerFromSessionCookie } = await import("../lib/auth.ts");

const context = { waitUntil() {}, passThroughOnException() {} };
const SECRET = "google-login-test-secret-".repeat(4);
const TEST_CLIENT_ID = "test-client-id";
const TEST_CLIENT_SECRET = "test-client-secret";
const ORIGIN = "https://app.example.test";
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const UNIFORM_GOOGLE_ERROR =
  "Unable to sign in with Google. Please try again or sign in with an email code.";

async function migratedDb() {
  const DB = sqliteD1();
  const migrations = (await readdir(new URL("../drizzle/", import.meta.url)))
    .filter((file) => file.endsWith(".sql"))
    .sort();
  for (const file of migrations) {
    DB.exec(await readFile(new URL(`../drizzle/${file}`, import.meta.url), "utf8"));
  }
  return DB;
}

function createGoogleMock(t) {
  const primary = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const rogue = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const alt = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const primaryKid = "google-test-kid-1";
  const primaryJwk = {
    ...primary.publicKey.export({ format: "jwk" }),
    kid: primaryKid,
    alg: "RS256",
    use: "sig",
  };
  const altJwk = {
    ...alt.publicKey.export({ format: "jwk" }),
    kid: primaryKid,
    alg: "RS256",
    use: "sig",
  };

  let nextIdToken = null;
  let tokenResponseOverride = null;
  let jwksKeys = [primaryJwk];
  let jwksStatus = 200;
  const calls = [];

  const signIdToken = (claims = {}, header = {}, signingKey = primary.privateKey) => {
    const now = Math.floor(Date.now() / 1000);
    const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
    const fullHeader = { alg: "RS256", kid: primaryKid, typ: "JWT", ...header };
    const fullClaims = {
      iss: "https://accounts.google.com",
      aud: TEST_CLIENT_ID,
      sub: "google-test-sub-123",
      iat: now - 10,
      exp: now + 3600,
      email: "invited@example.test",
      email_verified: true,
      ...claims,
    };
    const unsigned = `${encode(fullHeader)}.${encode(fullClaims)}`;
    const signature = sign("RSA-SHA256", Buffer.from(unsigned), signingKey).toString("base64url");
    return `${unsigned}.${signature}`;
  };

  const previousFetch = fetchDelegate;
  fetchDelegate = async (input, options = {}) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = (options.method ?? (typeof input === "object" && "method" in input ? input.method : "GET")).toUpperCase();
    const record = {
      url,
      method,
      redirect: options.redirect,
      headers: Object.fromEntries(new Headers(options.headers).entries()),
      body: typeof options.body === "string" ? options.body : null,
    };
    calls.push(record);

    if (url === GOOGLE_TOKEN_URL) {
      assert.equal(method, "POST");
      assert.equal(options.redirect, "manual");
      if (tokenResponseOverride) {
        return tokenResponseOverride(record);
      }
      assert.ok(nextIdToken, "test must configure nextIdToken before hitting Google token endpoint");
      return Response.json({
        id_token: nextIdToken,
        access_token: "test-discarded-access-token",
        token_type: "Bearer",
        expires_in: 3600,
      });
    }

    if (url === GOOGLE_JWKS_URL) {
      assert.equal(method, "GET");
      assert.equal(options.redirect, "manual");
      if (jwksStatus !== 200) {
        return new Response("JWKS unavailable", { status: jwksStatus });
      }
      // Cache-Control: no-store ensures each test case observes fresh mock JWKS.
      return Response.json(
        { keys: jwksKeys },
        { headers: { "cache-control": "no-store" } },
      );
    }

    // Fail closed: tests must never make real network calls to Google or external hosts.
    throw new Error(`Unexpected outbound fetch during Google login test: ${method} ${url}`);
  };
  t.after(() => {
    fetchDelegate = previousFetch;
    resetGoogleJwksCache();
  });

  return {
    calls,
    primary,
    rogue,
    primaryKid,
    primaryJwk,
    altJwk,
    signIdToken,
    resetCalls() {
      calls.length = 0;
    },
    setNextIdToken(token) {
      nextIdToken = token;
      tokenResponseOverride = null;
    },
    setTokenResponseOverride(fn) {
      tokenResponseOverride = fn;
    },
    setJwks(keys, status = 200) {
      jwksKeys = keys;
      jwksStatus = status;
      resetGoogleJwksCache();
    },
    googleCalls() {
      return calls.filter((c) => /google\.com|googleapis\.com/i.test(new URL(c.url).hostname));
    },
    tokenCalls() {
      return calls.filter((c) => c.url === GOOGLE_TOKEN_URL);
    },
    jwksCalls() {
      return calls.filter((c) => c.url === GOOGLE_JWKS_URL);
    },
  };
}

function getSetCookies(response) {
  return response.headers.getSetCookie();
}

function findSetCookie(response, name) {
  return getSetCookies(response).find((c) => c.startsWith(`${name}=`)) ?? null;
}

function cookiePair(setCookieHeader) {
  assert.ok(setCookieHeader, "expected Set-Cookie header");
  return setCookieHeader.split(";")[0];
}

test("Google OAuth sign-in flow, token verification, eligibility, and defense-in-depth", async (t) => {
  const google = createGoogleMock(t);
  const logCalls = [];
  for (const method of ["log", "info", "warn", "error"]) {
    t.mock.method(console, method, (...args) => {
      logCalls.push(args.map(String).join(" "));
    });
  }

  const DB = await migratedDb();
  await DB.prepare(
    "INSERT INTO profiles (id, owner, is_primary, display_name, lifecycle_stage, status_subtype) VALUES (?, ?, 1, ?, 'H1B', 'H1B')",
  ).bind(randomUUID(), "existing@example.test", "Existing Profile Owner").run();

  const baseEnv = {
    AUTH_MODE: "session",
    SESSION_SECRET: SECRET,
    BRANDED_LOGIN_ENABLED: "true",
    BRANDED_LOGIN_ALLOWLIST: "invited@example.test",
    GOOGLE_LOGIN_ENABLED: "true",
    GOOGLE_CLIENT_ID: TEST_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: TEST_CLIENT_SECRET,
    DB,
    BUCKET: {},
    ASSETS: { fetch: () => new Response("Not found", { status: 404 }) },
  };

  const call = (path, { method = "GET", headers = {}, body, env = baseEnv, origin = ORIGIN } = {}) =>
    worker.fetch(new Request(`${origin}${path}`, { method, headers, body }), env, context);

  async function startFlow({ env = baseEnv, origin = ORIGIN } = {}) {
    const response = await call("/auth/google/start", { env, origin });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    const location = response.headers.get("location");
    assert.ok(location, "start must return a Location header");
    const authUrl = new URL(location);
    const oauthSetCookie = findSetCookie(response, "immigrant_google_oauth");
    assert.ok(oauthSetCookie, "start must set immigrant_google_oauth cookie");
    return {
      response,
      authUrl,
      state: authUrl.searchParams.get("state"),
      nonce: authUrl.searchParams.get("nonce"),
      codeChallenge: authUrl.searchParams.get("code_challenge"),
      redirectUri: authUrl.searchParams.get("redirect_uri"),
      oauthSetCookie,
      oauthCookie: cookiePair(oauthSetCookie),
    };
  }

  function assertCallbackRejected(response, expectedReason, logsBefore) {
    assert.equal(response.status, 303);
    assert.equal(response.headers.get("location"), "/auth/login?error=google");
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal(
      findSetCookie(response, "immigrant_session"),
      null,
      "failed callback must not issue immigrant_session cookie",
    );
    const clearedOAuth = findSetCookie(response, "immigrant_google_oauth");
    assert.ok(clearedOAuth, "failed callback must clear immigrant_google_oauth cookie");
    assert.match(clearedOAuth, /Max-Age=0/);
    assert.match(clearedOAuth, /HttpOnly/);
    assert.match(clearedOAuth, /Path=\/auth\/google/);

    const newLogs = logCalls.slice(logsBefore);
    assert.ok(
      newLogs.includes(`google_login_${expectedReason}`),
      `expected log google_login_${expectedReason}, got ${JSON.stringify(newLogs)}`,
    );
  }

  // Case 1: Feature flag OFF
  await t.test("1. flag OFF: Google routes are not intercepted, zero Google fetches, login page hides Google button", async () => {
    const disabledEnvs = [
      { label: "GOOGLE_LOGIN_ENABLED=false", env: { ...baseEnv, GOOGLE_LOGIN_ENABLED: "false" } },
      { label: "GOOGLE_LOGIN_ENABLED omitted", env: { ...baseEnv, GOOGLE_LOGIN_ENABLED: undefined } },
      { label: "GOOGLE_CLIENT_ID missing", env: { ...baseEnv, GOOGLE_CLIENT_ID: "" } },
      { label: "GOOGLE_CLIENT_SECRET missing", env: { ...baseEnv, GOOGLE_CLIENT_SECRET: undefined } },
    ];

    for (const { label, env } of disabledEnvs) {
      google.resetCalls();

      const startResp = await call("/auth/google/start", { env });
      assert.equal(startResp.status, 401, `${label}: /auth/google/start must fall through to 401`);
      assert.equal(startResp.headers.get("location"), null, `${label}: must not redirect to Google`);
      assert.equal(findSetCookie(startResp, "immigrant_google_oauth"), null);

      const cbResp = await call("/auth/google/callback?code=fake-code&state=fake-state", { env });
      assert.equal(cbResp.status, 401, `${label}: /auth/google/callback must fall through to 401`);
      assert.equal(cbResp.headers.get("location"), null);
      assert.equal(findSetCookie(cbResp, "immigrant_session"), null);

      assert.equal(google.googleCalls().length, 0, `${label}: zero outbound fetches to Google`);

      const loginResp = await call("/auth/login", { env });
      assert.equal(loginResp.status, 200);
      const html = await loginResp.text();
      assert.doesNotMatch(html, /Continue with Google/, `${label}: login page must not show Google button`);
      assert.doesNotMatch(html, /\/auth\/google\/start/, `${label}: login page must not link to Google start`);

      const loginErrResp = await call("/auth/login?error=google", { env });
      assert.equal(loginErrResp.status, 200);
      const errHtml = await loginErrResp.text();
      assert.doesNotMatch(errHtml, /Continue with Google/);
      assert.ok(!errHtml.includes(UNIFORM_GOOGLE_ERROR), `${label}: error=google banner must stay hidden when flag is OFF`);
    }
  });

  // Case 2: Start success path
  await t.test("2. start success: 303 redirect to Google OAuth with PKCE/state/nonce and HttpOnly oauth cookie", async () => {
    google.resetCalls();

    const loginResp = await call("/auth/login");
    assert.equal(loginResp.status, 200);
    const loginHtml = await loginResp.text();
    assert.match(loginHtml, /Continue with Google/);
    assert.match(loginHtml, /href="\/auth\/google\/start"/);

    const started = await startFlow();
    assert.equal(`${started.authUrl.origin}${started.authUrl.pathname}`, GOOGLE_AUTH_URL);
    assert.equal(started.authUrl.searchParams.get("client_id"), TEST_CLIENT_ID);
    assert.equal(started.redirectUri, `${ORIGIN}/auth/google/callback`);
    assert.equal(started.authUrl.searchParams.get("response_type"), "code");

    const scopeTokens = (started.authUrl.searchParams.get("scope") ?? "").split(/\s+/).filter(Boolean);
    assert.ok(scopeTokens.includes("openid"), "scope must include openid");
    assert.ok(scopeTokens.includes("email"), "scope must include email");
    assert.deepEqual(scopeTokens, ["openid", "email"]);

    assert.ok(started.state && started.state.length >= 32, "state must be non-empty high-entropy");
    assert.ok(started.nonce && started.nonce.length >= 16, "nonce must be non-empty");
    assert.ok(started.codeChallenge && started.codeChallenge.length >= 43, "code_challenge must be non-empty");
    assert.equal(started.authUrl.searchParams.get("code_challenge_method"), "S256");

    for (const attr of ["immigrant_google_oauth=", "Path=/auth/google", "Secure", "HttpOnly", "SameSite=Lax", "Max-Age=600", "Expires="]) {
      assert.ok(started.oauthSetCookie.includes(attr), `oauth set-cookie missing ${attr}`);
    }
    assert.equal(findSetCookie(started.response, "immigrant_session"), null);
    assert.equal(google.googleCalls().length, 0, "start must not fetch Google");

    // Dynamic redirect_uri derives from incoming request origin.
    const altOrigin = "https://alt.example.test";
    const altStarted = await startFlow({ origin: altOrigin });
    assert.equal(altStarted.redirectUri, `${altOrigin}/auth/google/callback`);
    assert.notEqual(altStarted.state, started.state, "each start must generate a fresh state");
    assert.notEqual(altStarted.nonce, started.nonce, "each start must generate a fresh nonce");

    // Non-GET to start/callback returns 405.
    const postStart = await call("/auth/google/start", { method: "POST" });
    assert.equal(postStart.status, 405);
    assert.equal(postStart.headers.get("allow"), "GET");
  });

  // Case 3: Callback state mismatch
  await t.test("3. callback state mismatch rejects without calling token endpoint or issuing session", async () => {
    google.resetCalls();
    const started = await startFlow();
    const logsBefore = logCalls.length;
    const sessionsBefore = (await DB.prepare("SELECT COUNT(*) AS count FROM sessions").first()).count;

    const resp = await call(
      `/auth/google/callback?code=auth-code-123&state=${encodeURIComponent(`${started.state}-tampered`)}`,
      { headers: { cookie: started.oauthCookie } },
    );

    assertCallbackRejected(resp, "state_mismatch", logsBefore);
    assert.equal(google.tokenCalls().length, 0, "must not call Google token endpoint on state mismatch");
    assert.equal(google.jwksCalls().length, 0, "must not call Google JWKS endpoint on state mismatch");
    assert.equal((await DB.prepare("SELECT COUNT(*) AS count FROM sessions").first()).count, sessionsBefore);

    // Also verify missing cookie and tampered cookie fail before touching token endpoint.
    const logsBeforeMissing = logCalls.length;
    const missingCookieResp = await call(`/auth/google/callback?code=auth-code-123&state=${encodeURIComponent(started.state)}`);
    assertCallbackRejected(missingCookieResp, "missing_cookie", logsBeforeMissing);
    assert.equal(google.tokenCalls().length, 0);

    const logsBeforeBadCookie = logCalls.length;
    const badCookieResp = await call(
      `/auth/google/callback?code=auth-code-123&state=${encodeURIComponent(started.state)}`,
      { headers: { cookie: `${started.oauthCookie}tampered` } },
    );
    assertCallbackRejected(badCookieResp, "invalid_cookie", logsBeforeBadCookie);
    assert.equal(google.tokenCalls().length, 0);
  });

  // Case 4: Invalid id_token signature (wrong RSA signing key & mismatched JWKS public key)
  await t.test("4. callback rejects id_token with invalid RSA signature or mismatched JWKS public key", async () => {
    // 4a: Signed with rogue RSA private key while JWKS serves primary public key for same kid.
    google.resetCalls();
    google.setJwks([google.primaryJwk]);
    const startedA = await startFlow();
    google.setNextIdToken(
      google.signIdToken({ nonce: startedA.nonce, email: "invited@example.test" }, {}, google.rogue.privateKey),
    );
    const logsBeforeA = logCalls.length;
    const sessionsBefore = (await DB.prepare("SELECT COUNT(*) AS count FROM sessions").first()).count;

    const respA = await call(
      `/auth/google/callback?code=code-bad-sig&state=${encodeURIComponent(startedA.state)}`,
      { headers: { cookie: startedA.oauthCookie } },
    );
    assert.equal(google.tokenCalls().length, 1, "token endpoint must have been called");
    assert.equal(google.jwksCalls().length, 1, "JWKS endpoint must have been called");
    assertCallbackRejected(respA, "bad_signature", logsBeforeA);
    assert.equal((await DB.prepare("SELECT COUNT(*) AS count FROM sessions").first()).count, sessionsBefore);

    // 4b: Signed with primary key, but JWKS returns a different RSA public key under the same kid.
    google.resetCalls();
    google.setJwks([google.altJwk]);
    const startedB = await startFlow();
    google.setNextIdToken(
      google.signIdToken({ nonce: startedB.nonce, email: "invited@example.test" }),
    );
    const logsBeforeB = logCalls.length;

    const respB = await call(
      `/auth/google/callback?code=code-wrong-jwk&state=${encodeURIComponent(startedB.state)}`,
      { headers: { cookie: startedB.oauthCookie } },
    );
    assert.equal(google.tokenCalls().length, 1);
    assert.equal(google.jwksCalls().length, 1);
    assertCallbackRejected(respB, "bad_signature", logsBeforeB);
    assert.equal((await DB.prepare("SELECT COUNT(*) AS count FROM sessions").first()).count, sessionsBefore);

    // Restore valid JWKS for subsequent subtests.
    google.setJwks([google.primaryJwk]);
  });

  // Case 5: email_verified=false
  await t.test("5. callback rejects id_token when email_verified=false even if all other checks pass", async () => {
    for (const unverifiedValue of [false, "false"]) {
      google.resetCalls();
      const started = await startFlow();
      google.setNextIdToken(
        google.signIdToken({
          nonce: started.nonce,
          email: "invited@example.test",
          email_verified: unverifiedValue,
        }),
      );
      const logsBefore = logCalls.length;
      const sessionsBefore = (await DB.prepare("SELECT COUNT(*) AS count FROM sessions").first()).count;

      const resp = await call(
        `/auth/google/callback?code=code-unverified&state=${encodeURIComponent(started.state)}`,
        { headers: { cookie: started.oauthCookie } },
      );

      assert.equal(google.tokenCalls().length, 1, "token exchange must succeed before email_verified check");
      assert.equal(google.jwksCalls().length, 1, "JWKS signature verification must pass before email_verified check");
      assertCallbackRejected(resp, "unverified_email", logsBefore);
      assert.equal((await DB.prepare("SELECT COUNT(*) AS count FROM sessions").first()).count, sessionsBefore);
    }
  });

  // Case 6: aud, iss, exp, nonce claim mismatches (each individually asserted)
  await t.test("6. callback rejects mismatched aud, iss, expired exp, and mismatched nonce", async (st) => {
    const claimCases = [
      {
        name: "6a. aud mismatch",
        claims: (started) => ({ nonce: started.nonce, aud: "wrong-client-id" }),
      },
      {
        name: "6b. iss mismatch",
        claims: (started) => ({ nonce: started.nonce, iss: "https://evil.example.test" }),
      },
      {
        name: "6c. exp expired",
        claims: (started) => ({ nonce: started.nonce, exp: Math.floor(Date.now() / 1000) - 60 }),
      },
      {
        name: "6d. nonce mismatch",
        claims: () => ({ nonce: "nonce-that-does-not-match-start-cookie" }),
      },
    ];

    for (const tc of claimCases) {
      await st.test(tc.name, async () => {
        google.resetCalls();
        const started = await startFlow();
        google.setNextIdToken(
          google.signIdToken({
            email: "invited@example.test",
            email_verified: true,
            ...tc.claims(started),
          }),
        );
        const logsBefore = logCalls.length;
        const sessionsBefore = (await DB.prepare("SELECT COUNT(*) AS count FROM sessions").first()).count;

        const resp = await call(
          `/auth/google/callback?code=code-bad-claim&state=${encodeURIComponent(started.state)}`,
          { headers: { cookie: started.oauthCookie } },
        );

        assert.equal(google.tokenCalls().length, 1, `${tc.name}: token endpoint must be reached`);
        assert.equal(google.jwksCalls().length, 1, `${tc.name}: JWKS signature check must run before claim rejection`);
        assertCallbackRejected(resp, "bad_claims", logsBefore);
        assert.equal((await DB.prepare("SELECT COUNT(*) AS count FROM sessions").first()).count, sessionsBefore);
      });
    }
  });

  // Case 7: Valid token & claims, but email not in allowlist and not in profiles
  await t.test("7. callback rejects verified email that is neither in allowlist nor in profiles", async () => {
    google.resetCalls();
    const started = await startFlow();
    google.setNextIdToken(
      google.signIdToken({
        nonce: started.nonce,
        email: "stranger@example.test",
        email_verified: true,
      }),
    );
    const logsBefore = logCalls.length;
    const sessionsBefore = (await DB.prepare("SELECT COUNT(*) AS count FROM sessions").first()).count;

    const resp = await call(
      `/auth/google/callback?code=code-ineligible&state=${encodeURIComponent(started.state)}`,
      { headers: { cookie: started.oauthCookie } },
    );

    assert.equal(google.tokenCalls().length, 1);
    assert.equal(google.jwksCalls().length, 1);
    assertCallbackRejected(resp, "ineligible", logsBefore);
    assert.equal((await DB.prepare("SELECT COUNT(*) AS count FROM sessions").first()).count, sessionsBefore);

    // Following the failure redirect displays the single uniform error banner.
    const errPage = await call(resp.headers.get("location"));
    assert.equal(errPage.status, 200);
    const errHtml = await errPage.text();
    assert.ok(errHtml.includes(UNIFORM_GOOGLE_ERROR));
    assert.doesNotMatch(errHtml, /stranger@example\.test|ineligible|allowlist/i);
  });

  // Case 8: Success paths (allowlist email + existing profiles owner) + ownerFromSessionCookie verification
  await t.test("8. callback success issues immigrant_session recognized by app and ownerFromSessionCookie", async (st) => {
    let allowlistSessionCookie;

    await st.test("8a. allowlisted email succeeds, verifies PKCE code_verifier, and resolves via ownerFromSessionCookie", async () => {
      google.resetCalls();
      const started = await startFlow();
      google.setNextIdToken(
        google.signIdToken({
          nonce: started.nonce,
          email: " Invited@Example.Test ",
          email_verified: true,
        }),
      );

      const resp = await call(
        `/auth/google/callback?code=good-auth-code&state=${encodeURIComponent(started.state)}`,
        { headers: { cookie: started.oauthCookie } },
      );

      // Verify token exchange payload (including PKCE verifier matching start's S256 challenge).
      assert.equal(google.tokenCalls().length, 1);
      assert.equal(google.jwksCalls().length, 1);
      const tokenParams = new URLSearchParams(google.tokenCalls()[0].body);
      assert.equal(tokenParams.get("grant_type"), "authorization_code");
      assert.equal(tokenParams.get("code"), "good-auth-code");
      assert.equal(tokenParams.get("client_id"), TEST_CLIENT_ID);
      assert.equal(tokenParams.get("client_secret"), TEST_CLIENT_SECRET);
      assert.equal(tokenParams.get("redirect_uri"), `${ORIGIN}/auth/google/callback`);
      const verifier = tokenParams.get("code_verifier");
      assert.ok(verifier && verifier.length >= 43, "token request must include PKCE code_verifier");
      const computedChallenge = createHash("sha256").update(verifier).digest("base64url");
      assert.equal(computedChallenge, started.codeChallenge, "code_verifier must match start code_challenge");

      // Verify 303 redirect and Set-Cookie headers.
      assert.equal(resp.status, 303);
      assert.equal(resp.headers.get("location"), "/");
      assert.equal(resp.headers.get("cache-control"), "private, no-store");

      const sessionSetCookie = findSetCookie(resp, "immigrant_session");
      assert.ok(sessionSetCookie, "success response must set immigrant_session cookie");
      for (const attr of ["immigrant_session=", "Path=/", "Secure", "HttpOnly", "SameSite=Lax", "Expires="]) {
        assert.ok(sessionSetCookie.includes(attr), `immigrant_session missing ${attr}`);
      }
      const clearedOAuth = findSetCookie(resp, "immigrant_google_oauth");
      assert.ok(clearedOAuth && clearedOAuth.includes("Max-Age=0"), "success response must clear oauth cookie");

      allowlistSessionCookie = cookiePair(sessionSetCookie);

      // Verify signed session row in D1.
      const [sessionId, sessionSig] = allowlistSessionCookie.slice("immigrant_session=".length).split(".");
      assert.equal(sessionSig, createHmac("sha256", SECRET).update(sessionId).digest("base64url"));
      const sessionRow = await DB.prepare("SELECT owner, expires_at FROM sessions WHERE id = ?").bind(sessionId).first();
      assert.equal(sessionRow.owner, "invited@example.test");
      assert.ok(new Date(sessionRow.expires_at).getTime() > Date.now());

      // Verify direct ownerFromSessionCookie recognizes the cookie as invited@example.test.
      globalThis.__IMMIGRANT_SITE_BINDINGS__ = { DB, BUCKET: {} };
      globalThis.__IMMIGRANT_AUTH_CONFIG__ = {
        authMode: "session",
        sessionSecret: SECRET,
        brandedLoginEnabled: true,
        googleLoginEnabled: true,
      };
      const resolvedOwner = await ownerFromSessionCookie(
        new Request(`${ORIGIN}/api/profile`, { headers: { cookie: allowlistSessionCookie } }),
      );
      assert.equal(resolvedOwner, "invited@example.test");

      // Verify end-to-end authenticated access via worker (same pattern as branded-login tests).
      const profileResp = await call("/api/profile", { headers: { cookie: allowlistSessionCookie } });
      assert.equal(profileResp.status, 200);
      assert.equal((await profileResp.json()).profile, null);

      const saveResp = await call("/api/profile", {
        method: "PUT",
        headers: { cookie: allowlistSessionCookie, "content-type": "application/json" },
        body: JSON.stringify({ displayName: "Google Invited User", lifecycleStage: "H1B", statusSubtype: "H1B", i94ExpirationDate: "2027-06-30" }),
      });
      assert.equal(saveResp.status, 200);

      const loadedResp = await call("/api/profile", { headers: { cookie: allowlistSessionCookie } });
      assert.equal(loadedResp.status, 200);
      assert.equal((await loadedResp.json()).profile.displayName, "Google Invited User");
    });

    await st.test("8b. existing profile owner (not in allowlist) succeeds and revokes prior session", async () => {
      google.resetCalls();
      const started = await startFlow();
      google.setNextIdToken(
        google.signIdToken({
          iss: "accounts.google.com",
          nonce: started.nonce,
          email: "existing@example.test",
          email_verified: "true",
        }),
      );

      const resp = await call(
        `/auth/google/callback?code=existing-user-code&state=${encodeURIComponent(started.state)}`,
        { headers: { cookie: `${started.oauthCookie}; ${allowlistSessionCookie}` } },
      );

      assert.equal(resp.status, 303);
      assert.equal(resp.headers.get("location"), "/");
      const newSessionCookie = cookiePair(findSetCookie(resp, "immigrant_session"));

      globalThis.__IMMIGRANT_SITE_BINDINGS__ = { DB, BUCKET: {} };
      globalThis.__IMMIGRANT_AUTH_CONFIG__ = {
        authMode: "session",
        sessionSecret: SECRET,
        brandedLoginEnabled: true,
        googleLoginEnabled: true,
      };
      const resolvedOwner = await ownerFromSessionCookie(
        new Request(`${ORIGIN}/`, { headers: { cookie: newSessionCookie } }),
      );
      assert.equal(resolvedOwner, "existing@example.test");

      // New cookie sees existing@example.test's seeded profile; revoked previous cookie is rejected.
      const loaded = await call("/api/profile", { headers: { cookie: newSessionCookie } });
      assert.equal(loaded.status, 200);
      assert.equal((await loaded.json()).profile.displayName, "Existing Profile Owner");

      const revoked = await call("/api/profile", { headers: { cookie: allowlistSessionCookie } });
      assert.equal(revoked.status, 401);
    });
  });

  // Case 9: Direct handler defense-in-depth when env lacks GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
  await t.test("9. handlers return 404 without fetching Google when GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is missing", async () => {
    const incompleteEnvs = [
      { label: "missing client id", env: { GOOGLE_CLIENT_SECRET: TEST_CLIENT_SECRET } },
      { label: "blank client id", env: { GOOGLE_CLIENT_ID: "   ", GOOGLE_CLIENT_SECRET: TEST_CLIENT_SECRET } },
      { label: "missing client secret", env: { GOOGLE_CLIENT_ID: TEST_CLIENT_ID } },
      { label: "blank client secret", env: { GOOGLE_CLIENT_ID: TEST_CLIENT_ID, GOOGLE_CLIENT_SECRET: "  " } },
      { label: "both missing", env: {} },
    ];

    globalThis.__IMMIGRANT_SITE_BINDINGS__ = { DB, BUCKET: {} };
    globalThis.__IMMIGRANT_AUTH_CONFIG__ = {
      authMode: "session",
      sessionSecret: SECRET,
      brandedLoginEnabled: true,
      googleLoginEnabled: true,
    };

    for (const { label, env } of incompleteEnvs) {
      google.resetCalls();

      const startReq = new Request(`${ORIGIN}/auth/google/start`, { method: "GET" });
      const startResp = await handleGoogleStart(startReq, env, SECRET);
      assert.equal(startResp.status, 404, `handleGoogleStart (${label}) must return 404`);
      assert.equal(startResp.headers.get("cache-control"), "private, no-store");
      assert.equal(findSetCookie(startResp, "immigrant_google_oauth"), null);

      const cbReq = new Request(`${ORIGIN}/auth/google/callback?code=abc&state=xyz`, { method: "GET" });
      const cbResp = await handleGoogleCallback(cbReq, env, SECRET);
      assert.equal(cbResp.status, 404, `handleGoogleCallback (${label}) must return 404`);
      assert.equal(cbResp.headers.get("cache-control"), "private, no-store");
      assert.equal(findSetCookie(cbResp, "immigrant_session"), null);

      // Even if handleAccessAuth is invoked directly with googleLoginEnabled=true, it reaches the 404 guard.
      const routedStart = await handleAccessAuth(new Request(`${ORIGIN}/auth/google/start`), env);
      assert.equal(routedStart.status, 404, `handleAccessAuth start (${label}) must return 404`);
      const routedCb = await handleAccessAuth(new Request(`${ORIGIN}/auth/google/callback?code=abc&state=xyz`), env);
      assert.equal(routedCb.status, 404, `handleAccessAuth callback (${label}) must return 404`);

      assert.equal(google.googleCalls().length, 0, `${label}: must not fetch Google`);
    }
  });

  // Case 10: Google callback with error=access_denied
  await t.test("10. callback with error=access_denied returns uniform failure without calling token endpoint", async () => {
    google.resetCalls();
    const started = await startFlow();
    const logsBefore = logCalls.length;
    const sessionsBefore = (await DB.prepare("SELECT COUNT(*) AS count FROM sessions").first()).count;

    const resp = await call(
      `/auth/google/callback?error=access_denied&state=${encodeURIComponent(started.state)}`,
      { headers: { cookie: started.oauthCookie } },
    );

    assertCallbackRejected(resp, "provider_error", logsBefore);
    assert.equal(google.tokenCalls().length, 0, "error=access_denied must not call token endpoint");
    assert.equal(google.jwksCalls().length, 0, "error=access_denied must not call JWKS endpoint");
    assert.equal((await DB.prepare("SELECT COUNT(*) AS count FROM sessions").first()).count, sessionsBefore);

    // Following the failure redirect renders the uniform error without leaking provider error text.
    const errPage = await call(resp.headers.get("location"));
    assert.equal(errPage.status, 200);
    const errHtml = await errPage.text();
    assert.ok(errHtml.includes(UNIFORM_GOOGLE_ERROR));
    assert.doesNotMatch(errHtml, /access_denied/i);
  });

  // Security hygiene check: sensitive values must never appear in console logs.
  for (const line of logCalls) {
    assert.ok(!line.includes(TEST_CLIENT_SECRET), "client_secret must never be logged");
    assert.ok(!line.includes(SECRET), "session secret must never be logged");
    assert.ok(!line.includes("good-auth-code"), "authorization code must never be logged");
    assert.ok(!line.includes("invited@example.test"), "email must never be logged");
    assert.ok(!line.includes("stranger@example.test"), "ineligible email must never be logged");
  }
});
