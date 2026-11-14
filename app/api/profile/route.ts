import {
  deleteProfile,
  listProfiles,
  loadProfile,
  ProfileDeleteForbidden,
  ProfileNotFound,
  renameProfile,
  saveProfile,
} from "../../../lib/workspace";
import { ownerFromRequest, unauthorized } from "../../../lib/auth";
import { normalizeProfile } from "../../../lib/profile";

export async function GET(request: Request) {
  const owner = await ownerFromRequest(request);
  if (!owner) return unauthorized();

  const url = new URL(request.url);
  const profileId = url.searchParams.get("profileId");

  try {
    const profiles = await listProfiles(owner);
    if (profileId && profileId.trim()) {
      const profile = await loadProfile(owner, profileId);
      if (!profile) {
        return Response.json({ error: "Profile not found." }, { status: 404 });
      }
      return Response.json({ profile, profiles });
    }
    const profile = profiles.find((row) => row.isPrimary) ?? profiles[0] ?? null;
    return Response.json({ profile, profiles });
  } catch (error) {
    return databaseError(error);
  }
}

export async function PUT(request: Request) {
  const owner = await ownerFromRequest(request);
  if (!owner) return unauthorized();

  const url = new URL(request.url);
  const queryProfileId = url.searchParams.get("profileId");

  let body: Record<string, unknown>;
  let input;
  try {
    body = (await request.json()) as Record<string, unknown>;
    input = normalizeProfile(body);
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof SyntaxError
            ? "Enter a valid profile."
            : error instanceof Error
              ? error.message
              : "Invalid profile.",
      },
      { status: 400 },
    );
  }

  const profileId =
    queryProfileId?.trim() ||
    (typeof body.profileId === "string" && body.profileId.trim()
      ? body.profileId.trim()
      : typeof body.id === "string" && body.id.trim()
        ? body.id.trim()
        : null);

  try {
    const profile = await saveProfile(owner, input, { profileId });
    const profiles = await listProfiles(owner);
    return Response.json({ profile, profiles });
  } catch (error) {
    if (error instanceof ProfileNotFound) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    return databaseError(error);
  }
}

export async function POST(request: Request) {
  const owner = await ownerFromRequest(request);
  if (!owner) return unauthorized();

  let input;
  try {
    input = normalizeProfile((await request.json()) as Record<string, unknown>);
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof SyntaxError
            ? "Enter a valid profile."
            : error instanceof Error
              ? error.message
              : "Invalid profile.",
      },
      { status: 400 },
    );
  }

  try {
    const profile = await saveProfile(owner, input, { create: true });
    const profiles = await listProfiles(owner);
    return Response.json({ profile, profiles }, { status: 201 });
  } catch (error) {
    return databaseError(error);
  }
}

export async function PATCH(request: Request) {
  const owner = await ownerFromRequest(request);
  if (!owner) return unauthorized();

  const url = new URL(request.url);
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Enter a valid profile name." }, { status: 400 });
  }

  const profileId =
    url.searchParams.get("profileId")?.trim() ||
    url.searchParams.get("id")?.trim() ||
    (typeof body?.profileId === "string" ? body.profileId.trim() : "") ||
    (typeof body?.id === "string" ? body.id.trim() : "");

  if (!profileId) {
    return Response.json({ error: "Profile id is required." }, { status: 400 });
  }

  try {
    const profile = await renameProfile(owner, profileId, body?.displayName);
    const profiles = await listProfiles(owner);
    return Response.json({ profile, profiles });
  } catch (error) {
    if (error instanceof ProfileNotFound) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof Error && error.message === "Enter a profile name.") {
      return Response.json({ error: error.message }, { status: 400 });
    }
    return databaseError(error);
  }
}

export async function DELETE(request: Request) {
  const owner = await ownerFromRequest(request);
  if (!owner) return unauthorized();

  const url = new URL(request.url);
  const profileId =
    url.searchParams.get("profileId")?.trim() ||
    url.searchParams.get("id")?.trim() ||
    "";

  if (!profileId) {
    return Response.json({ error: "Profile id is required." }, { status: 400 });
  }

  try {
    await deleteProfile(owner, profileId);
    const profiles = await listProfiles(owner);
    const profile = profiles.find((row) => row.isPrimary) ?? profiles[0] ?? null;
    return Response.json({ ok: true, profile, profiles });
  } catch (error) {
    if (error instanceof ProfileNotFound) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof ProfileDeleteForbidden) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    return databaseError(error);
  }
}

function databaseError(_error: unknown) {
  return Response.json(
    { error: "Your workspace could not be saved or loaded. Please try again." },
    { status: 500 },
  );
}
