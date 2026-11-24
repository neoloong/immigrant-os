import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import worker from "../dist/server/index.js";
import { sqliteD1 } from "./helpers/sqlite-d1.mjs";
import { accessFixture } from "./helpers/access.mjs";

// Public routing in production (session) mode: the landing page at `/` for
// visitors without a valid session, public `/agents` and `/privacy`, and
// unchanged behavior for signed-in users and every data route.
const context = { waitUntil() {}, passThroughOnException() {} };
const secret = "public-pages-secret-".repeat(4);

test("public landing, privacy and agent guide; app and data stay behind the session", async (t) => {
  const access = accessFixture(t);
  const errors = t.mock.method(console, "error", () => {});
  const DB = sqliteD1();
  for (const name of ["0000_new_maria_hill", "0001_round_ted_forrester", "0002_agent_tokens", "0003_family_profiles", "0004_extension_requested_until"]) DB.exec(await readFile(new URL(`../drizzle/${name}.sql`, import.meta.url), "utf8"));
  const env = {
    ...access.env, AUTH_MODE: "session", SESSION_SECRET: secret, AGENT_MCP_ENABLED: "true", DB, BUCKET: {},
    ASSETS: { fetch: () => new Response("Not found", { status: 404 }) },
  };
  const call = (path, headers = {}, method = "GET", body) => worker.fetch(new Request(`https://app.example.test${path}`, { method, headers, body }), env, context);
  const jwt = (email = "owner@example.test", claims = {}) => ({ "Cf-Access-Jwt-Assertion": access.jwt({ email, ...claims }) });
  const isLanding = (html) => /Request access/.test(html) && /Immigrant%20OS%20access%20request/.test(html);
  const checkPublicHeaders = (response) => {
    assert.match(response.headers.get("content-type"), /^text\/html/);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.match(response.headers.get("content-security-policy"), /default-src 'none'/);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("set-cookie"), null);
  };

  // Seed a signed-in user with saved data, so leaks would be detectable.
  const bootstrap = await call("/auth/access", jwt());
  assert.equal(bootstrap.status, 303);
  const cookie = bootstrap.headers.get("set-cookie").split(";")[0];
  const signedIn = { ...jwt(), cookie };
  const saved = await call("/api/profile", { ...signedIn, "content-type": "application/json" }, "PUT", JSON.stringify({ displayName: "SecretNickname", lifecycleStage: "H1B", statusSubtype: "H1B", i94ExpirationDate: "2027-03-31" }));
  assert.equal(saved.status, 200);

  await t.test("unauthenticated / serves the static landing page", async () => {
    const logged = errors.mock.callCount();
    for (const headers of [{}, { cookie }, jwt("owner@example.test", { exp: 0 }), { "Cf-Access-Jwt-Assertion": "garbage", cookie }, { "oai-authenticated-user-email": "owner@example.test" }]) {
      const response = await call("/", headers);
      assert.equal(response.status, 200);
      checkPublicHeaders(response);
      const html = await response.text();
      assert.ok(isLanding(html));
      assert.match(html, /href="mailto:neoloong@gmail\.com\?subject=Immigrant%20OS%20access%20request"/);
      assert.match(html, /href="\/auth\/login"[^>]*>Sign in/);
      for (const phrase of [/Invite-only beta/, /Not a law firm/, /No legal advice/, /does not decide whether you are eligible/, /not affiliated with USCIS/]) assert.match(html, phrase);
      assert.doesNotMatch(html, /SecretNickname|owner@example\.test|2027-03-31|<script|_vinext|<img|https?:\/\//i);
    }
    assert.equal(errors.mock.callCount(), logged, "anonymous landing views are not logged as Access rejections");
    const head = await call("/", {}, "HEAD");
    assert.equal(head.status, 200);
    assert.equal(await head.text(), "");
  });

  await t.test("non-GET requests to / without a session are still rejected", async () => {
    for (const method of ["POST", "PUT", "DELETE"]) assert.equal((await call("/", {}, method)).status, 401);
  });

  await t.test("authenticated / keeps the existing app behavior", async () => {
    const fresh = await call("/", jwt("new@example.test"));
    assert.equal(fresh.status, 303);
    assert.equal(fresh.headers.get("location"), "/auth/access");
    const app = await call("/", signedIn);
    assert.equal(app.status, 200);
    const html = await app.text();
    assert.ok(!isLanding(html), "signed-in users get the app, not the landing page");
    assert.match(html, /codex-preview/);
  });

  await t.test("/agents is public and identical for signed-in users", async () => {
    const anonymous = await call("/agents");
    assert.equal(anonymous.status, 200);
    const anonymousHtml = await anonymous.text();
    assert.match(anonymousHtml, /Use with your AI agent/);
    assert.match(anonymousHtml, /https:\/\/app\.example\.test\/mcp/);
    assert.doesNotMatch(anonymousHtml, /SecretNickname|owner@example\.test|ios_[a-f0-9]{64}/);
    // The public tool lists must match the live MCP tools/list (10 tools,
    // get_calendar_export is read scope; set_action_completed is write scope).
    const toolNames = ["list_profiles", "get_profile", "get_action_plan", "get_calendar_export", "get_extension_helper", "list_documents", "list_cases", "update_profile_dates", "set_action_completed", "add_case"];
    for (const name of toolNames) assert.ok(anonymousHtml.includes(name), `/agents missing ${name}`);
    for (const phrase of [/Invite-only beta/, /Not a law firm/, /not affiliated with USCIS/, /href="\/auth\/login"/, /href="\/privacy"/, /Immigrant%20OS%20access%20request/]) assert.match(anonymousHtml, phrase);
    const llms = await (await call("/llms.txt")).text();
    for (const name of toolNames) assert.ok(llms.includes(name), `/llms.txt missing ${name}`);
    assert.equal(await (await call("/agents", signedIn)).text(), anonymousHtml);
  });

  await t.test("/privacy is public and factual", async () => {
    for (const headers of [{}, signedIn]) {
      const response = await call("/privacy", headers);
      assert.equal(response.status, 200);
      checkPublicHeaders(response);
      const html = await response.text();
      for (const phrase of [/Privacy note/, /never sold/, /no advertising trackers/, /Cloudflare/, /not legal advice|does not give legal advice/, /mailto:neoloong@gmail\.com/]) assert.match(html, phrase);
      assert.doesNotMatch(html, /SecretNickname|owner@example\.test|<script/);
      // The privacy meta description must not promise unconditional "deadlines".
      assert.doesNotMatch(html, /dates, deadlines and documents/);
    }
    assert.equal((await call("/privacy", {}, "POST")).status, 405);
  });

  await t.test("data routes still refuse requests without a valid session", async () => {
    for (const path of ["/api/profile", "/api/plan", "/api/documents", "/api/cases", "/api/agent-tokens", "/api/profile?profile=x"]) {
      for (const headers of [{}, { cookie }, { accept: "text/html" }, { "oai-authenticated-user-email": "owner@example.test" }]) {
        const response = await call(path, headers);
        assert.equal(response.status, 401, `${path} ${JSON.stringify(headers)}`);
        assert.doesNotMatch(await response.text(), /SecretNickname|2027-03-31/);
      }
    }
    assert.equal((await call("/mcp", { "content-type": "application/json", accept: "application/json, text/event-stream" }, "POST", JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }))).status, 401);
    // The signed-in user still reaches their data.
    assert.equal((await (await call("/api/profile", signedIn)).json()).profile.displayName, "SecretNickname");
  });

  await t.test("Sign in uses the existing login flow", async () => {
    const response = await call("/auth/login");
    assert.equal(response.status, 303);
    assert.equal(response.headers.get("location"), "/auth/access");
  });
});
