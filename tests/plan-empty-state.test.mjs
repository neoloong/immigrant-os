// Regression tests for the "to-be-filled" plan state (reconciled from WIP f368998).
// The Plan view lists plan.missingFields verbatim ("Add your dates to see your plan")
// instead of showing a blank or misleading plan, so each stage must name the exact
// date to enter and must not invent dated actions while that date is missing.
import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../lib/rules.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { buildPlan } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);

const blank = (lifecycleStage, extra = {}) => ({ displayName: "Test", lifecycleStage, ...extra });

test("blank profiles name the specific date to enter for every stage", () => {
  const expected = {
    F1: ["Program end date from Form I-20", "I-94 admission basis (D/S or fixed date)"],
    H1B: ["Most recent I-94 admit-until date"],
    VISITOR: ["I-94 admit-until date"],
    GREEN_CARD: ["Priority date"],
    LPR: ["Resident since date", "Green Card expiration date"],
    CITIZENSHIP: ["Resident since date"],
  };
  for (const [stage, fields] of Object.entries(expected)) {
    const plan = buildPlan(blank(stage));
    assert.deepEqual(plan.missingFields, fields, stage);
    assert.match(plan.summary, /needed to complete your timeline/, stage);
  }
});

test("missing dates never produce fabricated dated actions", () => {
  for (const stage of ["F1", "H1B", "VISITOR", "LPR", "CITIZENSHIP"]) {
    const plan = buildPlan(blank(stage));
    assert.deepEqual(plan.items, [], `${stage} should show the to-be-filled state, not a plan`);
  }
  // Green-card stage keeps its undated/general items, but none uses a made-up personal date.
  const gc = buildPlan(blank("GREEN_CARD"));
  assert.ok(gc.items.length > 0);
  for (const item of gc.items) {
    assert.ok(item.source.url.startsWith("https://"), `${item.id} cites an official source`);
    assert.ok(!item.basis.some((b) => /Priority date: /.test(b)), `${item.id} does not invent a priority date`);
  }
});

test("F1 fixed-date admission asks for the I-94 date, D/S does not", () => {
  const fixed = buildPlan(blank("F1", { programEndDate: "2027-05-15", admissionBasis: "FIXED_DATE" }));
  assert.deepEqual(fixed.missingFields, ["I-94 admit-until date"]);
  assert.ok(!fixed.items.some((item) => item.id.startsWith("f1-i94-end")));

  const ds = buildPlan(blank("F1", { programEndDate: "2027-05-15", admissionBasis: "DS_TRANSITION" }));
  assert.deepEqual(ds.missingFields, []);
});

test("filling the named date clears it and produces a sourced action", () => {
  const plan = buildPlan(blank("VISITOR", { i94ExpirationDate: "2027-01-06" }));
  assert.deepEqual(plan.missingFields, []);
  const item = plan.items.find((i) => i.id.startsWith("visitor-i94-end"));
  assert.ok(item);
  assert.equal(item.dueDate, "2027-01-06");
  assert.match(item.source.url, /^https:\/\/www\.uscis\.gov\//);
});
