import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import worker from "../dist/server/index.js";
import { sqliteD1 } from "./helpers/sqlite-d1.mjs";
import { accessFixture } from "./helpers/access.mjs";

// Execute the built Worker with real SQLite, including the production SQL
// migrations. Existing Miniflare suites separately cover D1/R2 integration.
test("agent token lifecycle, MCP protocol, account isolation and compliance", async (t) => {
  const DB = sqliteD1();
  const env = { DB, BUCKET: {}, ASSETS: { fetch: () => new Response("Not found", { status: 404 }) }, AGENT_MCP_ENABLED: "true" };
  for (const name of ["0000_new_maria_hill", "0001_round_ted_forrester", "0002_agent_tokens"]) DB.exec(await readFile(new URL(`../drizzle/${name}.sql`, import.meta.url), "utf8"));
  const ctx = { waitUntil() {}, passThroughOnException() {} };
  const a = "agent-a@example.test", b = "agent-b@example.test";
  const web = (owner, path, method = "GET", body, headers = {}, overrides = {}) => worker.fetch(new Request(`https://test.local${path}`, {
    method, headers: { ...(owner ? { "oai-authenticated-user-email": owner } : {}), "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  }), { ...env, ...overrides }, ctx);
  const rpc = (token, method, params = {}, headers = {}, overrides = {}) => worker.fetch(new Request("https://test.local/mcp", {
    method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  }), { ...env, ...overrides }, ctx);
  const good = async (response) => { response = await response; assert.ok(response.ok, await response.clone().text()); assert.equal(response.headers.get("cache-control"), "private, no-store"); return response.json(); };
  const create = (owner, scopes = "read") => good(web(owner, "/api/agent-tokens", "POST", { label: `${owner} agent`, scopes }));
  const call = async (token, name, args = {}, headers = {}) => {
    const body = await good(rpc(token, "tools/call", { name, arguments: args }, headers));
    assert.equal(body.result?.isError, false, JSON.stringify(body));
    assert.deepEqual(JSON.parse(body.result.content[0].text), body.result.structuredContent);
    return body.result.structuredContent;
  };
  let read, write, other;
  try {
    await t.test("dark by default; public guide/discovery do not require Access", async () => {
      for (const flag of [undefined, "false", "TRUE", "1"]) assert.equal((await rpc(null, "tools/list", {}, {}, { AGENT_MCP_ENABLED: flag })).status, 404);
      assert.equal((await web(a, "/api/agent-tokens", "POST", { label: "off", scopes: "read" }, {}, { AGENT_MCP_ENABLED: "false" })).status, 404);
      for (const path of ["/agents", "/llms.txt"]) {
        const response = await web(null, path, "GET", undefined, {}, { AUTH_MODE: "session", AGENT_MCP_ENABLED: undefined });
        assert.equal(response.status, 200);
        const text = await response.text(); assert.match(text, /https:\/\/test.local\/mcp/); assert.match(text, /not enabled|disabled/);
        assert.doesNotMatch(text, /ios_[a-f0-9]{64}/);
      }
      const prompt = await readFile(new URL("../docs/agent-prompt.md", import.meta.url), "utf8");
      const html = await (await web(null, "/agents")).text();
      for (const line of prompt.split("```text\n")[1].split("\n```")[0].split("\n")) assert.ok(html.includes(line));
    });
    await t.test("web session is required; bearer tokens cannot manage tokens", async () => {
      assert.equal((await web(null, "/api/agent-tokens")).status, 401);
      assert.equal((await web(a, "/api/agent-tokens", "POST", { label: "x", scopes: "read" }, { origin: "https://evil.test" })).status, 403);
      for (const input of [null, {}, { label: " ", scopes: "read" }, { label: "x", scopes: "admin" }, { label: "x", scopes: "read", owner: b }]) assert.equal((await web(a, "/api/agent-tokens", "POST", input)).status, 400);
      read = await create(a); write = await create(a, "write"); other = await create(b, "write");
      assert.equal((await web(null, "/api/agent-tokens", "GET", undefined, { authorization: `Bearer ${read.token}` })).status, 401);
    });
    await t.test("tokens have 256 random bits, SHA-256 storage only and 90-day expiry", async () => {
      assert.match(read.token, /^ios_[a-f0-9]{64}$/); assert.notEqual(read.token, write.token);
      const rows = (await DB.prepare("SELECT * FROM agent_tokens").all()).results;
      const row = rows.find((row) => row.id === read.agentToken.id);
      assert.equal(row.token_hash, createHash("sha256").update(read.token).digest("hex"));
      assert.ok(!JSON.stringify(rows).includes(read.token)); assert.equal(row.last_used_at, null);
      assert.equal(Date.parse(row.expires_at) - Date.parse(row.created_at), 90 * 86400_000);
      const listed = await good(web(a, "/api/agent-tokens"));
      assert.equal(listed.tokens.length, 2); assert.ok(listed.tokens.every((token) => !token.owner && !token.tokenHash && !token.token));
      assert.ok(!JSON.stringify(listed).includes(row.token_hash));
      assert.equal((await good(web(b, "/api/agent-tokens"))).tokens.length, 1);
    });
    await t.test("missing, malformed, spoofed, unknown, expired and revoked credentials fail", async () => {
      for (const token of [null, "bad", `ios_${"a".repeat(64)}`]) {
        const response = await rpc(token, "tools/list", {}, { "oai-authenticated-user-email": a });
        assert.equal(response.status, 401); assert.match(response.headers.get("www-authenticate"), /^Bearer/);
      }
      const expired = await create(a);
      await DB.prepare("UPDATE agent_tokens SET expires_at = ? WHERE id = ?").bind("2000-01-01T00:00:00.000Z", expired.agentToken.id).run();
      assert.equal((await rpc(expired.token, "tools/list")).status, 401);
      assert.equal((await web(b, `/api/agent-tokens?id=${read.agentToken.id}`, "DELETE")).status, 404);
      const disposable = await create(a);
      await good(web(a, `/api/agent-tokens?id=${disposable.agentToken.id}`, "DELETE"));
      assert.equal((await rpc(disposable.token, "tools/list")).status, 401);
      assert.ok((await DB.prepare("SELECT revoked_at FROM agent_tokens WHERE id = ?").bind(disposable.agentToken.id).first()).revoked_at);
    });
    await t.test("initialize negotiates a supported revision, scopes filter tools, usage updates", async () => {
      for (const version of ["2025-03-26", "2025-06-18", "2025-11-25", "future-version"]) {
        const initialized = await good(rpc(read.token, "initialize", { protocolVersion: version, capabilities: {}, clientInfo: { name: "test", version: "1" } }));
        assert.equal(initialized.result.protocolVersion, version === "future-version" ? "2025-11-25" : version);
        assert.deepEqual(initialized.result.capabilities, { tools: { listChanged: false } });
      }
      assert.equal((await good(rpc(read.token, "initialize"))).error.code, -32602);
      const readerTools = (await good(rpc(read.token, "tools/list"))).result.tools;
      assert.equal(readerTools.length, 4);
      const writerTools = (await good(rpc(write.token, "tools/list"))).result.tools; assert.equal(writerTools.length, 6);
      for (const tool of writerTools) { assert.match(tool.description, /No eligibility determinations, legal advice/); assert.equal(tool.inputSchema.additionalProperties, false); }
      assert.ok((await DB.prepare("SELECT last_used_at FROM agent_tokens WHERE id = ?").bind(read.agentToken.id).first()).last_used_at);
      for (const name of ["update_profile_dates", "add_case"]) assert.equal((await good(rpc(read.token, "tools/call", { name, arguments: {} }))).error.code, -32003);
    });
    await t.test("Streamable HTTP rejects malformed calls and cross-origin requests without mutation", async () => {
      assert.equal((await rpc(read.token, "tools/list", {}, { origin: "https://evil.test" })).status, 403);
      assert.equal((await rpc(read.token, "tools/list", {}, { "mcp-protocol-version": "unknown" })).status, 400);
      assert.equal((await rpc(read.token, "tools/list", {}, { "content-type": "text/plain" })).status, 415);
      assert.equal((await rpc(read.token, "tools/list", {}, { accept: "text/event-stream" })).status, 406);
      assert.equal((await good(rpc(read.token, "unknown"))).error.code, -32601);
      assert.equal((await good(rpc(read.token, "tools/call", { name: "unknown" }))).error.code, -32602);
      for (const method of ["GET", "DELETE"]) assert.equal((await web(null, "/mcp", method, undefined, { authorization: `Bearer ${read.token}` })).status, 405);
      const raw = (body) => worker.fetch(new Request("https://test.local/mcp", { method: "POST", headers: { authorization: `Bearer ${write.token}`, "content-type": "application/json", accept: "application/json, text/event-stream" }, body }), env, ctx);
      assert.equal((await raw("{")).status, 400);
      for (const body of [[], null, { jsonrpc: "2.0", id: null, method: "tools/list" }, { jsonrpc: "1.0", id: 1, method: "tools/list" }]) assert.equal((await raw(JSON.stringify(body))).status, 400);
      assert.equal((await raw(" ".repeat(32769))).status, 413);
      const initialized = await raw(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }));
      assert.equal(initialized.status, 202); assert.equal(await initialized.text(), "");
      assert.equal((await raw(JSON.stringify({ jsonrpc: "2.0", method: "tools/call", params: { name: "add_case", arguments: { receiptNumber: "IOE1234567890" } } }))).status, 400);
      assert.deepEqual(await call(write.token, "list_cases"), { cases: [] });
    });
    await t.test("MCP reads and writes use token owner even with spoofed identity headers", async () => {
      assert.deepEqual(await call(read.token, "get_profile"), { profile: null });
      assert.deepEqual(await call(read.token, "get_action_plan"), { actions: [] });
      const missing = await good(rpc(write.token, "tools/call", { name: "update_profile_dates", arguments: { i94ExpirationDate: "2028-03-31" } }));
      assert.equal(missing.result.isError, true);
      await good(web(a, "/api/profile", "PUT", { displayName: "Account A", lifecycleStage: "H1B", statusSubtype: "H1B", i94ExpirationDate: "2027-03-31" }));
      await good(web(b, "/api/profile", "PUT", { displayName: "Account B", lifecycleStage: "F1", programEndDate: "2029-05-31" }));
      const spoof = { "oai-authenticated-user-email": b, cookie: "immigrant_session=fake" };
      assert.equal((await call(read.token, "get_profile", {}, spoof)).profile.displayName, "Account A");
      for (const name of ["get_profile", "get_action_plan", "list_documents", "list_cases", "update_profile_dates", "add_case"]) {
        const rejected = await good(rpc(write.token, "tools/call", { name, arguments: { owner: b, receiptNumber: "IOE1234567890" } }));
        assert.equal(rejected.error.code, -32602);
      }
      const result = await call(write.token, "update_profile_dates", { i94ExpirationDate: "2028-03-31" }, spoof);
      assert.equal(result.profile.i94ExpirationDate, "2028-03-31"); assert.equal(result.profile.displayName, "Account A");
      assert.equal((await call(other.token, "get_profile")).profile.programEndDate, "2029-05-31");
      assert.equal((await call(other.token, "get_profile")).profile.i94ExpirationDate, null);
    });
    await t.test("web and MCP use identical validation, plans and completion reopening", async () => {
      const plan = (await good(web(a, "/api/plan"))).plan;
      const key = plan.items.find((item) => item.id.startsWith("h1b-i94-end:")).id;
      await good(web(a, "/api/actions", "POST", { actionKey: key, completed: true }));
      assert.ok(!(await call(read.token, "get_action_plan")).actions.some((item) => item.id === key));
      for (const args of [{ i94ExpirationDate: "2028-02-30" }, { lifecycleStage: "UNKNOWN" }, { i94ExpirationDate: 123 }, {}, { displayName: "overwrite" }]) {
        const result = await good(rpc(write.token, "tools/call", { name: "update_profile_dates", arguments: args }));
        assert.ok(result.error || result.result.isError);
      }
      assert.equal((await call(read.token, "get_profile")).profile.i94ExpirationDate, "2028-03-31");
      await call(write.token, "update_profile_dates", { i94ExpirationDate: "2029-03-31" });
      const actions = (await call(read.token, "get_action_plan")).actions;
      assert.equal(actions.find((item) => item.id.startsWith("h1b-i94-end:")).dueDate, "2029-03-31");
      const webPlan = (await good(web(a, "/api/plan"))).plan;
      assert.deepEqual(actions, webPlan.items.filter((item) => !item.completed).map((item) => ({ id: item.id, title: item.title, dueDate: item.dueDate, status: "open", source: item.source })));
      await call(write.token, "update_profile_dates", { i94ExpirationDate: null });
      assert.equal((await call(read.token, "get_action_plan")).actions.length, 0);
    });
    await t.test("documents disclose metadata only and cases stay owner-scoped", async () => {
      await DB.prepare("INSERT INTO documents (id,owner,kind,filename,mime_type,size_bytes,object_key) VALUES (?,?,?,?,?,?,?)").bind("doc-a", a, "USCIS notice", "fixture.pdf", "application/pdf", 20, "SECRET_STORAGE_KEY").run();
      await DB.prepare("INSERT INTO documents (id,owner,kind,filename,mime_type,size_bytes,object_key) VALUES (?,?,?,?,?,?,?)").bind("doc-b", b, "Other", "private-b.pdf", "application/pdf", 20, "PRIVATE_B_KEY").run();
      const docs = await call(read.token, "list_documents"); assert.equal(docs.documents.length, 1); assert.equal(docs.documents[0].name, "fixture.pdf");
      assert.deepEqual(Object.keys(docs.documents[0]).sort(), ["date", "name", "type"]);
      const saved = await call(write.token, "add_case", { receiptNumber: "ioe-1234567890", nickname: "A" });
      assert.equal(saved.case.receiptNumber, "IOE1234567890"); assert.match(saved.case.statusUrl, /^https:\/\/egov\.uscis\.gov\//);
      assert.deepEqual(await call(other.token, "list_cases"), { cases: [] });
      await call(other.token, "add_case", { receiptNumber: "IOE1234567890", nickname: "B" });
      await call(write.token, "add_case", { receiptNumber: "IOE1234567890", nickname: "A updated" });
      assert.equal((await good(web(b, "/api/cases"))).cases[0].nickname, "B");
      assert.equal((await good(web(a, "/api/cases"))).cases[0].nickname, "A updated");
      assert.equal((await call(read.token, "list_cases")).cases.length, 1);
      assert.equal((await good(rpc(write.token, "tools/call", { name: "add_case", arguments: { receiptNumber: "BAD" } }))).result.isError, true);
    });
    await t.test("all stages expose only existing web tasks/dates/sources and no new eligibility assertions", async () => {
      for (const lifecycleStage of ["F1", "H1B", "GREEN_CARD", "LPR", "CITIZENSHIP"]) {
        await good(web(a, "/api/profile", "PUT", { lifecycleStage, admissionBasis: "FIXED_DATE", programEndDate: "2027-05-30", i94ExpirationDate: "2027-06-30", greenCardSince: "2020-01-01", greenCardExpirationDate: "2030-01-01", priorityDate: "2019-01-01", eadEndDate: "2027-02-28", passportExpirationDate: "2028-02-29" }));
        const plan = (await good(web(a, "/api/plan"))).plan;
        const actions = (await call(read.token, "get_action_plan")).actions;
        assert.equal(actions.length, plan.items.filter((item) => !item.completed).length);
        for (const action of actions) {
          const webItem = plan.items.find((item) => item.id === action.id);
          assert.deepEqual(Object.keys(action).sort(), ["dueDate", "id", "source", "status", "title"]);
          assert.equal(action.title, webItem.title); assert.equal(action.dueDate, webItem.dueDate); assert.deepEqual(action.source, webItem.source);
          assert.match(new URL(action.source.url).hostname, /^(www\.uscis\.gov|travel\.state\.gov)$/);
          assert.doesNotMatch(JSON.stringify(action), /you (are eligible|qualify|should file)|earliest filing date|legal advice is/i);
        }
      }
    });
    await t.test("session/Access users manage their own tokens; MCP bypasses only the web bridge", async (t) => {
      const access = accessFixture(t);
      const sessionEnv = { ...access.env, AUTH_MODE: "session", SESSION_SECRET: "s".repeat(64) };
      const jwt = { "Cf-Access-Jwt-Assertion": access.jwt({ email: a }) };
      const login = await web(null, "/auth/access", "GET", undefined, jwt, sessionEnv);
      assert.equal(login.status, 303);
      const cookie = login.headers.get("set-cookie").split(";")[0];
      const created = await good(web(b, "/api/agent-tokens", "POST", { label: "session token", scopes: "read" }, { ...jwt, cookie }, sessionEnv));
      assert.equal((await DB.prepare("SELECT owner FROM agent_tokens WHERE id=?").bind(created.agentToken.id).first()).owner, a);
      assert.equal((await web(a, "/api/agent-tokens", "GET", undefined, {}, sessionEnv)).status, 401);
      // No Access assertion/cookie is needed for a valid agent token.
      assert.ok((await good(rpc(created.token, "tools/list", {}, {}, sessionEnv))).result.tools.length);
      assert.equal((await web(a, "/api/profile", "GET", undefined, { authorization: `Bearer ${created.token}` }, sessionEnv)).status, 401);
      await good(web(null, `/api/agent-tokens?id=${created.agentToken.id}`, "DELETE", undefined, { ...jwt, cookie }, sessionEnv));
      assert.equal((await rpc(created.token, "tools/list", {}, {}, sessionEnv)).status, 401);
    });
  } finally { DB.close(); }
});
