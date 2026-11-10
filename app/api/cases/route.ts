import { and, desc, eq } from "drizzle-orm";
import { ensureDatabase, getDb } from "../../../db";
import { trackedCases } from "../../../db/schema";
import { ownerFromRequest, unauthorized } from "../../../lib/auth";
import { InvalidReceipt, saveCase } from "../../../lib/workspace";

export async function GET(request: Request) {
  const owner = await ownerFromRequest(request);
  if (!owner) return unauthorized();
  try {
    await ensureDatabase();
    const cases = await getDb().select().from(trackedCases)
      .where(eq(trackedCases.owner, owner))
      .orderBy(desc(trackedCases.createdAt));
    return Response.json({ cases });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  const owner = await ownerFromRequest(request);
  if (!owner) return unauthorized();
  try {
    await ensureDatabase();
    const payload = (await request.json()) as { receiptNumber?: string; formType?: string; nickname?: string };
    const saved = await saveCase(owner, payload);
    return Response.json({ case: saved }, { status: 201 });
  } catch (error) {
    if (error instanceof InvalidReceipt) return Response.json({ error: error.message }, { status: 400 });
    return failure(error);
  }
}

export async function DELETE(request: Request) {
  const owner = await ownerFromRequest(request);
  if (!owner) return unauthorized();
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!id) return Response.json({ error: "Case id is required." }, { status: 400 });
  try {
    await ensureDatabase();
    await getDb().delete(trackedCases).where(and(eq(trackedCases.owner, owner), eq(trackedCases.id, id)));
    return Response.json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}

function failure(error: unknown) {
  return Response.json({ error: error instanceof Error ? error.message : "Unable to update cases." }, { status: 500 });
}
