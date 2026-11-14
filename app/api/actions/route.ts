import { ownerFromRequest, unauthorized } from "../../../lib/auth";
import { ProfileNotFound, setActionCompleted } from "../../../lib/workspace";

export async function POST(request: Request) {
  const owner = await ownerFromRequest(request);
  if (!owner) return unauthorized();

  const queryProfileId = new URL(request.url).searchParams.get("profileId");

  try {
    const payload = (await request.json()) as {
      actionKey?: string;
      completed?: boolean;
      profileId?: string;
    };
    const profileId =
      queryProfileId?.trim() ||
      (typeof payload?.profileId === "string" && payload.profileId.trim()
        ? payload.profileId.trim()
        : null);
    await setActionCompleted(owner, payload, profileId);
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof ProfileNotFound) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    if (
      error instanceof Error &&
      (error.message === "Completion must be true or false." ||
        error.message === "Action key is required." ||
        error.message === "This action changed. Refresh your plan and try again.")
    ) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to update action." },
      { status: 500 },
    );
  }
}
