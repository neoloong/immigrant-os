import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../lib/rules.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { buildPlan } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);

const expectedSource = {
  label: "Department of State: Visa expiration and admission records",
  url: "https://travel.state.gov/content/travel/en/us-visas/visa-information-resources/visa-expiration-date.html",
  ruleVersion: "Background reference; reminder timing is an app preference",
};

for (const statusSubtype of ["H1B", "H4"]) {
  test(`${statusSubtype}: saved-I-94 actions use audited wording and visa-expiration background source`, () => {
    const plan = buildPlan({ displayName: "Test", lifecycleStage: "H1B", statusSubtype, i94ExpirationDate: "2027-08-31" });

    const planning = plan.items.find((item) => item.id.startsWith("h1b-extension-planning:"));
    assert.ok(planning);
    assert.equal(planning.id, "h1b-extension-planning:2027-02-28");
    assert.equal(planning.dueDate, "2027-02-28", "six months before the saved I-94 date (clamped to month end)");
    assert.equal(planning.title, "Review your saved I-94 date");
    assert.equal(planning.description, "Immigrant OS sets this planning reminder six months before the I-94 date you entered. This is an app preference, not a USCIS filing window or deadline. Discuss next steps with qualified counsel; involve your employer for employment-related questions.");
    assert.deepEqual(planning.basis, ["Saved I-94 date: Aug 31, 2027", "App planning preference: six months before the saved date"]);
    assert.equal(planning.severity, "important");
    assert.equal(planning.confidence, "preliminary");
    assert.deepEqual(planning.source, expectedSource);

    const end = plan.items.find((item) => item.id.startsWith("h1b-i94-end:"));
    assert.ok(end);
    assert.equal(end.id, "h1b-i94-end:2027-08-31");
    assert.equal(end.dueDate, "2027-08-31");
    assert.equal(end.title, "Saved I-94 admit-until date");
    assert.equal(end.description, "This is the I-94 date you entered. Review your latest I-94 and any USCIS notices with qualified counsel. This tracker does not determine your authorized stay.");
    assert.deepEqual(end.basis, ["I-94 admit-until date: Aug 31, 2027"]);
    assert.equal(end.severity, "critical");
    assert.equal(end.confidence, "needs-review");
    assert.deepEqual(end.source, expectedSource);
  });
}

test("H1B planning reminder is exactly six months before the saved I-94 date", () => {
  const plan = buildPlan({ displayName: "Test", lifecycleStage: "H1B", statusSubtype: "H1B", i94ExpirationDate: "2027-01-15" });
  assert.equal(plan.items.find((item) => item.id.startsWith("h1b-extension-planning:")).dueDate, "2026-07-15");
});
