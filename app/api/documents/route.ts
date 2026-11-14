import { eq } from "drizzle-orm";
import { ensureDatabase, getDb } from "../../../db";
import { documents } from "../../../db/schema";
import { ownerFromRequest, unauthorized } from "../../../lib/auth";
import { getRuntimeBindings } from "../../../lib/runtime-env";
import {
  getDocument,
  listDocuments,
  loadProfile,
  ProfileNotFound,
  removeDocument,
} from "../../../lib/workspace";

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);

function bucket() {
  return getRuntimeBindings().BUCKET;
}

export async function GET(request: Request) {
  const owner = await ownerFromRequest(request);
  if (!owner) return unauthorized();
  const url = new URL(request.url);
  const downloadId = url.searchParams.get("download");
  const profileId = url.searchParams.get("profileId");

  try {
    await ensureDatabase();
    if (downloadId) {
      const document = await getDocument(owner, downloadId, profileId);
      if (!document) return Response.json({ error: "Document not found." }, { status: 404 });
      const object = await bucket().get(document.objectKey);
      if (!object) return Response.json({ error: "Stored file is unavailable." }, { status: 404 });
      return new Response(object.body, {
        headers: {
          "content-type": document.mimeType,
          "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(document.filename).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16)}`)}`,
          "cache-control": "private, no-store",
        },
      });
    }

    const rows = await listDocuments(owner, profileId);
    return Response.json({ documents: rows });
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
    await ensureDatabase();
    const formData = await request.formData();
    const value = formData.get("file");
    if (!(value instanceof File)) {
      return Response.json({ error: "Choose a PDF, JPEG, or PNG file." }, { status: 400 });
    }
    if (!ALLOWED_TYPES.has(value.type)) {
      return Response.json({ error: "Only PDF, JPEG, and PNG files are supported." }, { status: 400 });
    }
    if (value.size <= 0 || value.size > MAX_BYTES) {
      return Response.json({ error: "File must be between 1 byte and 10 MB." }, { status: 400 });
    }

    const formProfileId = formData.get("profileId");
    const requestedProfileId =
      queryProfileId?.trim() ||
      (typeof formProfileId === "string" && formProfileId.trim() ? formProfileId.trim() : null);

    const profile = await loadProfile(owner, requestedProfileId);
    if (!profile && requestedProfileId) {
      return Response.json({ error: "Profile not found." }, { status: 404 });
    }
    const targetProfileId = profile?.id ?? "";

    const kind = String(formData.get("kind") ?? "Other").trim().slice(0, 40) || "Other";
    const id = crypto.randomUUID();
    const ownerDigest = await sha256(owner);
    const safeName = value.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120) || "document";
    const objectKey = `${ownerDigest}/${id}/${safeName}`;
    await bucket().put(objectKey, await value.arrayBuffer(), {
      httpMetadata: { contentType: value.type },
      customMetadata: { ownerDigest, documentId: id },
    });

    try {
      await getDb().insert(documents).values({
        id,
        owner,
        profileId: targetProfileId,
        kind,
        filename: value.name.slice(0, 180),
        mimeType: value.type,
        sizeBytes: value.size,
        objectKey,
      });
    } catch (error) {
      await bucket().delete(objectKey);
      throw error;
    }

    const [saved] = await getDb()
      .select({
        id: documents.id,
        profileId: documents.profileId,
        kind: documents.kind,
        filename: documents.filename,
        mimeType: documents.mimeType,
        sizeBytes: documents.sizeBytes,
        uploadedAt: documents.uploadedAt,
      })
      .from(documents)
      .where(eq(documents.id, id))
      .limit(1);
    return Response.json({ document: saved }, { status: 201 });
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(request: Request) {
  const owner = await ownerFromRequest(request);
  if (!owner) return unauthorized();
  const url = new URL(request.url);
  const id = url.searchParams.get("id") ?? "";
  const profileId = url.searchParams.get("profileId");
  if (!id) return Response.json({ error: "Document id is required." }, { status: 400 });
  try {
    const removed = await removeDocument(owner, id, profileId);
    if (!removed) return Response.json({ error: "Document not found." }, { status: 404 });
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof ProfileNotFound) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    return failure(error);
  }
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function failure(error: unknown) {
  return Response.json(
    { error: error instanceof Error ? error.message : "Unable to update documents." },
    { status: 500 },
  );
}
