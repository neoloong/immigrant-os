import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { ensureDatabase, getDb } from "../db";
import { agentTokens } from "../db/schema";
import { ownerFromRequest, unauthorized } from "./auth";

export const PRIVATE_HEADERS = { "cache-control": "private, no-store" };
export const tokenMetadata = {
  id: agentTokens.id, label: agentTokens.label, scopes: agentTokens.scopes,
  createdAt: agentTokens.createdAt, expiresAt: agentTokens.expiresAt,
  lastUsedAt: agentTokens.lastUsedAt, revokedAt: agentTokens.revokedAt,
};

export async function hashAgentToken(token: string) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function authenticateAgent(request: Request) {
  const match = /^Bearer (ios_[a-f0-9]{64})$/i.exec(request.headers.get("authorization") ?? "");
  if (!match) return null;
  await ensureDatabase();
  const now = new Date().toISOString();
  // Re-check expiry/revocation atomically when recording usage. Never trust a
  // cookie, identity header, RPC argument or owner supplied by the client.
  const [token] = await getDb().update(agentTokens).set({ lastUsedAt: now }).where(and(
    eq(agentTokens.tokenHash, await hashAgentToken(match[1])), isNull(agentTokens.revokedAt),
    gt(agentTokens.expiresAt, now),
  )).returning({ owner: agentTokens.owner, scopes: agentTokens.scopes });
  return token && (token.scopes === "read" || token.scopes === "write") ? token : null;
}

export async function handleAgentTokens(request: Request, enabled: boolean): Promise<Response> {
  const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: PRIVATE_HEADERS });
  const owner = await ownerFromRequest(request);
  if (!owner) return unauthorized();
  if (!enabled) return reply({ error: "Agent connections are not enabled on this site." }, 404);
  const method = request.method;
  if (!["GET", "POST", "DELETE"].includes(method)) return new Response(null, { status: 405, headers: { ...PRIVATE_HEADERS, allow: "GET, POST, DELETE" } });
  if (method !== "GET") {
    const origin = request.headers.get("origin");
    if ((origin && origin !== new URL(request.url).origin) || request.headers.get("sec-fetch-site") === "cross-site") return reply({ error: "Invalid request origin." }, 403);
  }
  try {
    await ensureDatabase();
    if (method === "GET") {
      const tokens = await getDb().select(tokenMetadata).from(agentTokens)
        .where(eq(agentTokens.owner, owner)).orderBy(desc(agentTokens.createdAt));
      return reply({ tokens });
    }
    if (method === "DELETE") {
      const id = new URL(request.url).searchParams.get("id");
      if (!id) return reply({ error: "Token id is required." }, 400);
      const changed = await getDb().update(agentTokens).set({ revokedAt: new Date().toISOString() })
        .where(and(eq(agentTokens.id, id), eq(agentTokens.owner, owner), isNull(agentTokens.revokedAt)))
        .returning({ id: agentTokens.id });
      return changed.length ? reply({ ok: true }) : reply({ error: "Active token not found." }, 404);
    }
    if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") return reply({ error: "Use application/json." }, 415);
    let input;
    try { input = await request.json(); } catch { return reply({ error: "Invalid token details." }, 400); }
    if (!input || typeof input !== "object" || Array.isArray(input) ||
      Object.keys(input).some((key) => !["label", "scopes"].includes(key)) ||
      typeof input.label !== "string" || !input.label.trim() || input.label.trim().length > 80 ||
      !["read", "write"].includes(input.scopes)) return reply({ error: "Enter a label (1–80 characters) and read or write scope." }, 400);
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const token = `ios_${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
    const now = new Date();
    const [saved] = await getDb().insert(agentTokens).values({
      id: crypto.randomUUID(), owner, tokenHash: await hashAgentToken(token),
      label: input.label.trim(), scopes: input.scopes, createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 90 * 86400_000).toISOString(),
    }).returning(tokenMetadata);
    return reply({ token, agentToken: saved }, 201);
  } catch {
    return reply({ error: "Agent tokens could not be saved or loaded. Please try again." }, 500);
  }
}
