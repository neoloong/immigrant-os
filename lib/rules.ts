import type { ImmigrationProfile } from "./profile";

export type Source = {
  label: string;
  url: string;
  ruleVersion: string;
};

export type PlanItem = {
  id: string;
  title: string;
  description: string;
  dueDate: string | null;
  severity: "critical" | "important" | "planning" | "info";
  confidence: "verified" | "preliminary" | "needs-review";
  basis: string[];
  source: Source;
  completed: boolean;
};

export type PlanResult = {
  generatedAt: string;
  stageLabel: string;
  coverage: "Verified" | "Beta";
  summary: string;
  items: PlanItem[];
  missingFields: string[];
};

const SOURCES = {
  f1FinalRule: {
    label: "DHS final rule: fixed admission periods for F, J and I",
    url: "https://www.federalregister.gov/documents/2026/07/17/2026-14439/establishing-a-fixed-time-period-of-admission-and-an-extension-of-stay-procedure-for-nonimmigrant",
    ruleVersion: "Published July 17, 2026 · effective September 15, 2026",
  },
  opt: {
    label: "USCIS: Optional Practical Training for F-1 Students",
    url: "https://www.uscis.gov/working-in-the-united-states/students-and-exchange-visitors/optional-practical-training-opt-for-f-1-students",
    ruleVersion: "Checked August 11, 2026",
  },
  stemOpt: {
    label: "USCIS: STEM OPT extension",
    url: "https://www.uscis.gov/working-in-the-united-states/students-and-exchange-visitors/optional-practical-training-extension-for-stem-students-stem-opt",
    ruleVersion: "Checked August 11, 2026",
  },
  h1b: {
    label: "USCIS: H-1B Specialty Occupations",
    url: "https://www.uscis.gov/working-in-the-united-states/h-1b-specialty-occupations",
    ruleVersion: "Checked August 11, 2026",
  },
  visaBulletin: {
    label: "Department of State: Visa Bulletin",
    url: "https://travel.state.gov/content/travel/en/legal/visa-law0/visa-bulletin.html",
    ruleVersion: "Current monthly bulletin required",
  },
  greenCard: {
    label: "USCIS: Green Card Processes and Procedures",
    url: "https://www.uscis.gov/green-card/green-card-processes-and-procedures",
    ruleVersion: "Checked August 11, 2026",
  },
  i90: {
    label: "USCIS: Form I-90",
    url: "https://www.uscis.gov/i-90",
    ruleVersion: "Checked August 11, 2026",
  },
  n400: {
    label: "USCIS: Form N-400",
    url: "https://www.uscis.gov/n-400",
    ruleVersion: "Checked August 11, 2026",
  },
};

export function buildPlan(profile: ImmigrationProfile, completedKeys: string[] = []): PlanResult {
  const completed = new Set(completedKeys);
  const items: PlanItem[] = [];
  const missingFields: string[] = [];

  const add = (item: Omit<PlanItem, "completed">) => {
    items.push({ ...item, completed: completed.has(item.id) });
  };

  if (profile.lifecycleStage === "F1") {
    if (!profile.programEndDate) missingFields.push("Program end date from Form I-20");
    if (!profile.admissionBasis) missingFields.push("I-94 admission basis (D/S or fixed date)");

    if (profile.admissionBasis === "DS_TRANSITION") {
      add({
        id: "f1-fixed-admission-transition",
        title: "Review the September 15 F-1 admission-rule transition",
        description: "DHS is replacing duration-of-status admissions with fixed admission periods. Transition rules depend on your I-94, location, program or EAD dates, and status on the effective date.",
        dueDate: "2026-09-15",
        severity: "critical",
        confidence: "verified",
        basis: ["I-94 shows D/S", "Rule effective September 15, 2026"],
        source: SOURCES.f1FinalRule,
      });
    }

    if (profile.admissionBasis === "FIXED_DATE" && !profile.i94ExpirationDate) {
      missingFields.push("I-94 admit-until date");
    }

    if (profile.i94ExpirationDate) {
      add({
        id: "f1-i94-end",
        title: "I-94 authorized admission period ends",
        description: "Treat this as a controlling date. Review any need for an extension of stay with your DSO or qualified counsel well before it arrives.",
        dueDate: profile.i94ExpirationDate,
        severity: "critical",
        confidence: "verified",
        basis: [`I-94 admit-until date: ${formatDate(profile.i94ExpirationDate)}`],
        source: SOURCES.f1FinalRule,
      });
    }

    if (profile.programEndDate) {
      const earliest = addDays(profile.programEndDate, -90);
      const latestOffset = profile.admissionBasis === "FIXED_DATE" ? 30 : 60;
      const latest = addDays(profile.programEndDate, latestOffset);
      add({
        id: "f1-opt-earliest",
        title: "Earliest post-completion OPT filing date",
        description: "This is the beginning of the filing window calculated from your confirmed program end date. Your DSO recommendation and other requirements still apply.",
        dueDate: earliest,
        severity: "planning",
        confidence: "verified",
        basis: [`Program end: ${formatDate(profile.programEndDate)}`, "90 calendar days earlier"],
        source: SOURCES.opt,
      });
      add({
        id: "f1-opt-latest",
        title: profile.admissionBasis === "FIXED_DATE" ? "Latest post-completion OPT filing date" : "Transition-cohort filing date to verify",
        description: profile.admissionBasis === "FIXED_DATE"
          ? "The 2026 final rule shortens the post-program filing and departure period to 30 days for fixed-date admissions. Do not wait until this date."
          : "This 60-day date reflects the D/S transition framework. Because the 2026 rule has cohort-specific extension-of-stay provisions, verify the exact filing sequence with your DSO.",
        dueDate: latest,
        severity: "critical",
        confidence: profile.admissionBasis === "FIXED_DATE" ? "verified" : "needs-review",
        basis: [`Program end: ${formatDate(profile.programEndDate)}`, `${latestOffset} calendar days later`],
        source: profile.admissionBasis === "FIXED_DATE" ? SOURCES.f1FinalRule : SOURCES.opt,
      });
    }

    if (profile.eadEndDate && profile.statusSubtype === "STEM_OPT") {
      add({
        id: "f1-stem-opt-earliest",
        title: "Earliest STEM OPT extension filing date",
        description: "A qualifying F-1 student may file up to 90 days before the current OPT EAD expires. The employer, degree, I-983, and DSO requirements must also be satisfied.",
        dueDate: addDays(profile.eadEndDate, -90),
        severity: "important",
        confidence: "verified",
        basis: [`Current EAD ends: ${formatDate(profile.eadEndDate)}`, "90 calendar days earlier"],
        source: SOURCES.stemOpt,
      });
    }
  }

  if (profile.lifecycleStage === "H1B") {
    if (!profile.i94ExpirationDate) missingFields.push("Most recent I-94 admit-until date");
    if (profile.i94ExpirationDate) {
      add({
        id: "h1b-extension-planning",
        title: "Begin employer extension planning",
        description: "This six-month planning reminder is not a legal filing deadline. Confirm timing with the petitioning employer or counsel.",
        dueDate: addMonths(profile.i94ExpirationDate, -6),
        severity: "important",
        confidence: "preliminary",
        basis: [`I-94 ends: ${formatDate(profile.i94ExpirationDate)}`, "Planning reminder set six months earlier"],
        source: SOURCES.h1b,
      });
      add({
        id: "h1b-i94-end",
        title: "I-94 authorized stay ends",
        description: "The visa stamp is an entry document; it is not a substitute for checking the authorized stay shown on the latest I-94 and approval records.",
        dueDate: profile.i94ExpirationDate,
        severity: "critical",
        confidence: "verified",
        basis: [`I-94 admit-until date: ${formatDate(profile.i94ExpirationDate)}`],
        source: SOURCES.h1b,
      });
    }
  }

  if (profile.lifecycleStage === "GREEN_CARD") {
    if (!profile.priorityDate) missingFields.push("Priority date");
    add({
      id: "gc-visa-bulletin",
      title: "Review the current Visa Bulletin",
      description: profile.priorityDate
        ? `Your saved priority date is ${formatDate(profile.priorityDate)}. Compare it with the correct employment or family category and country column; this product does not infer those missing facts.`
        : "Add your priority date, preference category, and chargeability country before any personalized availability check.",
      dueDate: firstDayNextMonth(),
      severity: "important",
      confidence: "needs-review",
      basis: profile.priorityDate ? [`Priority date: ${formatDate(profile.priorityDate)}`] : ["Priority date missing"],
      source: SOURCES.visaBulletin,
    });
    add({
      id: "gc-case-receipts",
      title: "Add every USCIS receipt to your case tracker",
      description: "Keep the I-140, I-485, I-765, I-131, and dependent cases separate so a change in one does not hide another.",
      dueDate: null,
      severity: "planning",
      confidence: "verified",
      basis: ["Green-card journey selected"],
      source: SOURCES.greenCard,
    });
  }

  if (profile.lifecycleStage === "LPR" || profile.lifecycleStage === "CITIZENSHIP") {
    if (!profile.greenCardSince) missingFields.push("Resident since date");
    if (profile.lifecycleStage === "LPR" && !profile.greenCardExpirationDate) missingFields.push("Green Card expiration date");

    if (profile.greenCardExpirationDate) {
      add({
        id: "lpr-i90-window",
        title: "Green Card renewal window opens",
        description: "USCIS permits an I-90 renewal when a 10-year card is expired or will expire within six months. Conditional residents use a different process.",
        dueDate: addMonths(profile.greenCardExpirationDate, -6),
        severity: "important",
        confidence: "verified",
        basis: [`Card expires: ${formatDate(profile.greenCardExpirationDate)}`, "Six calendar months earlier"],
        source: SOURCES.i90,
      });
    }

    if (profile.greenCardSince) {
      const years = profile.naturalizationBasis === "three_year" ? 3 : 5;
      add({
        id: "lpr-n400-earliest",
        title: "Potential earliest N-400 filing date",
        description: `This calculator only applies the ${years}-year continuous-residence period and USCIS's 90-day early-filing rule. It does not verify physical presence, marital union, trips, taxes, good moral character, or other eligibility requirements.`,
        dueDate: addDays(addYears(profile.greenCardSince, years), -90),
        severity: "planning",
        confidence: "preliminary",
        basis: [`Resident since: ${formatDate(profile.greenCardSince)}`, `${years}-year basis`, "90 calendar days early"],
        source: SOURCES.n400,
      });
    }
  }

  if (profile.passportExpirationDate) {
    add({
      id: "universal-passport-expiry",
      title: "Passport expires",
      description: "Renewal timing and the effect on travel or admission can vary by country and status. Plan early and re-check travel documents before every trip.",
      dueDate: profile.passportExpirationDate,
      severity: "important",
      confidence: "verified",
      basis: [`Passport expiration: ${formatDate(profile.passportExpirationDate)}`],
      source: profile.lifecycleStage === "F1" ? SOURCES.f1FinalRule : SOURCES.h1b,
    });
  }

  items.sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return a.dueDate.localeCompare(b.dueDate);
  });

  const labels: Record<ImmigrationProfile["lifecycleStage"], string> = {
    F1: "F-1 / OPT",
    H1B: "H-1B / H-4",
    GREEN_CARD: "Green card process",
    LPR: "Permanent resident",
    CITIZENSHIP: "Citizenship",
  };
  const coverage = profile.lifecycleStage === "F1" || profile.lifecycleStage === "LPR" || profile.lifecycleStage === "CITIZENSHIP" ? "Verified" : "Beta";

  return {
    generatedAt: new Date().toISOString(),
    stageLabel: labels[profile.lifecycleStage],
    coverage,
    summary: missingFields.length
      ? `${missingFields.length} item${missingFields.length === 1 ? " is" : "s are"} needed to complete your timeline.`
      : `${items.filter((item) => !item.completed).length} open action${items.filter((item) => !item.completed).length === 1 ? "" : "s"} calculated from your saved profile.`,
    items,
    missingFields,
  };
}

function date(value: string) {
  return new Date(`${value}T12:00:00Z`);
}

function iso(value: Date) {
  return value.toISOString().slice(0, 10);
}

function addDays(value: string, days: number) {
  const result = date(value);
  result.setUTCDate(result.getUTCDate() + days);
  return iso(result);
}

function addMonths(value: string, months: number) {
  const original = date(value);
  const day = original.getUTCDate();
  const result = new Date(Date.UTC(original.getUTCFullYear(), original.getUTCMonth() + months, 1, 12));
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0, 12)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return iso(result);
}

function addYears(value: string, years: number) {
  const result = date(value);
  result.setUTCFullYear(result.getUTCFullYear() + years);
  return iso(result);
}

function firstDayNextMonth() {
  const now = new Date();
  return iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 12)));
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(date(value));
}

export { SOURCES };
