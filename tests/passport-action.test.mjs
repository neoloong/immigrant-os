import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../lib/rules.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { buildPlan } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);

test("passport action preserves its saved date and scopes its source to visitor-visa background", () => {
  for (const lifecycleStage of ["F1", "H1B", "VISITOR", "GREEN_CARD", "LPR", "CITIZENSHIP"]) {
    const plan = buildPlan({ displayName: "Test", lifecycleStage, passportExpirationDate: "2029-10-01" });
    const action = plan.items.find((item) => item.id.startsWith("universal-passport-expiry:"));
    assert.ok(action, lifecycleStage);
    assert.equal(action.id, "universal-passport-expiry:2029-10-01");
    assert.equal(action.title, "Saved passport expiration date");
    assert.equal(action.description, "This is the passport-expiration date you entered. Review renewal information from your passport's issuing authority and check your travel documents before a trip. This tracker does not check renewal or admission requirements. The linked Department of State page is background information for U.S. visitor visas only.");
    assert.equal(action.dueDate, "2029-10-01");
    assert.equal(action.severity, "important");
    assert.equal(action.confidence, "needs-review");
    assert.deepEqual(action.source, {
      label: "Department of State: U.S. visitor visas (background only)",
      url: "https://travel.state.gov/content/travel/en/us-visas/tourism-visit/visitor.html",
      ruleVersion: "Not passport-renewal guidance",
    });
  }
});
