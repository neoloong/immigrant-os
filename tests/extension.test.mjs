import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../lib/extension.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const ext = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);

test("timeline reproduces the real 2024 approved case and the 2026 draft dates", () => {
  // 2024: I-94 09/08/2024, requested and approved until 03/08/2025.
  const t2024 = ext.buildExtensionTimeline("2024-09-08", null, "2024-07-13");
  assert.equal(t2024.requestedUntilDate, "2025-03-08");
  assert.equal(t2024.recommendedFileByDate, "2024-07-25");
  assert.equal(t2024.phase, "suggested-window"); // filed 2024-07-13

  // 2026: I-94 2027-01-06 → 45-day line 2026-11-22, requested 2027-07-06.
  const t = ext.buildExtensionTimeline("2027-01-06", null, "2026-11-19");
  assert.equal(t.recommendedFileByDate, "2026-11-22");
  assert.equal(t.deadlineDate, "2027-01-06");
  assert.equal(t.earliestSuggestedFileDate, "2026-07-06");
  assert.equal(t.requestedUntilDate, "2027-07-06");
  assert.equal(t.requestedUntilIsDefault, true);
  assert.equal(t.savedRequestedUntilIgnored, false);
  assert.deepEqual(t.dates.map((d) => d.id), ["earliest-suggested", "recommended-file-by", "deadline", "requested-until"]);
  assert.equal(t.dates.find((d) => d.id === "recommended-file-by").daysFromToday, 3);
  assert.equal(t.dates.find((d) => d.id === "deadline").daysFromToday, 48);
});

test("date arithmetic handles month ends, leap years and year boundaries", () => {
  assert.equal(ext.defaultRequestedUntil("2026-08-31"), "2027-02-28");
  assert.equal(ext.defaultRequestedUntil("2027-08-31"), "2028-02-29");
  assert.equal(ext.addDays("2027-02-14", -45), "2026-12-31");
  assert.equal(ext.addDays("2028-04-14", -45), "2028-02-29");
  assert.equal(ext.daysBetween("2026-12-31", "2027-01-01"), 1);
  assert.throws(() => ext.buildExtensionTimeline("2027-02-30"), /Invalid date/);
  assert.throws(() => ext.buildExtensionTimeline("01/06/2027"), /Invalid date/);
});

test("phase is a neutral date comparison", () => {
  const phase = (today) => ext.buildExtensionTimeline("2027-01-06", null, today).phase;
  assert.equal(phase("2026-07-05"), "before-suggested-window");
  assert.equal(phase("2026-07-06"), "suggested-window");
  assert.equal(phase("2026-11-22"), "suggested-window");
  assert.equal(phase("2026-11-23"), "after-recommended-date");
  assert.equal(phase("2027-01-06"), "after-recommended-date");
  assert.equal(phase("2027-01-07"), "after-i94-date");
});

test("requested-until is user-editable, validated, and stale values fall back to the default", () => {
  assert.equal(ext.buildExtensionTimeline("2027-01-06", "2027-05-01", "2026-11-19").requestedUntilDate, "2027-05-01");
  assert.equal(ext.buildExtensionTimeline("2027-01-06", "2027-05-01", "2026-11-19").requestedUntilIsDefault, false);
  const stale = ext.buildExtensionTimeline("2027-01-06", "2025-03-08", "2026-11-19");
  assert.equal(stale.requestedUntilDate, "2027-07-06");
  assert.equal(stale.savedRequestedUntilIgnored, true);
  assert.equal(ext.validateRequestedUntil("2027-01-06", "2027-07-06"), "2027-07-06");
  assert.throws(() => ext.validateRequestedUntil("2027-01-06", "2027-01-06"), /after the I-94/);
  assert.throws(() => ext.validateRequestedUntil("2027-01-06", "2027-13-01"), /YYYY-MM-DD/);
  assert.throws(() => ext.validateRequestedUntil("2027-01-06", 20270706), /YYYY-MM-DD/);
});

test("checklist mirrors the real case structure with round-scoped completion keys", () => {
  const input = { statusSubtype: "B2", i94ExpirationDate: "2027-01-06", requestedUntilDate: "2027-07-06" };
  const list = ext.buildExtensionChecklist(input, ["i539:2027-01-06:account-ready", "i539:2024-09-08:doc-passport"]);
  const ids = list.map((item) => item.itemId);
  for (const id of ["account-ready", "form-basis", "form-reason", "form-requested-until", "statement-letter", "doc-passport", "doc-visa", "doc-i94", "doc-prior-approval", "preparer", "interpreter", "fee-check"]) {
    assert.ok(ids.includes(id), id);
  }
  assert.equal(new Set(list.map((i) => i.id)).size, list.length);
  assert.ok(list.every((item) => item.id === `i539:2027-01-06:${item.itemId}`));
  assert.equal(list.find((i) => i.itemId === "account-ready").completed, true);
  assert.equal(list.find((i) => i.itemId === "doc-passport").completed, false, "a previous round's record does not carry over");
  assert.match(list.find((i) => i.itemId === "form-basis").title, /B-2/);
  assert.match(list.find((i) => i.itemId === "form-requested-until").title, /2027-07-06/);
  for (const id of ["doc-prior-approval", "preparer", "interpreter"]) assert.equal(list.find((i) => i.itemId === id).optional, true);
  assert.match(list.find((i) => i.itemId === "statement-letter").detail, /financially support/);
  assert.deepEqual(ext.extensionChecklistKeys("2027-01-06"), list.map((i) => i.id));
});

test("compliance: official sources everywhere, no fee amount, no determinations", () => {
  const helper = ext.buildExtensionHelper({ lifecycleStage: "VISITOR", statusSubtype: "B2", i94ExpirationDate: "2027-01-06" }, [], "2026-11-19");
  assert.equal(helper.available, true);
  assert.equal(helper.disclaimer, "Draft — review carefully before use. This is not legal advice.");
  const cited = [...helper.timeline.dates, ...helper.checklist].map((x) => x.source);
  for (const source of cited) assert.equal(new URL(source.url).hostname, "www.uscis.gov");
  const urls = new Set(cited.map((s) => s.url));
  assert.ok(urls.has("https://www.uscis.gov/i-539"));
  assert.ok(urls.has("https://www.uscis.gov/sites/default/files/document/forms/i-539instr.pdf"));
  const fee = helper.checklist.find((i) => i.itemId === "fee-check");
  assert.equal(fee.source.url, "https://www.uscis.gov/i-539");
  const text = JSON.stringify(helper);
  assert.doesNotMatch(text, /\$\s?\d/, "no hardcoded fee amount");
  assert.doesNotMatch(text, /you (are|may be) eligible|you qualify|will be approved|guarantee/i);
  assert.deepEqual(helper.progress, { done: 0, total: 13, requiredDone: 0, requiredTotal: 10 });
});

test("helper is only available for visitor profiles with an I-94 date", () => {
  assert.equal(ext.buildExtensionHelper({ lifecycleStage: "F1", i94ExpirationDate: "2027-01-06" }).reason, "not-visitor");
  assert.equal(ext.buildExtensionHelper({ lifecycleStage: "VISITOR", i94ExpirationDate: null }).reason, "missing-i94");
});
