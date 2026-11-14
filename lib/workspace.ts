import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { ensureDatabase, getDb } from "../db";
import { completedActions, documents, profiles, trackedCases } from "../db/schema";
import { normalizeProfile, type ImmigrationProfile } from "./profile";
import { buildPlan } from "./rules";
import { getRuntimeBindings } from "./runtime-env";

export class ProfileNotFound extends Error {
  constructor(message = "Profile not found.") {
    super(message);
  }
}

export class ProfileDeleteForbidden extends Error {
  constructor(message = "Deleting the primary or last remaining profile is not allowed.") {
    super(message);
  }
}

export class InvalidReceipt extends Error {}

export async function listProfiles(owner: string) {
  await ensureDatabase();
  return getDb()
    .select()
    .from(profiles)
    .where(eq(profiles.owner, owner))
    .orderBy(desc(profiles.isPrimary), asc(profiles.createdAt), asc(profiles.id));
}

export async function resolveProfile(owner: string, scope?: string | null) {
  await ensureDatabase();
  const rows = await listProfiles(owner);
  if (!rows.length) return null;
  const trimmed = typeof scope === "string" ? scope.trim() : "";
  if (!trimmed) {
    return rows.find((row) => row.isPrimary) ?? rows[0] ?? null;
  }
  const byId = rows.find((row) => row.id === trimmed);
  if (byId) return byId;
  const lower = trimmed.toLowerCase();
  const byName = rows.filter((row) => row.displayName.trim().toLowerCase() === lower);
  if (byName.length === 1) return byName[0];
  return null;
}

export async function loadProfile(owner: string, profileId?: string | null) {
  await ensureDatabase();
  const trimmed = typeof profileId === "string" ? profileId.trim() : "";
  if (trimmed) {
    const [profile] = await getDb()
      .select()
      .from(profiles)
      .where(and(eq(profiles.owner, owner), eq(profiles.id, trimmed)))
      .limit(1);
    return profile ?? null;
  }
  const rows = await listProfiles(owner);
  return rows.find((row) => row.isPrimary) ?? rows[0] ?? null;
}

// Both web and agent writes use this validation and persistence path. Plans are
// rebuilt on read; buildPlan's date-keyed completion records reopen changed dates.
export async function saveProfile(
  owner: string,
  payload: Record<string, unknown>,
  options?: string | null | { profileId?: string | null; create?: boolean },
) {
  const input = normalizeProfile(payload);
  await ensureDatabase();
  const db = getDb();
  const now = new Date().toISOString();
  const opts = typeof options === "string" ? { profileId: options } : options ?? {};
  const requestedId = typeof opts.profileId === "string" ? opts.profileId.trim() : "";

  if (opts.create) {
    const existing = await listProfiles(owner);
    const isPrimary = !existing.some((row) => row.isPrimary);
    const id = crypto.randomUUID();
    await db.insert(profiles).values({
      ...input,
      id,
      owner,
      isPrimary,
      createdAt: now,
      updatedAt: now,
    });
    return loadProfile(owner, id);
  }

  if (requestedId) {
    const current = await loadProfile(owner, requestedId);
    if (!current) throw new ProfileNotFound();
    await db
      .update(profiles)
      .set({ ...input, updatedAt: now })
      .where(and(eq(profiles.owner, owner), eq(profiles.id, current.id)));
    return loadProfile(owner, current.id);
  }

  const primary = await loadProfile(owner);
  if (!primary) {
    const id = crypto.randomUUID();
    await db.insert(profiles).values({
      ...input,
      id,
      owner,
      isPrimary: true,
      createdAt: now,
      updatedAt: now,
    });
    await db
      .update(documents)
      .set({ profileId: id })
      .where(and(eq(documents.owner, owner), eq(documents.profileId, "")));
    await db
      .update(trackedCases)
      .set({ profileId: id })
      .where(and(eq(trackedCases.owner, owner), eq(trackedCases.profileId, "")));
    await db
      .update(completedActions)
      .set({ profileId: id })
      .where(and(eq(completedActions.owner, owner), eq(completedActions.profileId, "")));
    return loadProfile(owner, id);
  }

  await db
    .update(profiles)
    .set({ ...input, updatedAt: now })
    .where(and(eq(profiles.owner, owner), eq(profiles.id, primary.id)));
  return loadProfile(owner, primary.id);
}

export async function renameProfile(owner: string, profileId: string, displayName: unknown) {
  const cleanName = String(displayName ?? "").trim().slice(0, 100);
  if (!cleanName) throw new Error("Enter a profile name.");
  await ensureDatabase();
  const current = await loadProfile(owner, profileId);
  if (!current) throw new ProfileNotFound();
  const updatedAt = new Date().toISOString();
  await getDb()
    .update(profiles)
    .set({ displayName: cleanName, updatedAt })
    .where(and(eq(profiles.owner, owner), eq(profiles.id, current.id)));
  return loadProfile(owner, current.id);
}

export async function deleteProfile(owner: string, profileId: string) {
  await ensureDatabase();
  const all = await listProfiles(owner);
  const target = all.find((row) => row.id === profileId.trim());
  if (!target) throw new ProfileNotFound();
  if (all.length <= 1) {
    throw new ProfileDeleteForbidden("Cannot delete your last remaining profile.");
  }
  if (target.isPrimary) {
    throw new ProfileDeleteForbidden("Cannot delete the primary profile.");
  }

  const db = getDb();
  const docs = await db
    .select()
    .from(documents)
    .where(and(eq(documents.owner, owner), eq(documents.profileId, target.id)));
  const bucket = getRuntimeBindings().BUCKET;
  if (bucket && typeof bucket.delete === "function") {
    for (const doc of docs) {
      await bucket.delete(doc.objectKey);
    }
  }

  await db
    .delete(documents)
    .where(and(eq(documents.owner, owner), eq(documents.profileId, target.id)));
  await db
    .delete(trackedCases)
    .where(and(eq(trackedCases.owner, owner), eq(trackedCases.profileId, target.id)));
  await db
    .delete(completedActions)
    .where(and(eq(completedActions.owner, owner), eq(completedActions.profileId, target.id)));
  await db
    .delete(profiles)
    .where(and(eq(profiles.owner, owner), eq(profiles.id, target.id)));
}

export async function loadPlan(owner: string, profileId?: string | null) {
  const profile = await loadProfile(owner, profileId);
  if (!profile) return null;
  const completed = await getDb()
    .select({ actionKey: completedActions.actionKey })
    .from(completedActions)
    .where(and(eq(completedActions.owner, owner), eq(completedActions.profileId, profile.id)));
  return buildPlan(profile as ImmigrationProfile, completed.map((row) => row.actionKey));
}

export async function setActionCompleted(
  owner: string,
  payload: { actionKey?: unknown; completed?: unknown },
  profileId?: string | null,
) {
  if (!payload || typeof payload.completed !== "boolean") {
    throw new Error("Completion must be true or false.");
  }
  const actionKey = String(payload.actionKey ?? "").trim().slice(0, 140);
  if (!actionKey) throw new Error("Action key is required.");
  const profile = await loadProfile(owner, profileId);
  if (!profile) throw new ProfileNotFound();
  if (!buildPlan(profile as ImmigrationProfile).items.some((item) => item.id === actionKey)) {
    throw new Error("This action changed. Refresh your plan and try again.");
  }
  const db = getDb();
  if (payload.completed) {
    await db
      .insert(completedActions)
      .values({
        id: crypto.randomUUID(),
        owner,
        profileId: profile.id,
        actionKey,
      })
      .onConflictDoNothing();
  } else {
    await db
      .delete(completedActions)
      .where(
        and(
          eq(completedActions.owner, owner),
          eq(completedActions.profileId, profile.id),
          eq(completedActions.actionKey, actionKey),
        ),
      );
  }
}

export async function listCases(owner: string, profileId?: string | null) {
  await ensureDatabase();
  const profile = await loadProfile(owner, profileId);
  if (!profile) {
    if (profileId && profileId.trim()) throw new ProfileNotFound();
    return getDb()
      .select()
      .from(trackedCases)
      .where(and(eq(trackedCases.owner, owner), eq(trackedCases.profileId, "")))
      .orderBy(desc(trackedCases.createdAt));
  }
  const rows = await getDb()
    .select()
    .from(trackedCases)
    .where(and(eq(trackedCases.owner, owner), eq(trackedCases.profileId, profile.id)))
    .orderBy(desc(trackedCases.createdAt));
  if (profile.isPrimary) {
    const legacy = await getDb()
      .select()
      .from(trackedCases)
      .where(and(eq(trackedCases.owner, owner), eq(trackedCases.profileId, "")))
      .orderBy(desc(trackedCases.createdAt));
    return [...rows, ...legacy];
  }
  return rows;
}

export async function saveCase(
  owner: string,
  payload: { receiptNumber?: unknown; formType?: unknown; nickname?: unknown },
  profileId?: string | null,
) {
  const receiptNumber = String(payload.receiptNumber ?? "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  if (!/^[A-Z]{3}\d{10}$/.test(receiptNumber)) {
    throw new InvalidReceipt("Enter a 13-character USCIS receipt number (3 letters and 10 digits).");
  }
  await ensureDatabase();
  const profile = await loadProfile(owner, profileId);
  if (!profile && profileId && profileId.trim()) {
    throw new ProfileNotFound();
  }
  const targetProfileId = profile?.id ?? "";
  const item = {
    id: crypto.randomUUID(),
    owner,
    profileId: targetProfileId,
    receiptNumber,
    formType: String(payload.formType ?? "").trim().slice(0, 30),
    nickname: String(payload.nickname ?? "").trim().slice(0, 80),
  };
  await getDb()
    .insert(trackedCases)
    .values(item)
    .onConflictDoUpdate({
      target: [trackedCases.owner, trackedCases.profileId, trackedCases.receiptNumber],
      set: { formType: item.formType, nickname: item.nickname },
    });
  const [saved] = await getDb()
    .select()
    .from(trackedCases)
    .where(
      and(
        eq(trackedCases.owner, owner),
        eq(trackedCases.profileId, targetProfileId),
        eq(trackedCases.receiptNumber, receiptNumber),
      ),
    )
    .limit(1);
  return saved;
}

export async function removeCase(owner: string, caseId: string, profileId?: string | null) {
  await ensureDatabase();
  const profile = await loadProfile(owner, profileId);
  if (!profile && profileId && profileId.trim()) {
    throw new ProfileNotFound();
  }
  const allowedProfileIds = profile
    ? profile.isPrimary
      ? [profile.id, ""]
      : [profile.id]
    : [""];
  await getDb()
    .delete(trackedCases)
    .where(
      and(
        eq(trackedCases.owner, owner),
        inArray(trackedCases.profileId, allowedProfileIds),
        eq(trackedCases.id, caseId),
      ),
    );
}

export async function listDocuments(owner: string, profileId?: string | null) {
  await ensureDatabase();
  const profile = await loadProfile(owner, profileId);
  if (!profile) {
    if (profileId && profileId.trim()) throw new ProfileNotFound();
    return getDb()
      .select({
        id: documents.id,
        profileId: documents.profileId,
        kind: documents.kind,
        filename: documents.filename,
        mimeType: documents.mimeType,
        sizeBytes: documents.sizeBytes,
        uploadedAt: documents.uploadedAt,
      })
      .from(documents)
      .where(and(eq(documents.owner, owner), eq(documents.profileId, "")))
      .orderBy(desc(documents.uploadedAt));
  }
  const rows = await getDb()
    .select({
      id: documents.id,
      profileId: documents.profileId,
      kind: documents.kind,
      filename: documents.filename,
      mimeType: documents.mimeType,
      sizeBytes: documents.sizeBytes,
      uploadedAt: documents.uploadedAt,
    })
    .from(documents)
    .where(and(eq(documents.owner, owner), eq(documents.profileId, profile.id)))
    .orderBy(desc(documents.uploadedAt));
  if (profile.isPrimary) {
    const legacy = await getDb()
      .select({
        id: documents.id,
        profileId: documents.profileId,
        kind: documents.kind,
        filename: documents.filename,
        mimeType: documents.mimeType,
        sizeBytes: documents.sizeBytes,
        uploadedAt: documents.uploadedAt,
      })
      .from(documents)
      .where(and(eq(documents.owner, owner), eq(documents.profileId, "")))
      .orderBy(desc(documents.uploadedAt));
    return [...rows, ...legacy];
  }
  return rows;
}

export async function getDocument(owner: string, documentId: string, profileId?: string | null) {
  await ensureDatabase();
  const profile = await loadProfile(owner, profileId);
  if (!profile && profileId && profileId.trim()) {
    throw new ProfileNotFound();
  }
  const allowedProfileIds = profile
    ? profile.isPrimary
      ? [profile.id, ""]
      : [profile.id]
    : [""];
  const [document] = await getDb()
    .select()
    .from(documents)
    .where(
      and(
        eq(documents.owner, owner),
        inArray(documents.profileId, allowedProfileIds),
        eq(documents.id, documentId),
      ),
    )
    .limit(1);
  return document ?? null;
}

export async function removeDocument(owner: string, documentId: string, profileId?: string | null) {
  await ensureDatabase();
  const document = await getDocument(owner, documentId, profileId);
  if (!document) return false;
  const bucket = getRuntimeBindings().BUCKET;
  if (bucket && typeof bucket.delete === "function") {
    await bucket.delete(document.objectKey);
  }
  await getDb()
    .delete(documents)
    .where(
      and(
        eq(documents.owner, owner),
        eq(documents.profileId, document.profileId),
        eq(documents.id, document.id),
      ),
    );
  return true;
}
