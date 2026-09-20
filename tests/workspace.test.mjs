import assert from "node:assert/strict";
import test from "node:test";
import { Miniflare } from "miniflare";
import worker from "../dist/server/index.js";

test("saved workspace survives requests and stays isolated between accounts", async (t) => {
  const mf = new Miniflare({ modules: true, script: "export default { fetch() { return new Response('test'); } }", d1Databases: ["DB"], r2Buckets: ["BUCKET"] });
  try {
    const env = { DB: await mf.getD1Database("DB"), BUCKET: await mf.getR2Bucket("BUCKET"), ASSETS: { fetch: () => new Response("Not found", { status: 404 }) } };
    const call = async (owner, path, method = "GET", body) => {
      const headers = new Headers();
      if (owner) headers.set("oai-authenticated-user-email", owner);
      if (body && !(body instanceof FormData)) headers.set("content-type", "application/json");
      return worker.fetch(new Request(`http://localhost${path}`, { method, headers, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined }), env, { waitUntil() {}, passThroughOnException() {} });
    };
    const json = async (...args) => {
      const response = await call(...args);
      const value = await response.json();
      assert.ok(response.ok, JSON.stringify(value));
      assert.equal(response.headers.get("cache-control"), "private, no-store");
      return value;
    };
    const a = "pilot-a@example.test", b = "pilot-b@example.test";
    const profile = { displayName: "Pilot", lifecycleStage: "H1B", statusSubtype: "H1B", i94ExpirationDate: "2027-03-31" };
    await t.test("production does not grant anonymous access even on localhost", async () => {
      for (const path of ["/api/profile", "/api/plan", "/api/cases", "/api/documents"]) assert.equal((await call(null, path)).status, 401);
    });
    await t.test("profile save, reload, and impossible-date rejection", async () => {
      await json(a, "/api/profile", "PUT", profile);
      assert.equal((await json(a, "/api/profile")).profile.i94ExpirationDate, "2027-03-31");
      assert.equal((await json(b, "/api/profile")).profile, null);
      assert.equal((await call(a, "/api/profile", "PUT", { ...profile, i94ExpirationDate: "2027-02-30" })).status, 400);
      assert.equal((await json(a, "/api/profile")).profile.i94ExpirationDate, "2027-03-31");
    });
    await t.test("completion persists, reopens, and does not leak or survive a changed date", async () => {
      await json(b, "/api/profile", "PUT", profile);
      let plan = (await json(a, "/api/plan")).plan;
      const key = plan.items.find((item) => item.id.startsWith("h1b-i94-end:")).id;
      assert.equal((await call(a, "/api/actions", "POST", { actionKey: key, completed: "false" })).status, 400);
      assert.equal((await call(a, "/api/actions", "POST", { actionKey: "invented", completed: true })).status, 400);
      await json(a, "/api/actions", "POST", { actionKey: key, completed: true });
      assert.equal((await json(a, "/api/plan")).plan.items.find((item) => item.id === key).completed, true);
      assert.equal((await json(b, "/api/plan")).plan.items.find((item) => item.id === key).completed, false);
      await json(a, "/api/actions", "POST", { actionKey: key, completed: false });
      assert.equal((await json(a, "/api/plan")).plan.items.find((item) => item.id === key).completed, false);
      await json(a, "/api/actions", "POST", { actionKey: key, completed: true });
      await json(a, "/api/profile", "PUT", { ...profile, i94ExpirationDate: "2028-03-31" });
      plan = (await json(a, "/api/plan")).plan;
      assert.equal(plan.items.find((item) => item.id.startsWith("h1b-i94-end:")).completed, false);
      assert.equal((await call(a, "/api/actions", "POST", { actionKey: key, completed: true })).status, 400);
    });
    await t.test("case create/list/delete is owner-scoped", async () => {
      const item = (await json(a, "/api/cases", "POST", { receiptNumber: "IOE1234567890", nickname: "Test only" })).case;
      const updated = (await json(a, "/api/cases", "POST", { receiptNumber: "IOE1234567890", nickname: "Corrected label" })).case;
      assert.equal(updated.id, item.id);
      assert.equal(updated.nickname, "Corrected label");
      assert.equal((await json(b, "/api/cases")).cases.length, 0);
      await json(b, `/api/cases?id=${item.id}`, "DELETE");
      assert.equal((await json(a, "/api/cases")).cases.length, 1);
      await json(a, `/api/cases?id=${item.id}`, "DELETE");
      assert.equal((await json(a, "/api/cases")).cases.length, 0);
    });
    await t.test("files round-trip and another account cannot download or delete them", async () => {
      const form = new FormData();
      form.set("file", new File(["%PDF-1.4\nTest fixture only"], "fixture.pdf", { type: "application/pdf" }));
      const item = (await json(a, "/api/documents", "POST", form)).document;
      assert.equal((await json(b, "/api/documents")).documents.length, 0);
      assert.equal((await call(b, `/api/documents?download=${item.id}`)).status, 404);
      assert.equal((await call(b, `/api/documents?id=${item.id}`, "DELETE")).status, 404);
      assert.match(await (await call(a, `/api/documents?download=${item.id}`)).text(), /Test fixture only/);
      await json(a, `/api/documents?id=${item.id}`, "DELETE");
      assert.equal((await call(a, `/api/documents?download=${item.id}`)).status, 404);
    });
  } finally { await mf.dispose(); }
});
