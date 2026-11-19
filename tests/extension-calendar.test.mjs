import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const load = async (path) => {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
};
const { calendarFile } = await load("../lib/calendar.ts");
const ext = await load("../lib/extension.ts");

const unfold = (ics) => ics.replace(/\r\n /g, "");
const events = (ics) => unfold(ics).split("BEGIN:VEVENT").slice(1);
const planItem = { id: "visitor-i94-end:2027-01-06", dueDate: "2027-01-06", title: "I-94 admit-until date", description: "Plan item", source: { url: "https://www.uscis.gov/i-539" }, completed: false };

test("visitor export adds the I-539 recommended file-by and stay-ends dates as all-day sourced events", () => {
  const extra = ext.extensionCalendarEvents({ lifecycleStage: "VISITOR", statusSubtype: "B2", i94ExpirationDate: "2027-01-06" });
  assert.deepEqual(extra.map((e) => [e.id, e.dueDate]), [["i539-recommended-file-by:2026-11-22", "2026-11-22"], ["i539-deadline:2027-01-06", "2027-01-06"]]);
  const ics = calendarFile({ items: [planItem] }, extra);
  const all = events(ics);
  assert.equal(all.length, 3);
  const fileBy = all.find((e) => e.includes("UID:i539-recommended-file-by"));
  assert.match(fileBy, /DTSTART;VALUE=DATE:20261122\r\nDTEND;VALUE=DATE:20261123/);
  assert.match(fileBy, /SUMMARY:Form I-539: recommended file-by date \(45 days before I-94 date\)/);
  assert.match(fileBy, /45 days before your I-94 date/);
  assert.match(fileBy, /Source: USCIS: Extend Your Stay/);
  assert.ok(fileBy.includes("https://www.uscis.gov/visit-the-united-states/extend-your-stay"));
  const deadline = all.find((e) => e.includes("UID:i539-deadline"));
  assert.match(deadline, /DTSTART;VALUE=DATE:20270106\r\nDTEND;VALUE=DATE:20270107/);
  assert.match(deadline, /SUMMARY:Form I-539: I-94 admit-until date — authorized stay ends/);
  assert.match(deadline, /Source: USCIS: Form I-539 Instructions/);
  assert.ok(deadline.includes("https://www.uscis.gov/sites/default/files/document/forms/i-539instr.pdf"));
  for (const event of [fileBy, deadline]) {
    assert.match(event, /Not legal advice or an eligibility determination/);
    assert.doesNotMatch(event, /you (are eligible|qualify)|\$\d/i);
  }
  assert.ok(ics.split("\r\n").every((line) => Buffer.byteLength(line) <= 75));
  // Year boundary / leap day arithmetic flows through.
  assert.equal(ext.extensionCalendarEvents({ lifecycleStage: "VISITOR", i94ExpirationDate: "2028-04-14" })[0].dueDate, "2028-02-29");
});

test("extension events still export when the plan's I-94 action is completed", () => {
  const extra = ext.extensionCalendarEvents({ lifecycleStage: "VISITOR", i94ExpirationDate: "2027-01-06" });
  assert.equal(events(calendarFile({ items: [{ ...planItem, completed: true }] }, extra)).length, 2);
});

test("non-visitor and visitor-without-I-94 exports are unchanged", () => {
  const items = [{ ...planItem, id: "h1b-i94-end:2027-01-06" }];
  for (const profile of [
    { lifecycleStage: "H1B", i94ExpirationDate: "2027-01-06" },
    { lifecycleStage: "F1", i94ExpirationDate: "2027-01-06" },
    { lifecycleStage: "VISITOR", i94ExpirationDate: null },
    { lifecycleStage: "VISITOR", i94ExpirationDate: "2027-02-30" },
  ]) {
    const extra = ext.extensionCalendarEvents(profile);
    assert.deepEqual(extra, []);
    const strip = (ics) => ics.replace(/DTSTAMP:\d+T\d+Z/g, "");
    assert.equal(strip(calendarFile({ items }, extra)), strip(calendarFile({ items })));
  }
});
