import assert from "node:assert/strict";
import test from "node:test";
import { createHmac, randomUUID } from "node:crypto";
import { Miniflare } from "miniflare";
import worker from "../dist/server/index.js";
import { accessFixture } from "./helpers/access.mjs";

test("session auth mode rejects spoofed headers and honors signed sessions", async (t) => {
  const access = accessFixture(t);
  const mf = new Miniflare({ modules: true, script: "export default { fetch() { return new Response('test'); } }", d1Databases: ["DB"], r2Buckets: ["BUCKET"] });
  try {
    const secret = "a".repeat(64);
    const env = {
      ...access.env,
      DB: await mf.getD1Database("DB"),
      BUCKET: await mf.getR2Bucket("BUCKET"),
      ASSETS: { fetch: () => new Response("Not found", { status: 404 }) },
      AUTH_MODE: "session",
      SESSION_SECRET: secret,
    };
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS sessions (id text PRIMARY KEY NOT NULL, owner text NOT NULL, expires_at text NOT NULL, created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL)").run();

    const call = async (headers, path, method = "GET", body) => {
      const h = new Headers({ "Cf-Access-Jwt-Assertion": access.jwt({ email: "session-owner@example.test" }), ...headers });
      if (body && !(body instanceof FormData)) h.set("content-type", "application/json");
      return worker.fetch(new Request(`http://localhost${path}`, { method, headers: h, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined }), env, { waitUntil() {}, passThroughOnException() {} });
    };

    const sign = (id) => `${id}.${createHmac("sha256", secret).update(id).digest("base64url")}`;
    const insert = (id, owner, expiresAt) => env.DB.prepare("INSERT INTO sessions (id, owner, expires_at) VALUES (?, ?, ?)").bind(id, owner, expiresAt).run();

    await t.test("spoofed identity header is rejected", async () => {
      assert.equal((await call({ "oai-authenticated-user-email": "spoof@example.test" }, "/api/profile")).status, 401);
      assert.equal((await call({ "oai-authenticated-user-email": "spoof@example.test" }, "/api/plan")).status, 401);
    });

    await t.test("anonymous request is rejected", async () => {
      assert.equal((await call({}, "/api/profile")).status, 401);
    });

    await t.test("tampered signature is rejected even with a real session id", async () => {
      const id = randomUUID();
      await insert(id, "owner@example.test", new Date(Date.now() + 3600_000).toISOString());
      assert.equal((await call({ cookie: `immigrant_session=${id}.${sign("other-id")}` }, "/api/profile")).status, 401);
    });

    await t.test("valid session is scoped to its owner", async () => {
      const id = randomUUID();
      const owner = "session-owner@example.test";
      await insert(id, owner, new Date(Date.now() + 3600_000).toISOString());
      const cookie = { cookie: `immigrant_session=${sign(id)}` };

      const empty = await (await call(cookie, "/api/profile")).json();
      assert.equal(empty.profile, null);

      const save = await call(cookie, "/api/profile", "PUT", { displayName: "S", lifecycleStage: "H1B", statusSubtype: "H1B", i94ExpirationDate: "2027-03-31" });
      assert.equal(save.status, 200);
      assert.equal((await (await call(cookie, "/api/profile")).json()).profile.i94ExpirationDate, "2027-03-31");

      const other = randomUUID();
      await insert(other, "other@example.test", new Date(Date.now() + 3600_000).toISOString());
      assert.equal((await (await call({ cookie: `immigrant_session=${sign(other)}`, "Cf-Access-Jwt-Assertion": access.jwt({ email: "other@example.test" }) }, "/api/profile")).json()).profile, null);
    });

    await t.test("expired session is rejected", async () => {
      const id = randomUUID();
      await insert(id, "expired@example.test", new Date(Date.now() - 1).toISOString());
      assert.equal((await call({ cookie: `immigrant_session=${sign(id)}` }, "/api/profile")).status, 401);
    });
  } finally { await mf.dispose(); }
});
