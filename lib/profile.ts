export const LIFECYCLE_STAGES = ["F1", "H1B", "GREEN_CARD", "LPR", "CITIZENSHIP"] as const;
export type LifecycleStage = (typeof LIFECYCLE_STAGES)[number];

export type ImmigrationProfile = {
  owner?: string;
  displayName: string;
  lifecycleStage: LifecycleStage;
  statusSubtype: string;
  admissionBasis: string;
  programEndDate: string | null;
  eadEndDate: string | null;
  i94ExpirationDate: string | null;
  passportExpirationDate: string | null;
  visaExpirationDate: string | null;
  priorityDate: string | null;
  greenCardSince: string | null;
  greenCardExpirationDate: string | null;
  naturalizationBasis: string;
  updatedAt?: string;
};

export function normalizeProfile(input: Record<string, unknown>): ImmigrationProfile {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Enter a valid profile.");
  const lifecycleStage = String(input.lifecycleStage ?? "").toUpperCase();
  if (!LIFECYCLE_STAGES.includes(lifecycleStage as LifecycleStage)) {
    throw new Error("Choose a supported immigration stage.");
  }

  return {
    displayName: cleanText(input.displayName, 100),
    lifecycleStage: lifecycleStage as LifecycleStage,
    statusSubtype: cleanText(input.statusSubtype, 40),
    admissionBasis: cleanText(input.admissionBasis, 30),
    programEndDate: cleanDate(input.programEndDate),
    eadEndDate: cleanDate(input.eadEndDate),
    i94ExpirationDate: cleanDate(input.i94ExpirationDate),
    passportExpirationDate: cleanDate(input.passportExpirationDate),
    visaExpirationDate: cleanDate(input.visaExpirationDate),
    priorityDate: cleanDate(input.priorityDate),
    greenCardSince: cleanDate(input.greenCardSince),
    greenCardExpirationDate: cleanDate(input.greenCardExpirationDate),
    naturalizationBasis: cleanText(input.naturalizationBasis, 20) || "five_year",
  };
}

function cleanText(value: unknown, max: number) {
  return String(value ?? "").trim().slice(0, max);
}

function cleanDate(value: unknown): string | null {
  const candidate = String(value ?? "").trim();
  if (!candidate) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate) || Number.isNaN(Date.parse(`${candidate}T00:00:00Z`)) || new Date(`${candidate}T00:00:00Z`).toISOString().slice(0, 10) !== candidate) {
    throw new Error(`Invalid date: ${candidate}`);
  }
  return candidate;
}
