import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const load = async (file) => {
  const source = await readFile(new URL(file, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
};
const { buildPlan } = await load("../lib/rules.ts");
const { calendarFile } = await load("../lib/calendar.ts");

const SOURCE = {
  label: "Department of State: Visa Bulletin",
  url: "https://travel.state.gov/content/travel/en/legal/visa-law0/visa-bulletin.html",
  ruleVersion: "Current monthly bulletin required",
};
const bulletin = (plan) => plan.items.find((item) => item.id.startsWith("gc-visa-bulletin:"));

test("gc-visa-bulletin with a saved priority date is a dateless general review", () => {
  const action = bulletin(buildPlan({ displayName: "Test", lifecycleStage: "GREEN_CARD", priorityDate: "2020-03-15" }));
  assert.ok(action);
  assert.equal(action.id, "gc-visa-bulletin:review");
  assert.equal(action.dueDate, null);
  assert.equal(action.title, "Review the current Visa Bulletin");
  assert.equal(action.description, "Your saved priority date is Mar 15, 2020. Open the official Visa Bulletin for a general review. This tracker does not collect preference category or chargeability country and does not check visa availability or filing eligibility.");
  assert.deepEqual(action.basis, ["Priority date: Mar 15, 2020"]);
  assert.deepEqual(action.source, SOURCE);
});

test("gc-visa-bulletin without a priority date is a dateless general review", () => {
  const plan = buildPlan({ displayName: "Test", lifecycleStage: "GREEN_CARD" });
  const action = bulletin(plan);
  assert.ok(action);
  assert.equal(action.id, "gc-visa-bulletin:review");
  assert.equal(action.dueDate, null);
  assert.equal(action.title, "Review the current Visa Bulletin");
  assert.equal(action.description, "Open the official Visa Bulletin for a general review. You can save a priority date in your profile, but this tracker does not collect preference category or chargeability country and does not check visa availability or filing eligibility.");
  assert.deepEqual(action.basis, ["Priority date missing"]);
  assert.deepEqual(action.source, SOURCE);
  assert.ok(plan.missingFields.includes("Priority date"));
});

test("gc-visa-bulletin completion uses the :review key", () => {
  const profile = { displayName: "Test", lifecycleStage: "GREEN_CARD", priorityDate: "2020-03-15" };
  assert.equal(bulletin(buildPlan(profile, ["gc-visa-bulletin:review"])).completed, true);
  assert.equal(bulletin(buildPlan(profile)).completed, false);
});

test("calendar export contains no dated event for gc-visa-bulletin", () => {
  for (const priorityDate of ["2020-03-15", undefined]) {
    const plan = buildPlan({ displayName: "Test", lifecycleStage: "GREEN_CARD", priorityDate });
    const ics = calendarFile(plan).replace(/\r\n /g, "");
    assert.ok(!ics.includes("gc-visa-bulletin"));
    assert.ok(!ics.includes("Visa Bulletin"));
  }
});
