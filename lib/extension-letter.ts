// Written-statement drafter for Form I-539 (B-1/B-2 extension of stay).
//
// Pure and dependency-free so it can be unit tested by transpiling this file.
// Compliance boundary: the letter is assembled only from facts the user typed
// or picked. Any fact the user has not supplied is left as a [bracketed
// placeholder] to fill in, never invented. The output is a draft for the user
// to review and edit; it is not legal advice and makes no eligibility
// determination.
//
// Structure follows the user's own previously filed statement: header, subject,
// opening paragraph, then numbered parts "Reasons for Request for Extension or
// Change", "Reasons Why Extended Stay Would Be Temporary", "Effect of Extended
// Stay on Foreign Employment or Residency". The I-539 instructions (B-1/B-2
// section) also list how you will financially support yourself; that part is
// added only when the user fills it in, and the UI says so.

export type ReasonTheme = "childcare" | "family-support" | "other";
export type HomeSituation = "retired" | "employed" | "other";
export type VisitorClass = "B-1" | "B-2";

export type StatementInput = {
  applicantName: string;
  address: string; // one or more lines
  email: string;
  phone: string;
  letterDate: string | null; // YYYY-MM-DD; null leaves a placeholder
  visitorClass: VisitorClass;
  arrivalDate: string | null;
  visiting: string; // e.g. "my daughter and her family"
  i94ExpirationDate: string | null;
  requestedUntilDate: string | null;
  departureDate: string | null;
  themes: ReasonTheme[];
  childcareDetails: string;
  familySupportDetails: string;
  otherReason: string;
  previousStays: string;
  temporaryDetails: string;
  homeSituation: HomeSituation;
  homeDetails: string;
  financialSupport: string;
};

export const REASON_THEMES: { id: ReasonTheme; label: string; hint: string }[] = [
  {
    id: "childcare",
    label: "Helping family care for young children",
    hint: "Who the children are (ages or birth dates) and why your help is needed during the day.",
  },
  {
    id: "family-support",
    label: "Family support",
    hint: "What support you are giving your family and why it is needed now.",
  },
  {
    id: "other",
    label: "Other",
    hint: "Describe your reason in your own words.",
  },
];

export const HOME_SITUATIONS: { id: HomeSituation; label: string }[] = [
  { id: "retired", label: "I am retired" },
  { id: "employed", label: "I have a job at home" },
  { id: "other", label: "Something else" },
];

export function emptyStatementInput(): StatementInput {
  return {
    applicantName: "",
    address: "",
    email: "",
    phone: "",
    letterDate: null,
    visitorClass: "B-2",
    arrivalDate: null,
    visiting: "",
    i94ExpirationDate: null,
    requestedUntilDate: null,
    departureDate: null,
    themes: [],
    childcareDetails: "",
    familySupportDetails: "",
    otherReason: "",
    previousStays: "",
    temporaryDetails: "",
    homeSituation: "retired",
    homeDetails: "",
    financialSupport: "",
  };
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// "2027-01-06" → "January 6, 2027"; anything else → the placeholder.
export function longDate(value: string | null | undefined, placeholder: string) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return `[${placeholder}]`;
  const [y, m, d] = value.split("-").map(Number);
  if (!MONTHS[m - 1] || d < 1 || d > 31) return `[${placeholder}]`;
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

const clean = (value: string | null | undefined) => (value ?? "").replace(/\r\n?/g, "\n").trim();
const or = (value: string | null | undefined, placeholder: string) => clean(value) || `[${placeholder}]`;
// User free text becomes one paragraph; sentences get a terminal period.
function sentence(value: string) {
  const text = clean(value).replace(/\s*\n+\s*/g, " ");
  if (!text) return "";
  return /[.!?)\]"”]$/.test(text) ? text : `${text}.`;
}
const joinSentences = (...parts: string[]) => parts.map(sentence).filter(Boolean).join(" ");

function purposePhrase(themes: ReasonTheme[]) {
  if (themes.includes("childcare")) return "to help my family while the children are young";
  if (themes.includes("family-support")) return "to support my family as described above";
  return "for the reasons described above";
}

export function buildStatementLetter(input: StatementInput): string {
  const name = or(input.applicantName, "Your full name");
  const visitorClass = input.visitorClass === "B-1" ? "B-1" : "B-2";
  const themes = REASON_THEMES.map((theme) => theme.id).filter((id) => input.themes.includes(id));

  const header = [
    name,
    ...clean(input.address).split("\n").map((line) => line.trim()).filter(Boolean),
    clean(input.email),
    clean(input.phone),
  ].filter(Boolean);
  if (header.length === 1) header.push("[Your mailing address]");

  const visiting = clean(input.visiting);
  const opening =
    `I am writing to request an extension of my stay in the United States as a ${visitorClass} visitor. ` +
    `My name is ${name}, and I arrived in the United States on ${longDate(input.arrivalDate, "arrival date")}` +
    `${visiting ? ` to visit ${visiting}` : ""}. ` +
    `My current I-94 expires on ${longDate(input.i94ExpirationDate, "I-94 admit-until date")}. ` +
    `I am requesting an extension until ${longDate(input.requestedUntilDate, "requested-until date")} for the following reasons:`;

  const reasonParts: string[] = [];
  if (themes.includes("childcare")) {
    reasonParts.push(or(input.childcareDetails, "Describe the children (ages or birth dates) and why your help is needed during the day"));
  }
  if (themes.includes("family-support")) {
    reasonParts.push(or(input.familySupportDetails, "Describe the support you are giving your family and why it is needed now"));
  }
  if (themes.includes("other")) reasonParts.push(or(input.otherReason, "Describe your reason"));
  if (!reasonParts.length) reasonParts.push("[Choose at least one reason and describe it]");
  if (clean(input.previousStays)) reasonParts.push(input.previousStays);
  const reasons = joinSentences(...reasonParts);

  const temporary = joinSentences(
    `My intention is to remain in the United States only for the time needed ${purposePhrase(themes)}`,
    `I plan to return to my home country by ${longDate(input.departureDate, "planned departure date")}`,
    input.temporaryDetails,
  );

  const homeLead =
    input.homeSituation === "retired"
      ? "My extended stay in the United States will have minimal impact on my employment or residency in my home country, as I am currently retired"
      : input.homeSituation === "employed"
        ? `I am currently employed in my home country. ${or(input.homeDetails, "Describe your job and the arrangement for your return to it, such as approved leave")}`
        : "";
  const homeRest = input.homeSituation === "employed" ? "" : input.homeDetails;
  const effect =
    joinSentences(homeLead, homeRest) ||
    "[Describe how the extended stay affects any job or residence in your home country]";

  const parts = [
    `1. Reasons for Request for Extension or Change: ${reasons}`,
    `2. Reasons Why Extended Stay Would Be Temporary: ${temporary}`,
    `3. Effect of Extended Stay on Foreign Employment or Residency: ${effect}`,
  ];
  if (clean(input.financialSupport)) {
    parts.push(`4. Financial Support During the Extended Stay: ${joinSentences(input.financialSupport)}`);
  }

  return [
    header.join("\n"),
    longDate(input.letterDate, "Date"),
    "U.S. Citizenship and Immigration Services",
    `Subject: Request for Extension of Stay as ${visitorClass} Visitor`,
    "Dear Sir/Madam,",
    opening,
    parts.join("\n\n"),
    `I kindly request that you consider my situation and grant me an extension of stay as a ${visitorClass} visitor. I appreciate your understanding and attention to this matter.`,
    "Thank you for your time and consideration.",
    `Sincerely,\n${name}`,
  ].join("\n\n") + "\n";
}

// Placeholders still present in a letter, e.g. "[arrival date]".
export function letterPlaceholders(letter: string) {
  return Array.from(new Set(letter.match(/\[[^\]\n]{2,160}\]/g) ?? []));
}

export function letterFilename(applicantName: string) {
  const slug = clean(applicantName).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `i-539-statement-DRAFT${slug ? `-${slug}` : ""}.txt`;
}
