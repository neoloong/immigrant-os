import { and, eq } from "drizzle-orm";
import { ensureDatabase, getDb } from "../db";
import { completedActions, profiles, trackedCases } from "../db/schema";
import { normalizeProfile, type ImmigrationProfile } from "./profile";
import { buildPlan } from "./rules";

export async function loadProfile(owner: string) {
  await ensureDatabase();
  const [profile] = await getDb().select().from(profiles).where(eq(profiles.owner, owner)).limit(1);
  return profile ?? null;
}

// Both web and agent writes use this validation and persistence path. Plans are
// rebuilt on read; buildPlan's date-keyed completion records reopen changed dates.
export async function saveProfile(owner: string, payload: Record<string, unknown>) {
  const input = normalizeProfile(payload);
  await ensureDatabase();
  const updatedAt = new Date().toISOString();
  await getDb().insert(profiles).values({ ...input, owner, updatedAt })
    .onConflictDoUpdate({ target: profiles.owner, set: { ...input, updatedAt } });
  return loadProfile(owner);
}

export async function loadPlan(owner: string) {
  const profile = await loadProfile(owner);
  if (!profile) return null;
  const completed = await getDb().select({ actionKey: completedActions.actionKey })
    .from(completedActions).where(eq(completedActions.owner, owner));
  return buildPlan(profile as ImmigrationProfile, completed.map((row) => row.actionKey));
}

export class InvalidReceipt extends Error {}
export async function saveCase(owner: string, payload: { receiptNumber?: unknown; formType?: unknown; nickname?: unknown }) {
  const receiptNumber = String(payload.receiptNumber ?? "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  if (!/^[A-Z]{3}\d{10}$/.test(receiptNumber)) {
    throw new InvalidReceipt("Enter a 13-character USCIS receipt number (3 letters and 10 digits).");
  }
  await ensureDatabase();
  const item = { id: crypto.randomUUID(), owner, receiptNumber,
    formType: String(payload.formType ?? "").trim().slice(0, 30),
    nickname: String(payload.nickname ?? "").trim().slice(0, 80) };
  await getDb().insert(trackedCases).values(item).onConflictDoUpdate({
    target: [trackedCases.owner, trackedCases.receiptNumber],
    set: { formType: item.formType, nickname: item.nickname },
  });
  const [saved] = await getDb().select().from(trackedCases)
    .where(and(eq(trackedCases.owner, owner), eq(trackedCases.receiptNumber, receiptNumber))).limit(1);
  return saved;
}
