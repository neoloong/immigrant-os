import { and, desc, eq } from "drizzle-orm";
import { ensureDatabase, getDb } from "../../../db";
import { trackedCases } from "../../../db/schema";
import { ownerFromRequest, unauthorized } from "../../../lib/auth";

const RECEIPT_PATTERN = /^[A-Z]{3}\d{10}$/;

export async function GET(request: Request) {
  const owner = ownerFromRequest(request);
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
  const owner = ownerFromRequest(request);
  if (!owner) return unauthorized();
  try {
    await ensureDatabase();
    const payload = (await request.json()) as { receiptNumber?: string; formType?: string; nickname?: string };
    const receiptNumber = String(payload.receiptNumber ?? "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
    if (!RECEIPT_PATTERN.test(receiptNumber)) {
      return Response.json({ error: "Enter a 13-character USCIS receipt number (3 letters and 10 digits)." }, { status: 400 });
    }
    const item = {
      id: crypto.randomUUID(),
      owner,
      receiptNumber,
      formType: String(payload.formType ?? "").trim().slice(0, 30),
      nickname: String(payload.nickname ?? "").trim().slice(0, 80),
    };
    await getDb().insert(trackedCases).values(item).onConflictDoUpdate({
      target: [trackedCases.owner, trackedCases.receiptNumber],
      set: { formType: item.formType, nickname: item.nickname },
    });
    const [saved] = await getDb().select().from(trackedCases)
      .where(and(eq(trackedCases.owner, owner), eq(trackedCases.receiptNumber, receiptNumber)))
      .limit(1);
    return Response.json({ case: saved }, { status: 201 });
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(request: Request) {
  const owner = ownerFromRequest(request);
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
