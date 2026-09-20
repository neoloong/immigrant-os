import { and, eq } from "drizzle-orm";
import { ensureDatabase, getDb } from "../../../db";
import { completedActions, profiles } from "../../../db/schema";
import { buildPlan } from "../../../lib/rules";
import type { ImmigrationProfile } from "../../../lib/profile";
import { ownerFromRequest, unauthorized } from "../../../lib/auth";

export async function POST(request: Request) {
  const owner = ownerFromRequest(request);
  if (!owner) return unauthorized();

  try {
    await ensureDatabase();
    const payload = (await request.json()) as { actionKey?: string; completed?: boolean };
    if (!payload || typeof payload.completed !== "boolean") return Response.json({ error: "Completion must be true or false." }, { status: 400 });
    const actionKey = String(payload.actionKey ?? "").trim().slice(0, 140);
    if (!actionKey) return Response.json({ error: "Action key is required." }, { status: 400 });
    const db = getDb();
    const [profile] = await db.select().from(profiles).where(eq(profiles.owner, owner)).limit(1);
    if (!profile || !buildPlan(profile as ImmigrationProfile).items.some((item) => item.id === actionKey)) {
      return Response.json({ error: "This action changed. Refresh your plan and try again." }, { status: 400 });
    }
    if (payload.completed) {
      await db.insert(completedActions).values({
        id: crypto.randomUUID(),
        owner,
        actionKey,
      }).onConflictDoNothing();
    } else {
      await db.delete(completedActions).where(
        and(eq(completedActions.owner, owner), eq(completedActions.actionKey, actionKey)),
      );
    }
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to update action." }, { status: 500 });
  }
}
