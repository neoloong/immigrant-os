import { eq } from "drizzle-orm";
import { ensureDatabase, getDb } from "../../../db";
import { profiles } from "../../../db/schema";
import { ownerFromRequest, unauthorized } from "../../../lib/auth";
import { normalizeProfile } from "../../../lib/profile";

export async function GET(request: Request) {
  const owner = ownerFromRequest(request);
  if (!owner) return unauthorized();

  try {
    await ensureDatabase();
    const [profile] = await getDb().select().from(profiles).where(eq(profiles.owner, owner)).limit(1);
    return Response.json({ profile: profile ?? null });
  } catch (error) {
    return databaseError(error);
  }
}

export async function PUT(request: Request) {
  const owner = ownerFromRequest(request);
  if (!owner) return unauthorized();

  try {
    await ensureDatabase();
    const input = normalizeProfile((await request.json()) as Record<string, unknown>);
    const now = new Date().toISOString();
    const values = { ...input, owner, updatedAt: now };
    await getDb()
      .insert(profiles)
      .values(values)
      .onConflictDoUpdate({
        target: profiles.owner,
        set: { ...input, updatedAt: now },
      });
    const [profile] = await getDb().select().from(profiles).where(eq(profiles.owner, owner)).limit(1);
    return Response.json({ profile });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save profile.";
    return Response.json({ error: message }, { status: message.includes("table") ? 500 : 400 });
  }
}

function databaseError(error: unknown) {
  const message = error instanceof Error ? error.message : "Database unavailable.";
  return Response.json({ error: message }, { status: 500 });
}
