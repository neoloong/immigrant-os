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
  confidence: "needs-review" | "preliminary";
  basis: string[];
  source: Source;
  completed: boolean;
};

export type PlanResult = {
  generatedAt: string;
  stageLabel: string;
  coverage: "Beta";
  summary: string;
  items: PlanItem[];
  missingFields: string[];
};

const SOURCES = {
  opt: {
    label: "USCIS: Optional Practical Training for F-1 Students",
    url: "https://www.uscis.gov/working-in-the-united-states/students-and-exchange-visitors/optional-practical-training-opt-for-f-1-students",
    ruleVersion: "Official reference · check current instructions",
  },
  ead: {
    label: "USCIS: Employment Authorization",
    url: "https://www.uscis.gov/i-765",
    ruleVersion: "Official reference · check current instructions",
  },
  h1b: {
    label: "USCIS: H-1B Specialty Occupations",
    url: "https://www.uscis.gov/working-in-the-united-states/h-1b-specialty-occupations",
    ruleVersion: "Official reference · check current instructions",
  },
  visaBulletin: {
    label: "Department of State: Visa Bulletin",
    url: "https://travel.state.gov/content/travel/en/legal/visa-law0/visa-bulletin.html",
    ruleVersion: "Current monthly bulletin required",
  },
  greenCard: {
    label: "USCIS: Green Card Processes and Procedures",
    url: "https://www.uscis.gov/green-card/green-card-processes-and-procedures",
    ruleVersion: "Official reference · check current instructions",
  },
  i90: {
    label: "USCIS: Form I-90",
    url: "https://www.uscis.gov/i-90",
    ruleVersion: "Official reference · check current instructions",
  },
  n400: {
    label: "USCIS: Form N-400",
    url: "https://www.uscis.gov/n-400",
    ruleVersion: "Official reference · check current instructions",
  },
};

export function buildPlan(profile: ImmigrationProfile, completedKeys: string[] = []): PlanResult {
  const completed = new Set(completedKeys);
  const items: PlanItem[] = [];
  const missingFields: string[] = [];

  const add = (item: Omit<PlanItem, "completed">) => {
    const id = `${item.id}:${item.dueDate ?? "review"}`;
    items.push({ ...item, id, completed: completed.has(id) });
  };

  if (profile.lifecycleStage === "F1") {
    if (!profile.programEndDate) missingFields.push("Program end date from Form I-20");
    if (!profile.admissionBasis) missingFields.push("I-94 admission basis (D/S or fixed date)");

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
        confidence: "needs-review",
        basis: [`I-94 admit-until date: ${formatDate(profile.i94ExpirationDate)}`],
        source: SOURCES.opt,
      });
    }

    if (profile.programEndDate) {
      add({
        id: "f1-program-end", title: "I-20 program end date",
        description: "Date you entered from your I-20. Ask your DSO to confirm any OPT application window and recommendation deadline; this tracker does not determine filing eligibility.",
        dueDate: profile.programEndDate, severity: "important", confidence: "needs-review",
        basis: [`Your I-20 date: ${formatDate(profile.programEndDate)}`], source: SOURCES.opt,
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
        confidence: "needs-review",
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
      confidence: "needs-review",
      basis: ["Green-card journey selected"],
      source: SOURCES.greenCard,
    });
  }

  if (profile.lifecycleStage === "LPR" || profile.lifecycleStage === "CITIZENSHIP") {
    if (!profile.greenCardSince) missingFields.push("Resident since date");
    if (profile.lifecycleStage === "LPR" && !profile.greenCardExpirationDate) missingFields.push("Green Card expiration date");

    if (profile.greenCardExpirationDate) {
      add({
        id: "lpr-card-expiry", title: "Green Card expiration date",
        description: "Date printed on your card. Review the correct renewal or removal-of-conditions process; card expiration alone does not determine your immigration status.",
        dueDate: profile.greenCardExpirationDate, severity: "important", confidence: "needs-review",
        basis: [`Your card date: ${formatDate(profile.greenCardExpirationDate)}`], source: SOURCES.i90,
      });
    }
    if (profile.greenCardSince) {
      add({
        id: "lpr-n400-review", title: "Review naturalization eligibility with official guidance",
        description: "Residence dates alone are not enough to determine eligibility or an earliest filing date. Review residence, travel and any spouse-based requirements before applying.",
        dueDate: null, severity: "planning", confidence: "needs-review",
        basis: [`Resident since: ${formatDate(profile.greenCardSince)}`], source: SOURCES.n400,
      });
    }
  }

  if (profile.eadEndDate) {
    add({
      id: "ead-expiry", title: "EAD expiration date",
      description: "Date printed on your EAD. Any extension of work authorization depends on your category and circumstances; verify it separately.",
      dueDate: profile.eadEndDate, severity: "important", confidence: "needs-review",
      basis: [`Your EAD date: ${formatDate(profile.eadEndDate)}`], source: SOURCES.ead,
    });
  }

  if (profile.passportExpirationDate) {
    add({
      id: "universal-passport-expiry",
      title: "Passport expires",
      description: "Renewal timing and the effect on travel or admission can vary by country and status. Plan early and re-check travel documents before every trip.",
      dueDate: profile.passportExpirationDate,
      severity: "important",
      confidence: "needs-review",
      basis: [`Passport expiration: ${formatDate(profile.passportExpirationDate)}`],
      source: profile.lifecycleStage === "F1" ? SOURCES.opt : SOURCES.h1b,
    });
  }

  items.sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    if (!a.dueDate && !b.dueDate) return 0;
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
  const coverage = "Beta";

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

function addMonths(value: string, months: number) {
  const original = date(value);
  const day = original.getUTCDate();
  const result = new Date(Date.UTC(original.getUTCFullYear(), original.getUTCMonth() + months, 1, 12));
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0, 12)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
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
