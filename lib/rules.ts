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
  visaExpiration: {
    label: "Department of State: Visa expiration and admission records",
    url: "https://travel.state.gov/content/travel/en/us-visas/visa-information-resources/visa-expiration-date.html",
    ruleVersion: "Background reference; reminder timing is an app preference",
  },
  visaBulletin: {
    label: "Department of State: Visa Bulletin",
    url: "https://travel.state.gov/content/travel/en/legal/visa-law0/visa-bulletin.html",
    ruleVersion: "Current monthly bulletin required",
  },
  caseStatus: {
    label: "USAGov: Check immigration case status",
    url: "https://www.usa.gov/immigration-case-status",
    ruleVersion: "Official case-status guidance",
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
  i539: {
    label: "USCIS: Extend Your Stay (Form I-539)",
    url: "https://www.uscis.gov/visit-the-united-states/extend-your-stay",
    ruleVersion: "Official reference · check current instructions",
  },
  passport: {
    label: "Department of State: U.S. visitor visas (background only)",
    url: "https://travel.state.gov/content/travel/en/us-visas/tourism-visit/visitor.html",
    ruleVersion: "Not passport-renewal guidance",
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

    if (profile.admissionBasis === "FIXED_DATE" && profile.i94ExpirationDate) {
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
        title: "Review your saved I-94 date",
        description: "Immigrant OS sets this planning reminder six months before the I-94 date you entered. This is an app preference, not a USCIS filing window or deadline. Discuss next steps with qualified counsel; involve your employer for employment-related questions.",
        dueDate: addMonths(profile.i94ExpirationDate, -6),
        severity: "important",
        confidence: "preliminary",
        basis: [`Saved I-94 date: ${formatDate(profile.i94ExpirationDate)}`, "App planning preference: six months before the saved date"],
        source: SOURCES.visaExpiration,
      });
      add({
        id: "h1b-i94-end",
        title: "Saved I-94 admit-until date",
        description: "This is the I-94 date you entered. Review your latest I-94 and any USCIS notices with qualified counsel. This tracker does not determine your authorized stay.",
        dueDate: profile.i94ExpirationDate,
        severity: "critical",
        confidence: "needs-review",
        basis: [`I-94 admit-until date: ${formatDate(profile.i94ExpirationDate)}`],
        source: SOURCES.visaExpiration,
      });
    }
  }

  if (profile.lifecycleStage === "VISITOR") {
    if (!profile.i94ExpirationDate) missingFields.push("I-94 admit-until date");
    if (profile.i94ExpirationDate) {
      add({
        id: "visitor-i94-end",
        title: "I-94 admit-until date (Form I-539 extension scheduling)",
        description: "Scheduling information only: USCIS guidance states that a visitor who needs to stay beyond the CBP admit-until date on Form I-94 files Form I-539 before the current authorized stay expires. The visa expiration date is an entry-document date, not the authorized stay period.",
        dueDate: profile.i94ExpirationDate,
        severity: "critical",
        confidence: "needs-review",
        basis: [`I-94 admit-until date: ${formatDate(profile.i94ExpirationDate)}`],
        source: SOURCES.i539,
      });
    }
  }

  if (profile.lifecycleStage === "GREEN_CARD") {
    if (!profile.priorityDate) missingFields.push("Priority date");
    add({
      id: "gc-visa-bulletin",
      title: "Review the current Visa Bulletin",
      description: profile.priorityDate
        ? `Your saved priority date is ${formatDate(profile.priorityDate)}. Open the official Visa Bulletin for a general review. This tracker does not collect preference category or chargeability country and does not check visa availability or filing eligibility.`
        : "Open the official Visa Bulletin for a general review. You can save a priority date in your profile, but this tracker does not collect preference category or chargeability country and does not check visa availability or filing eligibility.",
      dueDate: null,
      severity: "important",
      confidence: "needs-review",
      basis: profile.priorityDate ? [`Priority date: ${formatDate(profile.priorityDate)}`] : ["Priority date missing"],
      source: SOURCES.visaBulletin,
    });
    add({
      id: "gc-case-receipts",
      title: "Track the USCIS receipts you already have",
      description: "Add each receipt you want to track as a separate case in this app. This is an organization suggestion, not a list of forms to file. Use the official case-status guidance to check a receipt with USCIS.",
      dueDate: null,
      severity: "planning",
      confidence: "needs-review",
      basis: ["Green-card journey selected"],
      source: SOURCES.caseStatus,
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

  if (profile.eadEndDate && profile.lifecycleStage !== "VISITOR") {
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
      title: "Saved passport expiration date",
      description: "This is the passport-expiration date you entered. Review renewal information from your passport's issuing authority and check your travel documents before a trip. This tracker does not check renewal or admission requirements. The linked Department of State page is background information for U.S. visitor visas only.",
      dueDate: profile.passportExpirationDate,
      severity: "important",
      confidence: "needs-review",
      basis: [`Passport expiration: ${formatDate(profile.passportExpirationDate)}`],
      source: SOURCES.passport,
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
    VISITOR: "Visitor (B1/B2)",
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

export function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(date(value));
}

export { SOURCES };
