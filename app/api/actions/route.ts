import { and, eq } from "drizzle-orm";
import { ensureDatabase, getDb } from "../../../db";
import { completedActions } from "../../../db/schema";
import { ownerFromRequest, unauthorized } from "../../../lib/auth";

export async function POST(request: Request) {
  const owner = ownerFromRequest(request);
  if (!owner) return unauthorized();

  try {
    await ensureDatabase();
    const payload = (await request.json()) as { actionKey?: string; completed?: boolean };
    const actionKey = String(payload.actionKey ?? "").trim().slice(0, 140);
    if (!actionKey) return Response.json({ error: "Action key is required." }, { status: 400 });
    const db = getDb();
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
