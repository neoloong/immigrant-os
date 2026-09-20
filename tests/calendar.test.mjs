import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../lib/calendar.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { calendarFile } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);

test("calendar is an all-day snapshot of open dated actions with safe UTF-8 folding", () => {
  const base = { id: "ead:2028-02-29", dueDate: "2028-02-29", title: "Date, review; needed", description: "文件".repeat(60) + "\nReview", source: { url: "https://www.uscis.gov/" }, completed: false };
  const value = calendarFile({ items: [base, { ...base, id: "done", completed: true }, { ...base, id: "no-date", dueDate: null }] });
  const unfolded = value.replace(/\r\n /g, "");
  assert.equal((value.match(/BEGIN:VEVENT/g) ?? []).length, 1);
  assert.match(unfolded, /DTSTART;VALUE=DATE:20280229\r\nDTEND;VALUE=DATE:20280301/);
  assert.ok(unfolded.includes("SUMMARY:Date\\, review\\; needed"));
  assert.ok(unfolded.includes("\\nReview"));
  assert.ok(value.split("\r\n").every((line) => Buffer.byteLength(line) <= 75));
});
