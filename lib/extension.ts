// Extension of stay (Form I-539) helper for VISITOR (B-1/B-2) profiles.
//
// Pure, dependency-free date and checklist logic so it can be unit tested by
// transpiling this single file. Compliance boundary: this module only
// (1) computes dates from dates the user entered, and (2) lists checklist
// items that mirror the structure of a real, previously filed I-539 B-2 case.
// It makes no eligibility determination and gives no legal advice. Every
// timing note cites an official USCIS source. No filing fee is stated as fact.

export type ExtensionSource = {
  label: string;
  url: string;
  section?: string;
};

export const I539_SOURCES = {
  form: {
    label: "USCIS: Form I-539, Application to Extend/Change Nonimmigrant Status",
    url: "https://www.uscis.gov/i-539",
  },
  instructions: {
    label: "USCIS: Form I-539 Instructions",
    url: "https://www.uscis.gov/sites/default/files/document/forms/i-539instr.pdf",
  },
  extendStay: {
    label: "USCIS: Extend Your Stay",
    url: "https://www.uscis.gov/visit-the-united-states/extend-your-stay",
  },
  fileOnline: {
    label: "USCIS: File Online",
    url: "https://www.uscis.gov/file-online",
  },
} as const satisfies Record<string, ExtensionSource>;

const cite = (base: ExtensionSource, section?: string): ExtensionSource =>
  section ? { ...base, section } : { ...base };

export const DRAFT_LABEL = "Draft — review carefully before use. This is not legal advice.";

export const FEE_NOTE =
  "Check the current filing fee on the USCIS Form I-539 page before you submit. This app does not state the fee.";

export const RECOMMENDED_LEAD_DAYS = 45;
export const EARLIEST_SUGGESTED_LEAD_MONTHS = 6;
export const DEFAULT_REQUESTED_MONTHS = 6;

// ---------------------------------------------------------------------------
// Dates (ISO yyyy-mm-dd, interpreted as calendar dates in UTC)
// ---------------------------------------------------------------------------

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function toDate(value: string) {
  if (!isIsoDate(value)) throw new Error(`Invalid date: ${value}`);
  return new Date(`${value}T12:00:00Z`);
}

function iso(value: Date) {
  return value.toISOString().slice(0, 10);
}

export function addDays(value: string, days: number) {
  const result = toDate(value);
  result.setUTCDate(result.getUTCDate() + days);
  return iso(result);
}

// Calendar-month arithmetic, clamped to the last day of the target month
// (e.g. Aug 31 + 6 months = Feb 28/29). Matches lib/rules.ts addMonths.
export function addMonths(value: string, months: number) {
  const original = toDate(value);
  const day = original.getUTCDate();
  const result = new Date(Date.UTC(original.getUTCFullYear(), original.getUTCMonth() + months, 1, 12));
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0, 12)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return iso(result);
}

export function daysBetween(from: string, to: string) {
  return Math.round((toDate(to).getTime() - toDate(from).getTime()) / 86_400_000);
}

export function defaultRequestedUntil(i94ExpirationDate: string) {
  return addMonths(i94ExpirationDate, DEFAULT_REQUESTED_MONTHS);
}

// Input validation only (an extension request date must come after the
// current I-94 date). This is not a judgment about what USCIS may grant.
export function validateRequestedUntil(i94ExpirationDate: string, requestedUntil: unknown): string {
  if (!isIsoDate(requestedUntil)) throw new Error("Enter the requested-until date as YYYY-MM-DD.");
  if (requestedUntil <= i94ExpirationDate) {
    throw new Error("The requested-until date must be after the I-94 admit-until date.");
  }
  return requestedUntil;
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

export type ExtensionDate = {
  id: "earliest-suggested" | "recommended-file-by" | "deadline" | "requested-until";
  label: string;
  date: string;
  daysFromToday: number;
  note: string;
  source: ExtensionSource;
};

// Neutral, purely date-based position of "today" relative to the entered dates.
export type ExtensionPhase =
  | "before-suggested-window"
  | "suggested-window"
  | "after-recommended-date"
  | "after-i94-date";

export type ExtensionTimeline = {
  i94ExpirationDate: string;
  earliestSuggestedFileDate: string;
  recommendedFileByDate: string;
  deadlineDate: string;
  requestedUntilDate: string;
  requestedUntilIsDefault: boolean;
  // True when a saved requested-until date was ignored because it is not after
  // the current I-94 date (for example, left over from an earlier round).
  savedRequestedUntilIgnored: boolean;
  today: string;
  phase: ExtensionPhase;
  dates: ExtensionDate[];
};

export function buildExtensionTimeline(
  i94ExpirationDate: string,
  savedRequestedUntil?: string | null,
  today: string = iso(new Date()),
): ExtensionTimeline {
  toDate(i94ExpirationDate);
  toDate(today);

  const earliestSuggestedFileDate = addMonths(i94ExpirationDate, -EARLIEST_SUGGESTED_LEAD_MONTHS);
  const recommendedFileByDate = addDays(i94ExpirationDate, -RECOMMENDED_LEAD_DAYS);
  const deadlineDate = i94ExpirationDate;

  const savedUsable = isIsoDate(savedRequestedUntil) && savedRequestedUntil > i94ExpirationDate;
  const requestedUntilDate = savedUsable ? savedRequestedUntil : defaultRequestedUntil(i94ExpirationDate);

  let phase: ExtensionPhase;
  if (today > deadlineDate) phase = "after-i94-date";
  else if (today > recommendedFileByDate) phase = "after-recommended-date";
  else if (today >= earliestSuggestedFileDate) phase = "suggested-window";
  else phase = "before-suggested-window";

  const timingSection = "When Should I Use Form I-539?";
  const dates: ExtensionDate[] = [
    {
      id: "earliest-suggested",
      label: "Suggested window opens",
      date: earliestSuggestedFileDate,
      daysFromToday: daysBetween(today, earliestSuggestedFileDate),
      note: "6 months before your I-94 date. The I-539 instructions suggest filing \"generally not more than 6 months\" before your stay expires.",
      source: cite(I539_SOURCES.instructions, timingSection),
    },
    {
      id: "recommended-file-by",
      label: "Recommended file-by date",
      date: recommendedFileByDate,
      daysFromToday: daysBetween(today, recommendedFileByDate),
      note: "45 days before your I-94 date. USCIS recommends applying to extend your stay at least 45 days before your authorized stay expires.",
      source: cite(I539_SOURCES.extendStay),
    },
    {
      id: "deadline",
      label: "I-94 admit-until date (file before this date)",
      date: deadlineDate,
      daysFromToday: daysBetween(today, deadlineDate),
      note: "The date you entered from your I-94. The I-539 instructions state that you generally must submit your application before your current authorized stay expires.",
      source: cite(I539_SOURCES.instructions, timingSection),
    },
    {
      id: "requested-until",
      label: "Requested-until date (your choice)",
      date: requestedUntilDate,
      daysFromToday: daysBetween(today, requestedUntilDate),
      note: savedUsable
        ? "The date you chose to request on Form I-539. USCIS decides whether and until when to approve any extension."
        : "Defaults to 6 months after your I-94 date; change it to the date you intend to request. USCIS decides whether and until when to approve any extension.",
      source: cite(I539_SOURCES.form),
    },
  ];

  return {
    i94ExpirationDate,
    earliestSuggestedFileDate,
    recommendedFileByDate,
    deadlineDate,
    requestedUntilDate,
    requestedUntilIsDefault: !savedUsable,
    savedRequestedUntilIgnored: savedRequestedUntil != null && savedRequestedUntil !== "" && !savedUsable,
    today,
    phase,
    dates,
  };
}

// ---------------------------------------------------------------------------
// Checklist (mirrors the structure of a real, approved 2024 online B-2 filing)
// ---------------------------------------------------------------------------

export type ChecklistGroup = "account" | "form" | "statement" | "documents" | "preparer" | "fee";

export const CHECKLIST_GROUP_LABELS: Record<ChecklistGroup, string> = {
  account: "USCIS online account",
  form: "Form I-539 answers",
  statement: "Written statement",
  documents: "Supporting documents",
  preparer: "Preparer and interpreter",
  fee: "Filing fee",
};

export type ExtensionChecklistItem = {
  id: string; // completion key: i539:<i94 date>:<item>
  itemId: string;
  group: ChecklistGroup;
  title: string;
  detail: string;
  optional: boolean;
  source: ExtensionSource;
  completed: boolean;
};

type ChecklistTemplate = Omit<ExtensionChecklistItem, "id" | "completed">;

const VISITOR_STATUS_LABELS: Record<string, string> = {
  B1: "B-1 (visitor for business)",
  B2: "B-2 (visitor for pleasure)",
  "B1/B2": "B-1/B-2 visitor",
};

export function visitorStatusLabel(statusSubtype: string | null | undefined) {
  const key = String(statusSubtype ?? "").toUpperCase().replace(/[\s-]/g, "");
  return VISITOR_STATUS_LABELS[key] ?? "B-1/B-2 visitor (as shown on your I-94)";
}

export function checklistTemplate(input: {
  statusSubtype?: string | null;
  i94ExpirationDate: string;
  requestedUntilDate: string;
}): ChecklistTemplate[] {
  const status = visitorStatusLabel(input.statusSubtype);
  const i94 = input.i94ExpirationDate;
  const until = input.requestedUntilDate;
  const instr = (section: string) => cite(I539_SOURCES.instructions, section);

  return [
    {
      itemId: "account-ready",
      group: "account",
      title: "USCIS online account ready",
      detail: "Sign in to the applicant's own USCIS online account and start Form I-539 there (paper filing is also described on the I-539 page).",
      optional: false,
      source: cite(I539_SOURCES.fileOnline),
    },
    {
      itemId: "form-basis",
      group: "form",
      title: `Basis: current status ${status}`,
      detail: `Enter your current nonimmigrant status exactly as shown on your I-94, whether you were granted Duration of Status (D/S), and the date your current status expires (your entered I-94 date: ${i94}).`,
      optional: false,
      source: cite(I539_SOURCES.form),
    },
    {
      itemId: "form-applicants",
      group: "form",
      title: "Applicants listed",
      detail: "Confirm whether you are the only applicant. Each co-applicant (spouse or unmarried child under 21 in the same status) completes a separate Form I-539A.",
      optional: false,
      source: instr("Who May File Form I-539? — Multiple Applicants"),
    },
    {
      itemId: "form-reason",
      group: "form",
      title: "Reason: extension of stay in current status",
      detail: "Choose the extension-of-stay option (not change of status) if that is what you are requesting.",
      optional: false,
      source: cite(I539_SOURCES.form),
    },
    {
      itemId: "form-requested-until",
      group: "form",
      title: `Requested-until date: ${until}`,
      detail: "Enter the date you are requesting your stay be extended until. This should match the date in your written statement.",
      optional: false,
      source: cite(I539_SOURCES.form),
    },
    {
      itemId: "statement-letter",
      group: "statement",
      title: "Written statement letter",
      detail: "For B-1/B-2 extensions, the instructions ask for a statement explaining: (1) the reasons for your request; (2) why your extended stay would be temporary, including your departure arrangements; (3) any effect on your foreign employment or residency; and (4) how you will financially support yourself while in the United States.",
      optional: false,
      source: instr("B-1, Visitor for Business, or B-2, Visitor for Pleasure"),
    },
    {
      itemId: "doc-passport",
      group: "documents",
      title: "Passport biographic page",
      detail: "Copy of the passport page showing your name, photo and passport validity.",
      optional: false,
      source: cite(I539_SOURCES.form),
    },
    {
      itemId: "doc-visa",
      group: "documents",
      title: "Visa page",
      detail: "Copy of the visa in your passport used for this entry.",
      optional: false,
      source: cite(I539_SOURCES.form),
    },
    {
      itemId: "doc-i94",
      group: "documents",
      title: "Current I-94 record",
      detail: `Your most recent I-94 showing the admit-until date you entered (${i94}). The B-1/B-2 instructions ask you to include Form I-94 for each person in the application.`,
      optional: false,
      source: instr("B-1, Visitor for Business, or B-2, Visitor for Pleasure"),
    },
    {
      itemId: "doc-prior-approval",
      group: "documents",
      title: "Prior approval notice (if any)",
      detail: "If you have an earlier I-539 approval notice, you may choose to include a copy as a record of your past stays.",
      optional: true,
      source: cite(I539_SOURCES.form),
    },
    {
      itemId: "preparer",
      group: "preparer",
      title: "Preparer details (if someone helps you)",
      detail: "If someone other than the applicant prepares the application, have the preparer's name, mailing address and contact details ready.",
      optional: true,
      source: instr("Part 7. Contact Information, Declaration, and Signature of the Person Preparing this Application, if Other Than the Applicant"),
    },
    {
      itemId: "interpreter",
      group: "preparer",
      title: "Interpreter details (if used)",
      detail: "If someone read the form and instructions to the applicant in another language, have the interpreter's name, contact details and language ready. The same person may act as both preparer and interpreter.",
      optional: true,
      source: instr("Part 6. Interpreter's Contact Information, Certification, and Signature"),
    },
    {
      itemId: "fee-check",
      group: "fee",
      title: "Check the current filing fee",
      detail: FEE_NOTE,
      optional: false,
      source: cite(I539_SOURCES.form),
    },
  ];
}

export function checklistKey(i94ExpirationDate: string, itemId: string) {
  return `i539:${i94ExpirationDate}:${itemId}`;
}

// Completion keys include the I-94 date, so a new I-94 (a new round) starts a
// fresh checklist while old records stay attached to the old round.
export function buildExtensionChecklist(
  input: { statusSubtype?: string | null; i94ExpirationDate: string; requestedUntilDate: string },
  completedKeys: Iterable<string> = [],
): ExtensionChecklistItem[] {
  const completed = new Set(completedKeys);
  return checklistTemplate(input).map((item) => {
    const id = checklistKey(input.i94ExpirationDate, item.itemId);
    return { ...item, id, completed: completed.has(id) };
  });
}

export function extensionChecklistKeys(i94ExpirationDate: string) {
  return checklistTemplate({ i94ExpirationDate, requestedUntilDate: i94ExpirationDate }).map((item) =>
    checklistKey(i94ExpirationDate, item.itemId),
  );
}

// ---------------------------------------------------------------------------
// Combined helper view for a profile
// ---------------------------------------------------------------------------

export type ExtensionProfileInput = {
  lifecycleStage: string;
  statusSubtype?: string | null;
  i94ExpirationDate: string | null;
  extensionRequestedUntil?: string | null;
};

export type ExtensionHelper =
  | { available: false; reason: "not-visitor" | "missing-i94"; disclaimer: string; sources: ExtensionSource[] }
  | {
      available: true;
      disclaimer: string;
      feeNote: string;
      timeline: ExtensionTimeline;
      checklist: ExtensionChecklistItem[];
      progress: { done: number; total: number; requiredDone: number; requiredTotal: number };
      sources: ExtensionSource[];
    };

const ALL_SOURCES: ExtensionSource[] = [I539_SOURCES.form, I539_SOURCES.instructions, I539_SOURCES.extendStay];

export function buildExtensionHelper(
  profile: ExtensionProfileInput,
  completedKeys: Iterable<string> = [],
  today?: string,
): ExtensionHelper {
  if (profile.lifecycleStage !== "VISITOR") {
    return { available: false, reason: "not-visitor", disclaimer: DRAFT_LABEL, sources: ALL_SOURCES };
  }
  if (!isIsoDate(profile.i94ExpirationDate)) {
    return { available: false, reason: "missing-i94", disclaimer: DRAFT_LABEL, sources: ALL_SOURCES };
  }
  const timeline = buildExtensionTimeline(profile.i94ExpirationDate, profile.extensionRequestedUntil ?? null, today);
  const checklist = buildExtensionChecklist(
    {
      statusSubtype: profile.statusSubtype,
      i94ExpirationDate: timeline.i94ExpirationDate,
      requestedUntilDate: timeline.requestedUntilDate,
    },
    completedKeys,
  );
  const required = checklist.filter((item) => !item.optional);
  return {
    available: true,
    disclaimer: DRAFT_LABEL,
    feeNote: FEE_NOTE,
    timeline,
    checklist,
    progress: {
      done: checklist.filter((item) => item.completed).length,
      total: checklist.length,
      requiredDone: required.filter((item) => item.completed).length,
      requiredTotal: required.length,
    },
    sources: ALL_SOURCES,
  };
}

// ---------------------------------------------------------------------------
// Calendar export events (export-only; never added to the action plan)
// ---------------------------------------------------------------------------

export type ExtensionCalendarEvent = {
  id: string;
  dueDate: string;
  title: string;
  description: string;
  source: ExtensionSource;
};

const CALENDAR_NOTE = "Calendar reminder from your entered I-94 date only. Not legal advice or an eligibility determination.";

// All-day events for the recommended file-by date (I-94 minus 45 days) and the
// I-94 admit-until date (authorized stay ends). Only for VISITOR profiles with a
// valid I-94 date; every other profile gets no extra events.
export function extensionCalendarEvents(profile: ExtensionProfileInput): ExtensionCalendarEvent[] {
  if (profile.lifecycleStage !== "VISITOR" || !isIsoDate(profile.i94ExpirationDate)) return [];
  const timeline = buildExtensionTimeline(profile.i94ExpirationDate, null, profile.i94ExpirationDate);
  const titles: Partial<Record<ExtensionDate["id"], string>> = {
    "recommended-file-by": "Form I-539: recommended file-by date (45 days before I-94 date)",
    deadline: "Form I-539: I-94 admit-until date — authorized stay ends (file before this date)",
  };
  return timeline.dates
    .filter((entry) => titles[entry.id])
    .map((entry) => ({
      id: `i539-${entry.id}:${entry.date}`,
      dueDate: entry.date,
      title: titles[entry.id]!,
      description: `${entry.note}\n${CALENDAR_NOTE}\nSource: ${entry.source.label}${entry.source.section ? ` — ${entry.source.section}` : ""}`,
      source: entry.source,
    }));
}
