import { eq } from "drizzle-orm";
import { ensureDatabase, getDb } from "../../../db";
import { completedActions, profiles } from "../../../db/schema";
import { ownerFromRequest, unauthorized } from "../../../lib/auth";
import type { ImmigrationProfile } from "../../../lib/profile";
import { buildPlan } from "../../../lib/rules";

export async function GET(request: Request) {
  const owner = ownerFromRequest(request);
  if (!owner) return unauthorized();

  try {
    await ensureDatabase();
    const db = getDb();
    const [profile] = await db.select().from(profiles).where(eq(profiles.owner, owner)).limit(1);
    if (!profile) return Response.json({ plan: null });
    const completed = await db
      .select({ actionKey: completedActions.actionKey })
      .from(completedActions)
      .where(eq(completedActions.owner, owner));
    return Response.json({
      plan: buildPlan(profile as ImmigrationProfile, completed.map((row) => row.actionKey)),
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to calculate plan." }, { status: 500 });
  }
}
