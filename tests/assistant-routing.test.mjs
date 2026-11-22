// Regression tests for assistant keyword routing (broad-source audit items 6a/6b).
// Exercises POST /api/assistant through the built Worker + real SQLite, like extension-api.
import assert from "node:assert/strict";
import test from "node:test";
import { readdir, readFile } from "node:fs/promises";
import worker from "../dist/server/index.js";
import { sqliteD1 } from "./helpers/sqlite-d1.mjs";

test("assistant routing selects saved F-1 and LPR card actions", async (t) => {
  const DB = sqliteD1();
  const migrations = (await readdir(new URL("../drizzle/", import.meta.url))).filter((f) => f.endsWith(".sql")).sort();
  for (const name of migrations) DB.exec(await readFile(new URL(`../drizzle/${name}`, import.meta.url), "utf8"));
  const env = { DB, BUCKET: {}, ASSETS: { fetch: () => new Response("Not found", { status: 404 }) } };
  const ctx = { waitUntil() {}, passThroughOnException() {} };
  const web = (owner, path, method = "GET", body) => worker.fetch(new Request(`https://test.local${path}`, {
    method, headers: { "oai-authenticated-user-email": owner, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }), env, ctx);
  const ok = async (response) => { response = await response; assert.ok(response.ok, await response.clone().text()); return response.json(); };
  const owner = "routing@example.test";

  try {
    const f1 = (await ok(web(owner, "/api/profile", "PUT", {
      displayName: "Student", lifecycleStage: "F1", admissionBasis: "FIXED_DATE",
      programEndDate: "2027-06-01", i94ExpirationDate: "2027-07-01",
    }))).profile;
    const lpr = (await ok(web(owner, "/api/profile", "POST", {
      displayName: "Resident", lifecycleStage: "LPR",
      greenCardSince: "2020-01-01", greenCardExpirationDate: "2030-01-01",
    }))).profile;

    const planIds = async (profile) => (await ok(web(owner, `/api/plan?profileId=${profile.id}`))).plan.items.map((i) => i.id);
    const ask = (profile, question) => ok(web(owner, `/api/assistant?profileId=${profile.id}`, "POST", { question }));

    await t.test("6a: OPT question on F-1 profile returns program-end and I-94 actions", async () => {
      const ids = await planIds(f1);
      assert.ok(ids.some((id) => id.startsWith("f1-program-end:")), ids.join(","));
      assert.ok(ids.some((id) => id.startsWith("f1-i94-end:")), ids.join(","));
      assert.ok(!ids.some((id) => id.startsWith("ead-expiry")), "no EAD date saved");

      const reply = await ask(f1, "When should I apply for OPT?");
      assert.match(reply.answer, /^Based on your saved /);
      assert.match(reply.answer, /I-20 program end date is 2027-06-01/);
      assert.match(reply.answer, /I-94 authorized admission period ends is 2027-07-01/);
      assert.ok(reply.sources.length > 0, "selected actions carry their existing sources");
      assert.match(reply.limitations, /not an eligibility determination/);
    });

    await t.test("6b: green card renewal question on LPR profile returns card-expiry action", async () => {
      const ids = await planIds(lpr);
      assert.ok(ids.some((id) => id.startsWith("lpr-card-expiry:")), ids.join(","));

      const reply = await ask(lpr, "green card renewal");
      assert.match(reply.answer, /^Based on your saved /);
      assert.match(reply.answer, /Green Card expiration date is 2030-01-01/);
      assert.doesNotMatch(reply.answer, /naturalization/i, "N-400 review is not selected by this branch");
      assert.ok(reply.sources.length > 0);
    });
  } finally {
    DB.close();
  }
});
