import assert from "node:assert/strict";
import test from "node:test";
import { readdir, readFile } from "node:fs/promises";
import worker from "../dist/server/index.js";
import { sqliteD1 } from "./helpers/sqlite-d1.mjs";

// Built Worker + real SQLite with every production migration applied.
test("extension helper API: timeline, editable requested-until, per-profile checklist", async (t) => {
  const DB = sqliteD1();
  const migrations = (await readdir(new URL("../drizzle/", import.meta.url))).filter((f) => f.endsWith(".sql")).sort();
  assert.ok(migrations.includes("0004_extension_requested_until.sql"));
  for (const name of migrations) DB.exec(await readFile(new URL(`../drizzle/${name}`, import.meta.url), "utf8"));
  const env = { DB, BUCKET: {}, ASSETS: { fetch: () => new Response("Not found", { status: 404 }) } };
  const ctx = { waitUntil() {}, passThroughOnException() {} };
  const web = (owner, path, method = "GET", body) => worker.fetch(new Request(`https://test.local${path}`, {
    method, headers: { "oai-authenticated-user-email": owner, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }), env, ctx);
  const ok = async (response) => { response = await response; assert.ok(response.ok, await response.clone().text()); return response.json(); };
  const a = "ext-a@example.test", b = "ext-b@example.test";

  try {
    const primary = (await ok(web(a, "/api/profile", "PUT", { displayName: "Me", lifecycleStage: "H1B", i94ExpirationDate: "2028-01-01" }))).profile;
    const mom = (await ok(web(a, "/api/profile", "POST", { displayName: "Mom", lifecycleStage: "VISITOR", statusSubtype: "B2", i94ExpirationDate: "2027-01-06" }))).profile;
    const q = `?profileId=${encodeURIComponent(mom.id)}`;

    await t.test("GET computes dates from the saved I-94 date", async () => {
      const { profileId, extension } = await ok(web(a, `/api/extension${q}`));
      assert.equal(profileId, mom.id);
      assert.equal(extension.available, true);
      assert.equal(extension.timeline.recommendedFileByDate, "2026-11-22");
      assert.equal(extension.timeline.deadlineDate, "2027-01-06");
      assert.equal(extension.timeline.requestedUntilDate, "2027-07-06");
      assert.equal(extension.timeline.requestedUntilIsDefault, true);
      assert.equal(extension.checklist.length, 13);
      assert.match(extension.disclaimer, /not legal advice/);
    });

    await t.test("non-visitor and missing profiles", async () => {
      assert.equal((await ok(web(a, `/api/extension?profileId=${primary.id}`))).extension.reason, "not-visitor");
      assert.equal((await web(a, "/api/extension?profileId=nope")).status, 404);
      assert.equal((await web(b, `/api/extension${q}`)).status, 404, "other owners cannot read it");
      assert.equal((await web(a, `/api/extension?profileId=${primary.id}`, "PUT", { requestedUntil: "2028-06-01" })).status, 400);
    });

    await t.test("requested-until is editable, validated, and survives ordinary profile saves", async () => {
      for (const bad of ["2027-01-06", "2026-12-01", "07/06/2027", 5, {}]) {
        assert.equal((await web(a, `/api/extension${q}`, "PUT", { requestedUntil: bad })).status, 400, JSON.stringify(bad));
      }
      assert.equal((await web(a, `/api/extension${q}`, "PUT", {})).status, 400);
      assert.equal((await web(b, `/api/extension${q}`, "PUT", { requestedUntil: "2027-05-01" })).status, 404);
      const saved = await ok(web(a, `/api/extension${q}`, "PUT", { requestedUntil: "2027-05-01" }));
      assert.equal(saved.extension.timeline.requestedUntilDate, "2027-05-01");
      assert.equal(saved.extension.timeline.requestedUntilIsDefault, false);
      await ok(web(a, `/api/profile${q}`, "PUT", { displayName: "Mom", lifecycleStage: "VISITOR", statusSubtype: "B2", i94ExpirationDate: "2027-01-06", passportExpirationDate: "2030-01-01" }));
      assert.equal((await ok(web(a, `/api/extension${q}`))).extension.timeline.requestedUntilDate, "2027-05-01");
      const cleared = await ok(web(a, `/api/extension${q}`, "PUT", { requestedUntil: null }));
      assert.equal(cleared.extension.timeline.requestedUntilDate, "2027-07-06");
      assert.equal(cleared.extension.timeline.requestedUntilIsDefault, true);
    });

    await t.test("checklist items toggle through /api/actions and are scoped to profile and I-94 round", async () => {
      const key = "i539:2027-01-06:statement-letter";
      await ok(web(a, `/api/actions${q}`, "POST", { actionKey: key, completed: true }));
      let ext = (await ok(web(a, `/api/extension${q}`))).extension;
      assert.equal(ext.checklist.find((i) => i.id === key).completed, true);
      assert.equal(ext.progress.done, 1);
      // Plan items still work and checklist keys do not leak into the plan.
      const plan = (await ok(web(a, `/api/plan${q}`))).plan;
      assert.ok(plan.items.every((item) => !item.id.startsWith("i539:")));
      // Unknown keys, other rounds and non-visitor profiles are rejected.
      assert.equal((await web(a, `/api/actions${q}`, "POST", { actionKey: "i539:2027-01-06:bogus", completed: true })).status, 400);
      assert.equal((await web(a, `/api/actions${q}`, "POST", { actionKey: "i539:2026-01-06:statement-letter", completed: true })).status, 400);
      assert.equal((await web(a, `/api/actions?profileId=${primary.id}`, "POST", { actionKey: key, completed: true })).status, 400);
      // Reopen.
      await ok(web(a, `/api/actions${q}`, "POST", { actionKey: key, completed: false }));
      assert.equal((await ok(web(a, `/api/extension${q}`))).extension.progress.done, 0);
      // A new I-94 date starts a fresh round; a stale requested-until is ignored.
      await ok(web(a, `/api/actions${q}`, "POST", { actionKey: key, completed: true }));
      await ok(web(a, `/api/extension${q}`, "PUT", { requestedUntil: "2027-05-01" }));
      await ok(web(a, `/api/profile${q}`, "PUT", { displayName: "Mom", lifecycleStage: "VISITOR", statusSubtype: "B2", i94ExpirationDate: "2027-07-06" }));
      ext = (await ok(web(a, `/api/extension${q}`))).extension;
      assert.equal(ext.progress.done, 0);
      assert.ok(ext.checklist.every((i) => i.id.startsWith("i539:2027-07-06:")));
      assert.equal(ext.timeline.requestedUntilDate, "2028-01-06");
      assert.equal(ext.timeline.savedRequestedUntilIgnored, true);
    });
  } finally {
    DB.close();
  }
});
