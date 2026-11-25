import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../lib/rules.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { buildPlan } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);

test("gc-case-receipts is an organization suggestion citing official case-status guidance", () => {
  const plan = buildPlan({ displayName: "Test", lifecycleStage: "GREEN_CARD" });
  const action = plan.items.find((item) => item.id.startsWith("gc-case-receipts:"));
  assert.ok(action);
  assert.equal(action.id, "gc-case-receipts:review");
  assert.equal(action.title, "Track the USCIS receipts you already have");
  assert.equal(action.description, "Add each receipt you want to track as a separate case in this app. This is an organization suggestion, not a list of forms to file. Use the official case-status guidance to check a receipt with USCIS.");
  assert.equal(action.dueDate, null);
  assert.deepEqual(action.basis, ["Green-card journey selected"]);
  assert.deepEqual(action.source, {
    label: "USAGov: Check immigration case status",
    url: "https://www.usa.gov/immigration-case-status",
    ruleVersion: "Official case-status guidance",
  });
});
