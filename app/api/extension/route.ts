import { ownerFromRequest, unauthorized } from "../../../lib/auth";
import { loadExtensionHelper, ProfileNotFound, setExtensionRequestedUntil } from "../../../lib/workspace";

// Extension of stay (Form I-539) helper data for a VISITOR profile: dates
// computed from the saved I-94 date and the per-profile checklist. Checklist
// items are toggled through POST /api/actions with their i539:* keys.
export async function GET(request: Request) {
  const owner = await ownerFromRequest(request);
  if (!owner) return unauthorized();
  const profileId = new URL(request.url).searchParams.get("profileId");
  try {
    const result = await loadExtensionHelper(owner, profileId);
    if (!result) {
      return profileId && profileId.trim()
        ? Response.json({ error: "Profile not found." }, { status: 404 })
        : Response.json({ extension: null });
    }
    return Response.json(result);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to load the extension helper." },
      { status: 500 },
    );
  }
}

const INPUT_ERRORS = new Set([
  "Enter the requested-until date as YYYY-MM-DD.",
  "The requested-until date must be after the I-94 admit-until date.",
  "The extension helper is only available for visitor (B-1/B-2) profiles.",
  "Add the I-94 admit-until date to this profile first.",
]);

// Body: { requestedUntil: "YYYY-MM-DD" | null }. null restores the default.
export async function PUT(request: Request) {
  const owner = await ownerFromRequest(request);
  if (!owner) return unauthorized();
  const queryProfileId = new URL(request.url).searchParams.get("profileId");
  let body: { requestedUntil?: unknown; profileId?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "Enter the requested-until date as YYYY-MM-DD." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || !("requestedUntil" in body)) {
    return Response.json({ error: "Enter the requested-until date as YYYY-MM-DD." }, { status: 400 });
  }
  const profileId =
    queryProfileId?.trim() ||
    (typeof body.profileId === "string" && body.profileId.trim() ? body.profileId.trim() : null);
  try {
    return Response.json(await setExtensionRequestedUntil(owner, body.requestedUntil, profileId));
  } catch (error) {
    if (error instanceof ProfileNotFound) return Response.json({ error: error.message }, { status: 404 });
    if (error instanceof Error && INPUT_ERRORS.has(error.message)) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to save the requested-until date." },
      { status: 500 },
    );
  }
}
