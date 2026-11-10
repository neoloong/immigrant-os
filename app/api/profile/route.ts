import { loadProfile, saveProfile } from "../../../lib/workspace";
import { ownerFromRequest, unauthorized } from "../../../lib/auth";
import { normalizeProfile } from "../../../lib/profile";

export async function GET(request: Request) {
  const owner = await ownerFromRequest(request);
  if (!owner) return unauthorized();

  try {
    const profile = await loadProfile(owner);
    return Response.json({ profile: profile ?? null });
  } catch (error) {
    return databaseError(error);
  }
}

export async function PUT(request: Request) {
  const owner = await ownerFromRequest(request);
  if (!owner) return unauthorized();

  let input;
  try {
    input = normalizeProfile((await request.json()) as Record<string, unknown>);
  } catch (error) {
    return Response.json({ error: error instanceof SyntaxError ? "Enter a valid profile." : error instanceof Error ? error.message : "Invalid profile." }, { status: 400 });
  }
  try {
    const profile = await saveProfile(owner, input);
    return Response.json({ profile });
  } catch (error) {
    return databaseError(error);
  }
}

function databaseError(_error: unknown) {
  return Response.json({ error: "Your workspace could not be saved or loaded. Please try again." }, { status: 500 });
}
