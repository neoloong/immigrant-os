import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../lib/extension-letter.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const letter = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);

// Facts as a user would enter them for the 2026 round of the family's case
// (structure mirrors the approved 2024 written statement).
const facts = {
  ...letter.emptyStatementInput(),
  applicantName: "Yingzhen You",
  address: "40178 Michelle Street\nFremont, CA 94538",
  email: "applicant@example.test",
  phone: "555-0100",
  letterDate: "2026-12-01",
  visitorClass: "B-2",
  arrivalDate: "2026-07-07",
  visiting: "my daughter and her family",
  i94ExpirationDate: "2027-01-06",
  requestedUntilDate: "2027-07-06",
  departureDate: "2027-07-06",
  themes: ["childcare"],
  childcareDetails: "My daughter has two young children, born in May 2024 and March 2026. My son-in-law is employed full-time and is not able to provide care during working hours",
  temporaryDetails: "I also need to return home to take care of my own parents, who are in their 80s.",
  homeSituation: "retired",
};

test("letter follows the approved three-part structure, built only from entered facts", () => {
  const text = letter.buildStatementLetter(facts);
  const order = [
    "Yingzhen You\n40178 Michelle Street\nFremont, CA 94538\napplicant@example.test\n555-0100",
    "December 1, 2026",
    "U.S. Citizenship and Immigration Services",
    "Subject: Request for Extension of Stay as B-2 Visitor",
    "Dear Sir/Madam,",
    "I arrived in the United States on July 7, 2026 to visit my daughter and her family. My current I-94 expires on January 6, 2027. I am requesting an extension until July 6, 2027 for the following reasons:",
    "1. Reasons for Request for Extension or Change: My daughter has two young children",
    "during working hours.",
    "2. Reasons Why Extended Stay Would Be Temporary: My intention is to remain in the United States only for the time needed to help my family while the children are young. I plan to return to my home country by July 6, 2027. I also need to return home",
    "3. Effect of Extended Stay on Foreign Employment or Residency: My extended stay in the United States will have minimal impact on my employment or residency in my home country, as I am currently retired.",
    "I kindly request that you consider my situation and grant me an extension of stay as a B-2 visitor.",
    "Thank you for your time and consideration.",
    "Sincerely,\nYingzhen You\n",
  ];
  let at = -1;
  for (const piece of order) {
    const next = text.indexOf(piece, at + 1);
    assert.ok(next > at, `missing or out of order: ${piece}\n---\n${text}`);
    at = next;
  }
  assert.doesNotMatch(text, /^4\./m, "no fourth part unless the user fills it in");
  assert.deepEqual(letter.letterPlaceholders(text), []);
  assert.doesNotMatch(text, /legal advice|eligib|\$\d/i);
});

test("missing facts become placeholders, never invented text", () => {
  const text = letter.buildStatementLetter({ ...letter.emptyStatementInput(), i94ExpirationDate: "2027-01-06" });
  const holes = letter.letterPlaceholders(text);
  for (const expected of ["[Your full name]", "[Your mailing address]", "[Date]", "[arrival date]", "[requested-until date]", "[planned departure date]", "[Choose at least one reason and describe it]"]) {
    assert.ok(holes.includes(expected), expected);
  }
  assert.match(text, /January 6, 2027/);
  assert.doesNotMatch(text, / to visit /, "no visit clause without a person");
  // Picking a theme without details leaves a theme-specific placeholder.
  const picked = letter.buildStatementLetter({ ...facts, themes: ["family-support", "other"], familySupportDetails: "", otherReason: "" });
  assert.match(picked, /\[Describe the support you are giving your family and why it is needed now\] \[Describe your reason\]/);
  assert.match(picked, /only for the time needed to support my family as described above/);
});

test("employment and financial-support parts use only the user's words", () => {
  const employed = letter.buildStatementLetter({ ...facts, homeSituation: "employed", homeDetails: "" });
  assert.match(employed, /3\. Effect .*: I am currently employed in my home country\. \[Describe your job/);
  const other = letter.buildStatementLetter({ ...facts, homeSituation: "other", homeDetails: "" });
  assert.match(other, /3\. Effect .*: \[Describe how the extended stay affects/);
  const funded = letter.buildStatementLetter({ ...facts, financialSupport: "My daughter's family provides my housing and I use my own savings" });
  assert.match(funded, /\n4\. Financial Support During the Extended Stay: My daughter's family provides my housing and I use my own savings\.\n/);
  const prior = letter.buildStatementLetter({ ...facts, previousStays: "USCIS approved my previous extension (Receipt Number MCT0000000000), and I departed on time." });
  assert.match(prior, /during working hours\. USCIS approved my previous extension \(Receipt Number MCT0000000000\), and I departed on time\.\n/);
  assert.match(letter.buildStatementLetter({ ...facts, visitorClass: "B-1" }), /as a B-1 visitor/);
});

test("helpers: long dates, filename", () => {
  assert.equal(letter.longDate("2027-01-06", "x"), "January 6, 2027");
  assert.equal(letter.longDate("2027-13-01", "x"), "[x]");
  assert.equal(letter.longDate(null, "Date"), "[Date]");
  assert.equal(letter.letterFilename("Yingzhen You"), "i-539-statement-DRAFT-yingzhen-you.txt");
  assert.equal(letter.letterFilename(""), "i-539-statement-DRAFT.txt");
});
