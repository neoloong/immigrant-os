import { ownerFromRequest, unauthorized } from "../../../lib/auth";
import { InvalidReceipt, listCases, ProfileNotFound, removeCase, saveCase } from "../../../lib/workspace";

export async function GET(request: Request) {
  const owner = await ownerFromRequest(request);
  if (!owner) return unauthorized();
  const profileId = new URL(request.url).searchParams.get("profileId");
  try {
    const cases = await listCases(owner, profileId);
    return Response.json({ cases });
  } catch (error) {
    if (error instanceof ProfileNotFound) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    return failure(error);
  }
}

export async function POST(request: Request) {
  const owner = await ownerFromRequest(request);
  if (!owner) return unauthorized();
  const queryProfileId = new URL(request.url).searchParams.get("profileId");
  try {
    const payload = (await request.json()) as {
      receiptNumber?: string;
      formType?: string;
      nickname?: string;
      profileId?: string;
    };
    const profileId =
      queryProfileId?.trim() ||
      (typeof payload?.profileId === "string" && payload.profileId.trim()
        ? payload.profileId.trim()
        : null);
    const saved = await saveCase(owner, payload, profileId);
    return Response.json({ case: saved }, { status: 201 });
  } catch (error) {
    if (error instanceof InvalidReceipt) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof ProfileNotFound) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    return failure(error);
  }
}

export async function DELETE(request: Request) {
  const owner = await ownerFromRequest(request);
  if (!owner) return unauthorized();
  const url = new URL(request.url);
  const id = url.searchParams.get("id") ?? "";
  const profileId = url.searchParams.get("profileId");
  if (!id) return Response.json({ error: "Case id is required." }, { status: 400 });
  try {
    await removeCase(owner, id, profileId);
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof ProfileNotFound) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    return failure(error);
  }
}

function failure(error: unknown) {
  return Response.json(
    { error: error instanceof Error ? error.message : "Unable to update cases." },
    { status: 500 },
  );
}
