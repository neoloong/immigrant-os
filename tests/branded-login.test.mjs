import assert from "node:assert/strict";
import test from "node:test";
import { createHmac, randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { sqliteD1 } from "./helpers/sqlite-d1.mjs";
import { accessFixture } from "./helpers/access.mjs";

// vinext captures globalThis.fetch once at module-load time and later overwrites
// globalThis.fetch on the first App Router request. Installing a delegating
// wrapper before importing the built worker keeps fetch mocks active across all
// subtests, even after hitting App Router routes like /api/profile or /.
const realFetch = globalThis.fetch;
let fetchDelegate = realFetch;
globalThis.fetch = (input, options) => fetchDelegate(input, options);
const { default: worker } = await import("../dist/server/index.js");

const context = { waitUntil() {}, passThroughOnException() {} };
const secret = "branded-login-secret-".repeat(4);

async function migratedDb() {
  const DB = sqliteD1();
  const migrations = (await readdir(new URL("../drizzle/", import.meta.url)))
    .filter((file) => file.endsWith(".sql"))
    .sort();
  assert.ok(migrations.includes("0005_login_codes.sql"), "0005_login_codes.sql migration must exist");
  for (const file of migrations) {
    DB.exec(await readFile(new URL(`../drizzle/${file}`, import.meta.url), "utf8"));
  }
  return DB;
}

function mockResend(t) {
  const sent = [];
  const previousFetch = fetchDelegate;
  fetchDelegate = async (input, options) => {
    if (String(input) === "https://api.resend.com/emails") {
      assert.equal(options.method, "POST");
      const headers = new Headers(options.headers);
      assert.equal(headers.get("authorization"), "Bearer re_test_key");
      const body = JSON.parse(options.body);
      const match = /\b(\d{6})\b/.exec(body.text);
      assert.ok(match, "Resend email text must include a 6-digit code");
      sent.push({ to: body.to[0], from: body.from, subject: body.subject, text: body.text, html: body.html, code: match[1] });
      return Response.json({ id: randomUUID() }, { status: 200 });
    }
    return previousFetch(input, options);
  };
  t.after(() => {
    fetchDelegate = previousFetch;
  });
  return sent;
}

test("branded email-PIN login flow, security invariants, and flag gating", async (t) => {
  const access = accessFixture(t);
  const sent = mockResend(t);
  const logCalls = [];
  for (const method of ["log", "info", "warn", "error"]) {
    t.mock.method(console, method, (...args) => {
      logCalls.push(args.map(String).join(" "));
    });
  }

  const DB = await migratedDb();
  const baseEnv = {
    AUTH_MODE: "session",
    SESSION_SECRET: secret,
    BRANDED_LOGIN_ENABLED: "true",
    BRANDED_LOGIN_ALLOWLIST: "invited@example.test, second-invite@example.test",
    RESEND_API_KEY: "re_test_key",
    DB,
    BUCKET: {},
    ASSETS: { fetch: () => new Response("Not found", { status: 404 }) },
  };

  // Seed one pre-existing user who owns a profile row (not on the allowlist).
  await DB.prepare(
    "INSERT INTO profiles (id, owner, is_primary, display_name, lifecycle_stage, status_subtype) VALUES (?, ?, 1, ?, 'H1B', 'H1B')",
  ).bind(randomUUID(), "existing@example.test", "Existing Owner").run();

  const call = (path, { method = "GET", headers = {}, body, env = baseEnv } = {}) =>
    worker.fetch(new Request(`https://app.example.test${path}`, { method, headers, body }), env, context);

  const postJson = (path, payload, { ip = "198.51.100.1", headers = {}, env = baseEnv } = {}) =>
    call(path, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://app.example.test",
        "cf-connecting-ip": ip,
        ...headers,
      },
      body: JSON.stringify(payload),
      env,
    });

  const postForm = (path, fields, { ip = "198.51.100.2", headers = {}, env = baseEnv } = {}) =>
    call(path, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        origin: "https://app.example.test",
        "cf-connecting-ip": ip,
        ...headers,
      },
      body: new URLSearchParams(fields).toString(),
      env,
    });

  await t.test("flag OFF preserves existing /auth/login redirect and Access-only gating", async () => {
    const flagOffEnv = {
      ...baseEnv,
      ...access.env,
      BRANDED_LOGIN_ENABLED: undefined,
    };
    const login = await call("/auth/login", { env: flagOffEnv });
    assert.equal(login.status, 303);
    assert.equal(login.headers.get("location"), "/auth/access");

    const codeReq = await postJson("/auth/login/code", { email: "invited@example.test" }, { env: flagOffEnv, ip: "198.51.100.90" });
    assert.equal(codeReq.status, 401);

    const verifyReq = await postJson("/auth/login/verify", { email: "invited@example.test", code: "123456" }, { env: flagOffEnv, ip: "198.51.100.90" });
    assert.equal(verifyReq.status, 401);

    // Even a valid immigrant_session cookie cannot bypass Access when flag is OFF.
    const sid = randomUUID();
    const sig = createHmac("sha256", secret).update(sid).digest("base64url");
    await DB.prepare("INSERT INTO sessions (id, owner, expires_at) VALUES (?, ?, ?)")
      .bind(sid, "existing@example.test", new Date(Date.now() + 3600_000).toISOString()).run();
    const apiResp = await call("/api/profile", { headers: { cookie: `immigrant_session=${sid}.${sig}` }, env: flagOffEnv });
    assert.equal(apiResp.status, 401);
  });

  await t.test("flag ON serves branded two-step login page with approved wording and no Cloudflare string", async () => {
    const step1 = await call("/auth/login");
    assert.equal(step1.status, 200);
    assert.match(step1.headers.get("content-type"), /^text\/html/);
    assert.equal(step1.headers.get("cache-control"), "private, no-store");
    assert.match(step1.headers.get("content-security-policy"), /default-src 'none'/);
    assert.match(step1.headers.get("content-security-policy"), /form-action 'self'/);
    assert.equal(step1.headers.get("x-content-type-options"), "nosniff");
    assert.equal(step1.headers.get("set-cookie"), null);

    const html1 = await step1.text();
    const text1 = html1.replace(/<[^>]+>/g, "");
    assert.match(html1, /Immigrant OS/);
    assert.match(html1, /action="\/auth\/login\/code"/);
    assert.match(text1, /Invite-only beta\./);
    assert.match(text1, /Not a law firm\. Immigrant OS is not a law firm and is not affiliated with USCIS or any government agency\./);
    assert.match(text1, /No legal advice\. Nothing in the app is legal advice\. For questions about your case, talk to a qualified immigration attorney\./);
    assert.doesNotMatch(html1, /cloudflare/i);
    assert.doesNotMatch(html1, /<script/i);

    const step2 = await call("/auth/login?step=verify");
    assert.equal(step2.status, 200);
    const html2 = await step2.text();
    assert.match(html2, /Immigrant OS/);
    assert.match(html2, /action="\/auth\/login\/verify"/);
    assert.doesNotMatch(html2, /cloudflare/i);
  });

  await t.test("request-code response is uniform for eligible (profile or allowlist) vs unknown email", async () => {
    const sentBefore = sent.length;
    const rExisting = await postJson("/auth/login/code", { email: " Existing@Example.Test " }, { ip: "198.51.100.10" });
    const rInvited = await postJson("/auth/login/code", { email: "invited@example.test" }, { ip: "198.51.100.10" });
    const rUnknown = await postJson("/auth/login/code", { email: "stranger@example.test" }, { ip: "198.51.100.10" });

    assert.equal(rExisting.status, 200);
    assert.equal(rInvited.status, 200);
    assert.equal(rUnknown.status, 200);

    const bExisting = await rExisting.json();
    const bInvited = await rInvited.json();
    const bUnknown = await rUnknown.json();
    assert.deepEqual(bExisting, bInvited);
    assert.deepEqual(bExisting, bUnknown);
    assert.equal(bUnknown.ok, true);

    // Mailer was called for the two eligible emails and NOT for the unknown email.
    assert.equal(sent.length, sentBefore + 2);
    assert.deepEqual(sent.slice(sentBefore).map((item) => item.to), ["existing@example.test", "invited@example.test"]);

    // Unknown email creates no login_codes row.
    const unknownRow = await DB.prepare("SELECT * FROM login_codes WHERE email = ?").bind("stranger@example.test").first();
    assert.equal(unknownRow, null);

    // HTML form submission also returns identical wording and Step 2 form without Cloudflare branding.
    const formUnknown = await postForm("/auth/login/code", { email: "other-stranger@example.test" }, { ip: "198.51.100.11" });
    const formEligible = await postForm("/auth/login/code", { email: "second-invite@example.test" }, { ip: "198.51.100.11" });
    assert.equal(formUnknown.status, 200);
    assert.equal(formEligible.status, 200);
    const htmlUnknown = await formUnknown.text();
    const htmlEligible = await formEligible.text();
    assert.match(htmlUnknown, /action="\/auth\/login\/verify"/);
    assert.match(htmlEligible, /action="\/auth\/login\/verify"/);
    assert.equal(
      htmlUnknown.replace("other-stranger@example.test", "EMAIL"),
      htmlEligible.replace("second-invite@example.test", "EMAIL"),
    );
    assert.doesNotMatch(htmlEligible, /cloudflare/i);
  });

  await t.test("stored login_codes row contains only keyed HMAC hash, never plaintext code or logs", async () => {
    const lastSent = sent.findLast((item) => item.to === "existing@example.test");
    assert.ok(lastSent);
    const row = await DB.prepare("SELECT id, email, code_hash, expires_at, attempts, created_at FROM login_codes WHERE email = ?")
      .bind("existing@example.test").first();
    assert.ok(row);
    assert.match(row.code_hash, /^[0-9a-f]{64}$/);
    assert.notEqual(row.code_hash, lastSent.code);
    for (const val of Object.values(row)) {
      assert.ok(!String(val).includes(lastSent.code), "plaintext code must never be stored in login_codes");
    }
    const expectedHash = createHmac("sha256", secret)
      .update(`login-code:v1:${row.id}:existing@example.test:${lastSent.code}`)
      .digest("hex");
    assert.equal(row.code_hash, expectedHash);
    assert.equal(row.attempts, 0);

    // Plaintext code must never appear in console logs.
    for (const line of logCalls) {
      assert.ok(!line.includes(lastSent.code), "plaintext code must never be logged");
    }

    // Production build without RESEND_API_KEY fails closed (503) and never logs a code.
    const logsBefore = logCalls.length;
    const noMailerResp = await postJson(
      "/auth/login/code",
      { email: "existing@example.test" },
      { ip: "198.51.100.12", env: { ...baseEnv, RESEND_API_KEY: undefined } },
    );
    assert.equal(noMailerResp.status, 503);
    assert.equal(logCalls.length, logsBefore);
  });

  await t.test("expired code is rejected and deleted", async () => {
    const req = await postJson("/auth/login/code", { email: "second-invite@example.test" }, { ip: "198.51.100.20" });
    assert.equal(req.status, 200);
    const issued = sent.findLast((item) => item.to === "second-invite@example.test");
    assert.ok(issued);

    await DB.prepare("UPDATE login_codes SET expires_at = ? WHERE email = ?")
      .bind(new Date(Date.now() - 1000).toISOString(), "second-invite@example.test").run();

    const verify = await postJson(
      "/auth/login/verify",
      { email: "second-invite@example.test", code: issued.code },
      { ip: "198.51.100.20" },
    );
    assert.equal(verify.status, 401);
    assert.equal(verify.headers.get("set-cookie"), null);
    assert.deepEqual(await verify.json(), {
      error: "Invalid or expired sign-in code. Please try again or request a new code.",
    });
    const remaining = await DB.prepare("SELECT * FROM login_codes WHERE email = ?").bind("second-invite@example.test").first();
    assert.equal(remaining, null);
  });

  await t.test("code is invalidated after 5 failed attempts", async () => {
    const req = await postJson("/auth/login/code", { email: "existing@example.test" }, { ip: "198.51.100.30" });
    assert.equal(req.status, 200);
    const issued = sent.findLast((item) => item.to === "existing@example.test");
    assert.ok(issued);
    const wrongCode = issued.code === "000000" ? "999999" : "000000";

    for (let attempt = 1; attempt <= 5; attempt++) {
      const resp = await postJson(
        "/auth/login/verify",
        { email: "existing@example.test", code: wrongCode },
        { ip: "198.51.100.30" },
      );
      assert.equal(resp.status, 401);
      assert.equal(resp.headers.get("set-cookie"), null);
      assert.deepEqual(await resp.json(), {
        error: "Invalid or expired sign-in code. Please try again or request a new code.",
      });
      const row = await DB.prepare("SELECT attempts FROM login_codes WHERE email = ?").bind("existing@example.test").first();
      if (attempt < 5) {
        assert.equal(row.attempts, attempt);
      } else {
        assert.equal(row, null, "code row must be invalidated on the 5th failed attempt");
      }
    }

    // Even submitting the real code after 5 failures must be rejected.
    const sixth = await postJson(
      "/auth/login/verify",
      { email: "existing@example.test", code: issued.code },
      { ip: "198.51.100.30" },
    );
    assert.equal(sixth.status, 401);
    assert.equal(sixth.headers.get("set-cookie"), null);
  });

  await t.test("successful verify consumes code, issues session cookie, resolves owner without Access, and revokes on logout", async () => {
    const req = await postJson("/auth/login/code", { email: "invited@example.test" }, { ip: "198.51.100.40" });
    assert.equal(req.status, 200);
    const issued = sent.findLast((item) => item.to === "invited@example.test");
    assert.ok(issued);

    const verify = await postForm(
      "/auth/login/verify",
      { email: "invited@example.test", code: issued.code },
      { ip: "198.51.100.40" },
    );
    assert.equal(verify.status, 303);
    assert.equal(verify.headers.get("location"), "/");
    assert.equal(verify.headers.get("cache-control"), "private, no-store");
    const setCookie = verify.headers.get("set-cookie");
    assert.ok(setCookie);
    for (const attr of ["immigrant_session=", "Path=/", "Secure", "HttpOnly", "SameSite=Lax", "Expires="]) {
      assert.ok(setCookie.includes(attr), `cookie missing ${attr}`);
    }
    const cookieHeader = setCookie.split(";")[0];

    // Code row is consumed and cannot be replayed.
    const remainingCode = await DB.prepare("SELECT * FROM login_codes WHERE email = ?").bind("invited@example.test").first();
    assert.equal(remainingCode, null);
    const replay = await postJson(
      "/auth/login/verify",
      { email: "invited@example.test", code: issued.code },
      { ip: "198.51.100.40" },
    );
    assert.equal(replay.status, 401);

    // Without Access env vars or Access headers, the branded session cookie resolves to the owner.
    const emptyProfile = await call("/api/profile", { headers: { cookie: cookieHeader } });
    assert.equal(emptyProfile.status, 200);
    assert.equal((await emptyProfile.json()).profile, null);

    const save = await call("/api/profile", {
      method: "PUT",
      headers: { cookie: cookieHeader, "content-type": "application/json" },
      body: JSON.stringify({ displayName: "Invited Owner", lifecycleStage: "H1B", statusSubtype: "H1B", i94ExpirationDate: "2027-06-30" }),
    });
    assert.equal(save.status, 200);

    const loaded = await call("/api/profile", { headers: { cookie: cookieHeader } });
    assert.equal(loaded.status, 200);
    assert.equal((await loaded.json()).profile.displayName, "Invited Owner");

    // Signed-in GET / renders the app, not the landing page.
    const appRoot = await call("/", { headers: { cookie: cookieHeader } });
    assert.equal(appRoot.status, 200);
    assert.doesNotMatch(await appRoot.text(), /Request access/);

    // Parallel coexistence: session cookie is ALSO honored without Access JWT even when Access env vars are set.
    const parallelEnv = { ...baseEnv, ...access.env };
    const parallelProfile = await call("/api/profile", { headers: { cookie: cookieHeader }, env: parallelEnv });
    assert.equal(parallelProfile.status, 200);
    assert.equal((await parallelProfile.json()).profile.displayName, "Invited Owner");

    // Unauthenticated API requests stay 401; unauthenticated GET / stays the public landing page.
    assert.equal((await call("/api/profile")).status, 401);
    const landing = await call("/");
    assert.equal(landing.status, 200);
    assert.match(await landing.text(), /Request access/);

    // Logout clears cookie, revokes session, and redirects to / when no Access session is present.
    const logout = await call("/auth/logout", {
      method: "POST",
      headers: { cookie: cookieHeader, origin: "https://app.example.test" },
    });
    assert.equal(logout.status, 303);
    assert.equal(logout.headers.get("location"), "/");
    assert.match(logout.headers.get("set-cookie"), /Max-Age=0/);
    assert.equal((await call("/api/profile", { headers: { cookie: cookieHeader } })).status, 401);
  });

  await t.test("CSRF origin checks and per-email / per-IP rate limits are enforced", async () => {
    const crossCode = await postJson(
      "/auth/login/code",
      { email: "invited@example.test" },
      { ip: "198.51.100.50", headers: { origin: "https://evil.example" } },
    );
    assert.equal(crossCode.status, 403);

    const crossVerify = await postJson(
      "/auth/login/verify",
      { email: "invited@example.test", code: "123456" },
      { ip: "198.51.100.50", headers: { origin: "https://evil.example" } },
    );
    assert.equal(crossVerify.status, 403);

    // Per-email limit: 5 sends allowed, 6th returns identical 200 without creating a new code or sending email.
    const throttleEmail = "throttle-me@example.test";
    const throttleEnv = { ...baseEnv, BRANDED_LOGIN_ALLOWLIST: throttleEmail };
    const sentBefore = sent.length;
    let fifthBody;
    for (let i = 0; i < 5; i++) {
      const resp = await postJson("/auth/login/code", { email: throttleEmail }, { ip: `198.51.100.${60 + i}`, env: throttleEnv });
      assert.equal(resp.status, 200);
      fifthBody = await resp.json();
      assert.equal(fifthBody.ok, true);
    }
    assert.equal(sent.length, sentBefore + 5, "first 5 requests for the same email must each send a code");
    const rowAfterFifth = await DB.prepare("SELECT id, code_hash FROM login_codes WHERE email = ?")
      .bind(throttleEmail).first();
    assert.ok(rowAfterFifth, "active login_codes row must exist after 5th request");

    const sixthResp = await postJson("/auth/login/code", { email: throttleEmail }, { ip: "198.51.100.65", env: throttleEnv });
    assert.equal(sixthResp.status, 200);
    assert.deepEqual(await sixthResp.json(), fifthBody, "throttled 6th response must match unthrottled response");
    assert.equal(sent.length, sentBefore + 5, "6th request for the same email must be silently throttled");
    const rowAfterSixth = await DB.prepare("SELECT id, code_hash FROM login_codes WHERE email = ?")
      .bind(throttleEmail).first();
    assert.deepEqual(rowAfterSixth, rowAfterFifth, "throttled 6th request must not create or replace the login_codes row");
    assert.ok(!logCalls.includes("branded_login_mail_failed"), "Resend mailer mock must intercept all email sends");

    // Per-IP limit: 20 requests allowed from one IP, 21st returns 429 with Retry-After.
    const floodIp = "203.0.113.77";
    for (let i = 0; i < 20; i++) {
      const resp = await postJson("/auth/login/code", { email: `ip-test-${i}@example.test` }, { ip: floodIp });
      assert.equal(resp.status, 200);
    }
    const blocked = await postJson("/auth/login/code", { email: "ip-test-21@example.test" }, { ip: floodIp });
    assert.equal(blocked.status, 429);
    assert.ok(Number(blocked.headers.get("retry-after")) >= 1);
  });
});
