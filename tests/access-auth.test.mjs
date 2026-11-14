import assert from "node:assert/strict";
import test from "node:test";
import { createHmac, generateKeyPairSync } from "node:crypto";
import { Miniflare } from "miniflare";
import worker from "../dist/server/index.js";
import { accessFixture } from "./helpers/access.mjs";

const context = { waitUntil() {}, passThroughOnException() {} };
const secret = "access-test-secret-".repeat(4);
const call = (env, path = "/auth/access", headers = {}, method = "GET", body) => worker.fetch(
  new Request(`https://app.example.test${path}`, { headers, method, body }), env, context,
);

test("Access validates JWTs before touching storage", async (t) => {
  const access = accessFixture(t);
  const env = { ...access.env, AUTH_MODE: "session", SESSION_SECRET: secret };
  const errors = t.mock.method(console, "error", () => {});
  const reject = async (jwt, reason, overrides = {}, status = 401) => {
    const headers = { "Cf-Access-Authenticated-User-Email": "forged@example.test", "oai-authenticated-user-email": "forged@example.test" };
    if (jwt !== undefined) headers["Cf-Access-Jwt-Assertion"] = jwt;
    const loggedBefore = errors.mock.callCount();
    const response = await call({ ...env, ...overrides }, "/auth/access", headers);
    assert.equal(response.status, status);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal(response.headers.get("set-cookie"), null);
    const body = await response.json();
    if (status === 401) {
      assert.deepEqual(body, { error: "A valid Cloudflare Access identity is required." });
      assert.equal(errors.mock.callCount(), loggedBefore + 1);
      assert.deepEqual(errors.mock.calls.at(-1).arguments, [reason]);
    } else {
      assert.equal(Object.hasOwn(body, "detail"), false);
      assert.equal(errors.mock.callCount(), loggedBefore);
    }
  };
  await t.test("missing JWT rejects plain identity headers", () => reject(undefined, "no_token"));
  await t.test("unset configuration disables the bridge", async () => {
    for (const key of ["ACCESS_TEAM_DOMAIN", "ACCESS_AUD", "SESSION_SECRET"]) await reject(access.jwt(), undefined, { [key]: undefined }, 503);
    await reject(undefined, undefined, { ACCESS_AUD: undefined }, 503);
    await reject(access.jwt(), undefined, { ACCESS_TEAM_DOMAIN: "https://team.cloudflareaccess.com" }, 503);
    await reject(access.jwt(), undefined, { AUTH_MODE: "dispatch" }, 503);
  });
  await t.test("JWKS failure fails closed", async () => {
    access.setAvailable(false);
    await reject(access.jwt(), "jwks_unavailable");
    access.setAvailable(true);
  });
  await t.test("bad signature is rejected", async () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    await reject(access.jwt({}, {}, privateKey), "bad_signature");
  });
  await t.test("wrong audience or issuer is rejected", async () => {
    await reject(access.jwt({ aud: ["another-app"] }), "bad_claims");
    await reject(access.jwt({ iss: "https://another-team.cloudflareaccess.com" }), "bad_claims");
  });
  await t.test("expired, premature, absent, or malformed claims are rejected", async () => {
    for (const claims of [
      { exp: 0 }, { exp: undefined }, { exp: "9999999999" }, { nbf: Date.now() / 1000 + 3600 },
      { nbf: "0" }, { email: undefined }, { email: " " }, { email: ["owner@example.test"] },
      { aud: undefined }, { aud: [env.ACCESS_AUD, 123] }, { iss: undefined },
    ]) await reject(access.jwt(claims), Object.hasOwn(claims, "email") ? "no_email" : "bad_claims");
  });
  await t.test("algorithm confusion, unknown keys, and malformed tokens are rejected", async () => {
    for (const header of [{ alg: "none" }, { alg: "HS256" }, { kid: undefined }, { crit: ["custom"] }]) await reject(access.jwt({}, header), "bad_header");
    await reject(access.jwt({}, { kid: "unknown" }), "key_mismatch");
    await reject("", "no_token");
    await reject("e30.e30.bad", "bad_header");
    const [header, payload, signature] = access.jwt().split(".");
    for (const token of ["not-a-jwt", "a.b.c.d", `${header}..${signature}`, `${header}.!.${signature}`, `${header}.${payload}.!`, "a".repeat(32_769)]) await reject(token, "bad_structure");
    await reject(`!.${payload}.${signature}`, "bad_header");
  });
  await t.test("rejection bodies never expose diagnostic details and logs contain only the code", async () => {
    for (const path of ["/", "/api/profile", "/auth/access/", "/images/icon.png"]) {
      const response = await call(env, path);
      assert.equal(response.status, 401);
      assert.equal(response.headers.get("cache-control"), "private, no-store");
      assert.deepEqual(await response.json(), { error: "A valid Cloudflare Access identity is required." });
      assert.deepEqual(errors.mock.calls.at(-1).arguments, ["no_token"]);
    }
  });
  await t.test("CF_Authorization cookie bootstraps when the assertion header is absent", async () => {
    const jwt = access.jwt();
    for (const cookie of [
      `CF_Authorization=${jwt}`,
      `other=has=equals; CF_Authorization_extra=invalid; CF_Authorization=${jwt}; last=value`,
      `other=value;  CF_Authorization="${jwt}"; last=value`,
    ]) {
      const loggedBefore = errors.mock.callCount();
      const response = await call(env, "/", { cookie });
      assert.equal(response.status, 303);
      assert.equal(response.headers.get("location"), "/auth/access");
      assert.equal(errors.mock.callCount(), loggedBefore);
    }
    for (const cookie of ["CF_Authorization_extra=invalid", "cf_authorization=invalid", "CF_Authorization", "CF_Authorization="]) {
      const response = await call(env, "/auth/access", { cookie });
      assert.equal(response.status, 401);
      assert.deepEqual(await response.json(), { error: "A valid Cloudflare Access identity is required." });
    }
  });
  await t.test("assertion header wins over the cookie, including invalid or empty headers", async () => {
    const valid = access.jwt();
    const response = await call(env, "/", { "Cf-Access-Jwt-Assertion": valid, cookie: "CF_Authorization=invalid" });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get("location"), "/auth/access");
    for (const [header, reason] of [["invalid", "bad_structure"], ["", "no_token"], [access.jwt({ aud: "wrong-app" }), "bad_claims"]]) {
      const rejected = await call(env, "/auth/access", { "Cf-Access-Jwt-Assertion": header, cookie: `CF_Authorization=${valid}` });
      assert.equal(rejected.status, 401);
      assert.deepEqual(await rejected.json(), { error: "A valid Cloudflare Access identity is required." });
      assert.deepEqual(errors.mock.calls.at(-1).arguments, [reason]);
    }
  });
  await t.test("only GET can bootstrap a session", async () => {
    const response = await call(env, "/auth/access", {}, "POST");
    assert.equal(response.status, 405);
    assert.equal(response.headers.get("allow"), "GET");
  });
  await t.test("valid JWTs with string or array audiences reach the session bootstrap", async () => {
    for (const aud of [env.ACCESS_AUD, [env.ACCESS_AUD]]) {
      const response = await call(env, "/", { "Cf-Access-Jwt-Assertion": access.jwt({ aud }) });
      assert.equal(response.status, 303);
      assert.equal(response.headers.get("location"), "/auth/access");
      assert.equal(response.headers.get("cache-control"), "private, no-store");
    }
  });
});

test("Access creates owner-scoped sessions, checks every request, and revokes on logout", async (t) => {
  const access = accessFixture(t);
  const mf = new Miniflare({ modules: true, script: "export default { fetch() { return new Response('test'); } }", d1Databases: ["DB"], r2Buckets: ["BUCKET"] });
  try {
    const env = {
      ...access.env, AUTH_MODE: "session", SESSION_SECRET: secret,
      DB: await mf.getD1Database("DB"), BUCKET: await mf.getR2Bucket("BUCKET"),
      ASSETS: { fetch: () => new Response("Not found", { status: 404 }) },
    };
    const headers = (email, cookie) => ({ "Cf-Access-Jwt-Assertion": access.jwt({ email }), ...(cookie ? { cookie } : {}) });
    const login = async (email, previous) => {
      const response = await call(env, "/auth/access", headers(email, previous));
      assert.equal(response.status, 303);
      assert.equal(response.headers.get("location"), "/");
      assert.equal(response.headers.get("cache-control"), "private, no-store");
      const cookie = response.headers.get("set-cookie");
      for (const flag of ["Path=/", "Secure", "HttpOnly", "SameSite=Lax", "Expires="]) assert.ok(cookie.includes(flag), flag);
      assert.ok(!/domain=/i.test(cookie));
      return cookie.split(";")[0];
    };
    let a, b;
    await t.test("root bootstraps through the bridge", async () => {
      const response = await call(env, "/", headers("a@example.test"));
      assert.equal(response.status, 303);
      assert.equal(response.headers.get("location"), "/auth/access");
    });
    await t.test("valid JWT creates a normalized owner and the existing HMAC cookie", async () => {
      a = await login(" A@Example.Test ");
      const [id, signature] = a.slice("immigrant_session=".length).split(".");
      assert.equal(signature, createHmac("sha256", secret).update(id).digest("base64url"));
      const row = await env.DB.prepare("SELECT owner, expires_at FROM sessions WHERE id = ?").bind(id).first();
      assert.equal(row.owner, "a@example.test");
      assert.ok(new Date(row.expires_at).getTime() > Date.now());
      const save = await call(env, "/api/profile", { ...headers("a@example.test", a), "content-type": "application/json" }, "PUT", JSON.stringify({ displayName: "A", lifecycleStage: "H1B", statusSubtype: "H1B" }));
      assert.equal(save.status, 200);
      assert.equal((await (await call(env, "/api/profile", headers("a@example.test", a))).json()).profile.displayName, "A");
      b = await login("b@example.test");
      assert.equal((await (await call(env, "/api/profile", headers("b@example.test", b))).json()).profile, null);
    });
    await t.test("a surviving app cookie cannot bypass missing or expired Access JWTs", async () => {
      for (const path of ["/", "/api/profile", "/api/documents"]) {
        assert.equal((await call(env, path, { cookie: a })).status, 401);
        assert.equal((await call(env, path, { cookie: a, "Cf-Access-Jwt-Assertion": access.jwt({ email: "a@example.test", exp: 0 }) })).status, 401);
      }
    });
    await t.test("a different Access owner cannot use the old cookie", async () => {
      assert.equal((await call(env, "/api/profile", headers("b@example.test", a))).status, 401);
      assert.equal((await call(env, "/api/profile", headers("a@example.test", a))).status, 401);
    });
    await t.test("bridge identity switching revokes the previous session", async () => {
      a = await login("a@example.test", b);
      assert.equal((await call(env, "/api/profile", headers("b@example.test", b))).status, 401);
      assert.equal((await (await call(env, "/api/profile", headers("a@example.test", a))).json()).profile.displayName, "A");
    });
    await t.test("logout requires a same-origin POST, revokes D1 session, clears cookie, and ends Access", async () => {
      assert.equal((await call(env, "/auth/logout", headers("a@example.test", a))).status, 405);
      assert.equal((await call(env, "/auth/logout", { ...headers("a@example.test", a), origin: "https://evil.example" }, "POST")).status, 403);
      // Logout must still clear/revoke the app session when Access has expired.
      const response = await call(env, "/auth/logout", { cookie: a, origin: "https://app.example.test" }, "POST");
      assert.equal(response.status, 303);
      assert.equal(response.headers.get("location"), "/cdn-cgi/access/logout");
      assert.match(response.headers.get("set-cookie"), /Max-Age=0/);
      assert.equal((await call(env, "/api/profile", headers("a@example.test", a))).status, 401);
    });
  } finally { await mf.dispose(); }
});
