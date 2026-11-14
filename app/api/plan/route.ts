import { ownerFromRequest, unauthorized } from "../../../lib/auth";
import { loadPlan, loadProfile } from "../../../lib/workspace";

export async function GET(request: Request) {
  const owner = await ownerFromRequest(request);
  if (!owner) return unauthorized();

  const profileId = new URL(request.url).searchParams.get("profileId");

  try {
    if (profileId && profileId.trim()) {
      const profile = await loadProfile(owner, profileId);
      if (!profile) {
        return Response.json({ error: "Profile not found." }, { status: 404 });
      }
    }
    return Response.json({ plan: await loadPlan(owner, profileId) });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to calculate plan." },
      { status: 500 },
    );
  }
}
