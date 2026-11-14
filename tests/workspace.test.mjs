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
    await t.test("VISITOR profile renders plan with sourced actions, reopens extension action on I-94 date change, and stays isolated per profile", async () => {
      const visitor1 = (await json(a, "/api/profile", "POST", {
        displayName: "Visiting Parent A",
        lifecycleStage: "VISITOR",
        i94ExpirationDate: "2027-04-15",
        passportExpirationDate: "2029-10-01",
        visaExpirationDate: "2031-05-20",
      })).profile;
      const visitor2 = (await json(a, "/api/profile", "POST", {
        displayName: "Visiting Parent B",
        lifecycleStage: "VISITOR",
        i94ExpirationDate: "2027-08-01",
        passportExpirationDate: "2030-01-15",
      })).profile;
      assert.notEqual(visitor1.id, visitor2.id);

      let plan1 = (await json(a, `/api/plan?profileId=${encodeURIComponent(visitor1.id)}`)).plan;
      assert.equal(plan1.stageLabel, "Visitor (B1/B2)");
      assert.deepEqual(plan1.missingFields, []);
      assert.equal(plan1.items.length, 2);

      const i94Action = plan1.items.find((item) => item.id.startsWith("visitor-i94-end:"));
      const passportAction = plan1.items.find((item) => item.id.startsWith("universal-passport-expiry:"));
      assert.ok(i94Action);
      assert.equal(i94Action.id, "visitor-i94-end:2027-04-15");
      assert.equal(i94Action.dueDate, "2027-04-15");
      assert.match(i94Action.description, /I-539/);
      assert.equal(i94Action.source.url, "https://www.uscis.gov/visit-the-united-states/extend-your-stay");
      assert.ok(passportAction);
      assert.equal(passportAction.id, "universal-passport-expiry:2029-10-01");
      assert.equal(passportAction.dueDate, "2029-10-01");
      assert.match(new URL(passportAction.source.url).hostname, /^(www\.uscis\.gov|travel\.state\.gov)$/);

      // Completing visitor1's I-94 extension action does not affect visitor2 or primary profile
      await json(a, "/api/actions", "POST", { profileId: visitor1.id, actionKey: i94Action.id, completed: true });
      plan1 = (await json(a, `/api/plan?profileId=${encodeURIComponent(visitor1.id)}`)).plan;
      assert.equal(plan1.items.find((item) => item.id === i94Action.id).completed, true);

      const plan2 = (await json(a, `/api/plan?profileId=${encodeURIComponent(visitor2.id)}`)).plan;
      assert.equal(plan2.items.find((item) => item.id.startsWith("visitor-i94-end:")).dueDate, "2027-08-01");
      assert.equal(plan2.items.find((item) => item.id.startsWith("visitor-i94-end:")).completed, false);
      assert.equal((await json(a, "/api/plan")).plan.stageLabel, "H-1B / H-4");

      // Changing I-94 date on visitor1 reopens the extension action while keeping passport completion isolated
      await json(a, "/api/actions", "POST", { profileId: visitor1.id, actionKey: passportAction.id, completed: true });
      await json(a, "/api/profile", "PUT", {
        profileId: visitor1.id,
        displayName: "Visiting Parent A",
        lifecycleStage: "VISITOR",
        i94ExpirationDate: "2027-10-15",
        passportExpirationDate: "2029-10-01",
        visaExpirationDate: "2031-05-20",
      });
      plan1 = (await json(a, `/api/plan?profileId=${encodeURIComponent(visitor1.id)}`)).plan;
      const reopenedI94 = plan1.items.find((item) => item.id.startsWith("visitor-i94-end:"));
      assert.equal(reopenedI94.id, "visitor-i94-end:2027-10-15");
      assert.equal(reopenedI94.completed, false);
      assert.equal(plan1.items.find((item) => item.id === passportAction.id).completed, true);

      // Cases and documents stay isolated per VISITOR profile
      await json(a, "/api/cases", "POST", { profileId: visitor1.id, receiptNumber: "IOE9999999991", formType: "I-539", nickname: "Parent A extension" });
      assert.equal((await json(a, `/api/cases?profileId=${encodeURIComponent(visitor1.id)}`)).cases.length, 1);
      assert.equal((await json(a, `/api/cases?profileId=${encodeURIComponent(visitor2.id)}`)).cases.length, 0);
      assert.equal((await json(a, "/api/cases")).cases.length, 0);
    });
  } finally { await mf.dispose(); }
});
