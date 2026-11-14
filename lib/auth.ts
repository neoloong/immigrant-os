import { eq } from "drizzle-orm";
import { ensureDatabase, getDb } from "../db";
import { sessions } from "../db/schema";

const AUTH_EMAIL_HEADER = "oai-authenticated-user-email";
const SESSION_COOKIE_NAME = "immigrant_session";
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
const PREVIEW_OWNER = "preview@immigrantos.local";

export type AuthConfig = {
  authMode: "dispatch" | "session";
  sessionSecret: string | null;
  sessionCookieName: string;
  sessionTtlSeconds: number;
};

type InjectedAuthConfig = {
  authMode?: string;
  sessionSecret?: string;
};

export function getAuthConfig(): AuthConfig {
  const injected = (globalThis as typeof globalThis & {
    __IMMIGRANT_AUTH_CONFIG__?: InjectedAuthConfig;
  }).__IMMIGRANT_AUTH_CONFIG__;
  const authMode = injected?.authMode ?? import.meta.env.VITE_AUTH_MODE ?? "dispatch";
  const sessionSecret = injected?.sessionSecret ?? import.meta.env.VITE_SESSION_SECRET ?? null;
  return {
    authMode: authMode === "session" ? "session" : "dispatch",
    sessionSecret: typeof sessionSecret === "string" && sessionSecret.length >= 32 ? sessionSecret : null,
    sessionCookieName: SESSION_COOKIE_NAME,
    sessionTtlSeconds: SESSION_TTL_SECONDS,
  };
}

export async function ownerFromRequest(request: Request): Promise<string | null> {
  const config = getAuthConfig();
  const hostname = new URL(request.url).hostname;
  if (config.authMode === "dispatch" && import.meta.env.DEV && (hostname === "terminal.local" || hostname === "localhost" || hostname === "127.0.0.1")) {
    return PREVIEW_OWNER;
  }

  if (config.authMode === "dispatch") {
    const email = request.headers.get(AUTH_EMAIL_HEADER)?.trim().toLowerCase();
    if (email) return email;
  }

  return ownerFromSessionCookie(request, config);
}

export function unauthorized() {
  return Response.json({ error: "Sign in to access your immigration workspace." }, { status: 401 });
}

export async function issueSession(owner: string): Promise<{ cookieName: string; cookieValue: string; expiresAt: Date } | null> {
  const config = getAuthConfig();
  if (!config.sessionSecret) return null;

  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + config.sessionTtlSeconds * 1000);
  await ensureDatabase();
  await getDb().insert(sessions).values({ id, owner, expiresAt: expiresAt.toISOString() });
  return {
    cookieName: config.sessionCookieName,
    cookieValue: await signSessionValue(id, config.sessionSecret),
    expiresAt,
  };
}

export async function revokeSession(cookieValue: string): Promise<void> {
  const config = getAuthConfig();
  if (!config.sessionSecret) return;
  const id = await verifySessionValue(cookieValue, config.sessionSecret);
  if (!id) return;
  await ensureDatabase();
  await getDb().delete(sessions).where(eq(sessions.id, id));
}

export function sessionCookieFromRequest(request: Request): string | null {
  return readCookie(request, getAuthConfig().sessionCookieName);
}

async function ownerFromSessionCookie(request: Request, config: AuthConfig): Promise<string | null> {
  if (!config.sessionSecret) return null;
  const cookieValue = readCookie(request, config.sessionCookieName);
  if (!cookieValue) return null;
  const id = await verifySessionValue(cookieValue, config.sessionSecret);
  if (!id) return null;
  await ensureDatabase();
  const [row] = await getDb().select().from(sessions).where(eq(sessions.id, id)).limit(1);
  if (!row) return null;
  if (new Date(row.expiresAt).getTime() <= Date.now()) return null;
  return row.owner;
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return null;
}

async function signSessionValue(id: string, secret: string): Promise<string> {
  const signature = await hmacSha256(secret, id);
  return `${id}.${base64UrlEncode(signature)}`;
}

async function verifySessionValue(value: string, secret: string): Promise<string | null> {
  const dot = value.lastIndexOf(".");
  if (dot <= 0 || dot === value.length - 1) return null;
  const id = value.slice(0, dot);
  let signature: Uint8Array;
  try {
    signature = base64UrlDecode(value.slice(dot + 1));
  } catch {
    return null;
  }
  const expected = await hmacSha256(secret, id);
  if (!timingSafeEqual(signature, expected)) return null;
  return id;
}

async function hmacSha256(secret: string, message: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return new Uint8Array(signature);
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value: string): Uint8Array {
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
