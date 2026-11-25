import { and, desc, eq, lt, sql } from "drizzle-orm";
import { ensureDatabase, getDb } from "../db";
import { loginCodes, profiles } from "../db/schema";
import { getAuthConfig, hmacSha256, issueSession, revokeSession, sessionCookieFromRequest, timingSafeEqual } from "./auth";
import { createMailer, isMailerConfigured, type MailerEnv } from "./mailer";
import {
  brandedLoginPage,
  GOOGLE_LOGIN_ERROR_CODE,
  loginPageResponse,
  UNIFORM_GOOGLE_LOGIN_ERROR,
} from "./public-pages";

export type BrandedLoginEnv = MailerEnv & {
  BRANDED_LOGIN_ENABLED?: string;
  BRANDED_LOGIN_ALLOWLIST?: string;
};

export const LOGIN_CODE_PATH = "/auth/login/code";
export const LOGIN_VERIFY_PATH = "/auth/login/verify";
export const CODE_TTL_MS = 10 * 60 * 1000;
export const MAX_VERIFY_ATTEMPTS = 5;
export const UNIFORM_CODE_SENT_MESSAGE =
  "If your email is authorized for Immigrant OS, we sent a 6-digit sign-in code. It expires in 10 minutes.";
export const UNIFORM_VERIFY_ERROR =
  "Invalid or expired sign-in code. Please try again or request a new code.";

const PRIVATE_HEADERS = { "cache-control": "private, no-store" };
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const EMAIL_CODE_LIMIT = 5;
const IP_CODE_LIMIT = 20;
const IP_VERIFY_LIMIT = 30;
const MAX_TRACKED_KEYS = 2000;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SIX_DIGIT_REGEX = /^\d{6}$/;

const emailCodeWindows = new Map<string, number[]>();
const ipCodeWindows = new Map<string, number[]>();
const ipVerifyWindows = new Map<string, number[]>();

function jsonResponse(body: unknown, status = 200, extraHeaders?: Record<string, string>): Response {
  return Response.json(body, { status, headers: { ...PRIVATE_HEADERS, ...extraHeaders } });
}

function redirect(location: string, cookie?: string): Response {
  const headers = new Headers({ ...PRIVATE_HEADERS, location });
  if (cookie) headers.set("set-cookie", cookie);
  return new Response(null, { status: 303, headers });
}

function isCrossSite(request: Request): boolean {
  const url = new URL(request.url);
  const origin = request.headers.get("origin");
  return Boolean((origin && origin !== url.origin) || request.headers.get("sec-fetch-site") === "cross-site");
}

function clientIp(request: Request): string {
  const cfIp = request.headers.get("cf-connecting-ip")?.trim();
  if (cfIp) return cfIp;
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded;
  return "unknown";
}

function consumeRateLimit(store: Map<string, number[]>, key: string, limit: number, now = Date.now()): { allowed: boolean; retryAfterSeconds: number } {
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  const existing = (store.get(key) ?? []).filter((ts) => ts > cutoff);
  if (existing.length >= limit) {
    store.set(key, existing);
    const retryAfterSeconds = Math.max(1, Math.ceil((existing[0] + RATE_LIMIT_WINDOW_MS - now) / 1000));
    return { allowed: false, retryAfterSeconds };
  }
  existing.push(now);
  store.set(key, existing);
  if (store.size > MAX_TRACKED_KEYS) {
    for (const [entryKey, timestamps] of store) {
      if (timestamps.every((ts) => ts <= cutoff)) store.delete(entryKey);
      if (store.size <= MAX_TRACKED_KEYS) break;
    }
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized.length > 254 || !EMAIL_REGEX.test(normalized)) return null;
  return normalized;
}

export function parseAllowlist(raw?: string): Set<string> {
  const set = new Set<string>();
  if (!raw) return set;
  for (const part of raw.split(/[\s,;]+/)) {
    const email = normalizeEmail(part);
    if (email) set.add(email);
  }
  return set;
}

export function generateSixDigitCode(): string {
  const limit = Math.floor(0x1_0000_0000 / 1_000_000) * 1_000_000;
  const buffer = new Uint32Array(1);
  let value: number;
  do {
    crypto.getRandomValues(buffer);
    value = buffer[0];
  } while (value >= limit);
  return String(value % 1_000_000).padStart(6, "0");
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string): Uint8Array | null {
  if (hex.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(hex)) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export async function hashLoginCode(secret: string, id: string, email: string, code: string): Promise<string> {
  const digest = await hmacSha256(secret, `login-code:v1:${id}:${email}:${code}`);
  return bytesToHex(digest);
}

export async function isEmailEligible(email: string, allowlistRaw?: string): Promise<boolean> {
  if (parseAllowlist(allowlistRaw).has(email)) return true;
  await ensureDatabase();
  const [profile] = await getDb()
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.owner, email))
    .limit(1);
  return Boolean(profile);
}

type ParsedPayload =
  | { ok: true; isJson: boolean; data: Record<string, string> }
  | { ok: false; status: number; isJson: boolean; message: string };

async function parseRequestPayload(request: Request): Promise<ParsedPayload> {
  const contentType = request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
  const wantsJson = contentType === "application/json" || (request.headers.get("accept") ?? "").includes("application/json");
  if (contentType === "application/json") {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return { ok: false, status: 400, isJson: true, message: "Invalid request body." };
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return { ok: false, status: 400, isJson: true, message: "Invalid request body." };
    }
    const data: Record<string, string> = {};
    for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
      if (typeof value === "string") data[key] = value;
    }
    return { ok: true, isJson: true, data };
  }
  if (contentType === "application/x-www-form-urlencoded") {
    const text = await request.text();
    const params = new URLSearchParams(text);
    const data: Record<string, string> = {};
    for (const [key, value] of params.entries()) {
      data[key] = value;
    }
    return { ok: true, isJson: wantsJson, data };
  }
  return { ok: false, status: 415, isJson: wantsJson, message: "Unsupported content type." };
}

export function handleBrandedLoginPage(request: Request): Response {
  if (!["GET", "HEAD"].includes(request.method)) {
    return new Response(null, { status: 405, headers: { ...PRIVATE_HEADERS, allow: "GET, HEAD" } });
  }
  const auth = getAuthConfig();
  const url = new URL(request.url);
  const step = url.searchParams.get("step") === "verify" ? "verify" : "email";
  const error = auth.googleLoginEnabled && url.searchParams.get("error") === GOOGLE_LOGIN_ERROR_CODE
    ? UNIFORM_GOOGLE_LOGIN_ERROR
    : undefined;
  return loginPageResponse(request, brandedLoginPage({ step, error, googleLogin: auth.googleLoginEnabled }));
}

export async function handleBrandedLoginCode(
  request: Request,
  env: BrandedLoginEnv,
  sessionSecret: string,
): Promise<Response> {
  if (request.method !== "POST") {
    return new Response(null, { status: 405, headers: { ...PRIVATE_HEADERS, allow: "POST" } });
  }
  if (isCrossSite(request)) {
    return jsonResponse({ error: "Invalid request origin." }, 403);
  }
  const googleLogin = getAuthConfig().googleLoginEnabled;
  const payload = await parseRequestPayload(request);
  if (!payload.ok) {
    return payload.isJson
      ? jsonResponse({ error: payload.message }, payload.status)
      : loginPageResponse(request, brandedLoginPage({ step: "email", error: payload.message, googleLogin }), payload.status);
  }

  // Check mailer readiness before inspecting any email so misconfiguration fails closed uniformly.
  if (!isMailerConfigured(env)) {
    const message = "Sign-in email delivery is not configured.";
    return payload.isJson
      ? jsonResponse({ error: message }, 503)
      : loginPageResponse(request, brandedLoginPage({ step: "email", error: message, googleLogin }), 503);
  }

  const ipLimit = consumeRateLimit(ipCodeWindows, clientIp(request), IP_CODE_LIMIT);
  if (!ipLimit.allowed) {
    const message = "Too many sign-in code requests. Please wait and try again.";
    const retryHeader = { "retry-after": String(ipLimit.retryAfterSeconds) };
    return payload.isJson
      ? jsonResponse({ error: message }, 429, retryHeader)
      : loginPageResponse(request, brandedLoginPage({ step: "email", error: message, googleLogin }), 429, retryHeader);
  }

  const email = normalizeEmail(payload.data.email);
  if (!email) {
    const message = "Please enter a valid email address.";
    return payload.isJson
      ? jsonResponse({ error: message }, 400)
      : loginPageResponse(request, brandedLoginPage({ step: "email", error: message, googleLogin }), 400);
  }

  // Track per-email rate limit before checking eligibility so throttling cannot enumerate emails.
  const emailLimit = consumeRateLimit(emailCodeWindows, email, EMAIL_CODE_LIMIT);
  if (emailLimit.allowed) {
    const eligible = await isEmailEligible(email, env.BRANDED_LOGIN_ALLOWLIST);
    if (eligible) {
      await ensureDatabase();
      const id = crypto.randomUUID();
      const now = new Date();
      const expiresAt = new Date(now.getTime() + CODE_TTL_MS);
      const code = generateSixDigitCode();
      const codeHash = await hashLoginCode(sessionSecret, id, email, code);
      const db = getDb();

      await db.delete(loginCodes).where(eq(loginCodes.email, email));
      await db.insert(loginCodes).values({
        id,
        email,
        codeHash,
        expiresAt: expiresAt.toISOString(),
        attempts: 0,
        createdAt: now.toISOString(),
      });

      try {
        await createMailer(env).sendLoginCode(email, code);
      } catch {
        // Clean up the undelivered row and log only a fixed non-sensitive code.
        await db.delete(loginCodes).where(eq(loginCodes.id, id));
        console.error("branded_login_mail_failed");
      }
    }
  }

  if (payload.isJson) {
    return jsonResponse({ ok: true, message: UNIFORM_CODE_SENT_MESSAGE }, 200);
  }
  return loginPageResponse(
    request,
    brandedLoginPage({ step: "verify", email, notice: UNIFORM_CODE_SENT_MESSAGE, googleLogin }),
    200,
  );
}

export async function handleBrandedLoginVerify(
  request: Request,
  sessionSecret: string,
): Promise<Response> {
  if (request.method !== "POST") {
    return new Response(null, { status: 405, headers: { ...PRIVATE_HEADERS, allow: "POST" } });
  }
  if (isCrossSite(request)) {
    return jsonResponse({ error: "Invalid request origin." }, 403);
  }
  const googleLogin = getAuthConfig().googleLoginEnabled;
  const payload = await parseRequestPayload(request);
  if (!payload.ok) {
    return payload.isJson
      ? jsonResponse({ error: payload.message }, payload.status)
      : loginPageResponse(request, brandedLoginPage({ step: "verify", error: payload.message, googleLogin }), payload.status);
  }

  const ipLimit = consumeRateLimit(ipVerifyWindows, clientIp(request), IP_VERIFY_LIMIT);
  if (!ipLimit.allowed) {
    const message = "Too many verification attempts. Please wait and try again.";
    const retryHeader = { "retry-after": String(ipLimit.retryAfterSeconds) };
    return payload.isJson
      ? jsonResponse({ error: message }, 429, retryHeader)
      : loginPageResponse(request, brandedLoginPage({ step: "verify", email: payload.data.email ?? "", error: message, googleLogin }), 429, retryHeader);
  }

  const fail = (submittedEmail?: string) =>
    payload.isJson
      ? jsonResponse({ error: UNIFORM_VERIFY_ERROR }, 401)
      : loginPageResponse(
          request,
          brandedLoginPage({ step: "verify", email: submittedEmail, error: UNIFORM_VERIFY_ERROR, googleLogin }),
          401,
        );

  const email = normalizeEmail(payload.data.email);
  const rawCode = typeof payload.data.code === "string" ? payload.data.code.trim() : "";
  if (!email || !rawCode) {
    return fail(payload.data.email);
  }

  await ensureDatabase();
  const db = getDb();
  const [row] = await db
    .select()
    .from(loginCodes)
    .where(eq(loginCodes.email, email))
    .orderBy(desc(loginCodes.createdAt))
    .limit(1);

  if (!row) {
    return fail(email);
  }

  const nowMs = Date.now();
  if (new Date(row.expiresAt).getTime() <= nowMs || row.attempts >= MAX_VERIFY_ATTEMPTS) {
    await db.delete(loginCodes).where(eq(loginCodes.id, row.id));
    return fail(email);
  }

  const storedHashBytes = hexToBytes(row.codeHash);
  let matched = false;
  if (storedHashBytes && SIX_DIGIT_REGEX.test(rawCode)) {
    const expectedHashBytes = await hmacSha256(sessionSecret, `login-code:v1:${row.id}:${row.email}:${rawCode}`);
    matched = timingSafeEqual(storedHashBytes, expectedHashBytes);
  }

  if (!matched) {
    const [updated] = await db
      .update(loginCodes)
      .set({ attempts: sql`${loginCodes.attempts} + 1` })
      .where(eq(loginCodes.id, row.id))
      .returning({ attempts: loginCodes.attempts });
    if (!updated || updated.attempts >= MAX_VERIFY_ATTEMPTS) {
      await db.delete(loginCodes).where(eq(loginCodes.id, row.id));
    }
    return fail(email);
  }

  // Atomically consume the code so it cannot be replayed or double-redeemed.
  const consumed = await db
    .delete(loginCodes)
    .where(and(eq(loginCodes.id, row.id), lt(loginCodes.attempts, MAX_VERIFY_ATTEMPTS)))
    .returning({ id: loginCodes.id });
  if (consumed.length === 0) {
    return fail(email);
  }

  const previous = sessionCookieFromRequest(request);
  if (previous) await revokeSession(previous);
  const session = await issueSession(row.email);
  if (!session) {
    return jsonResponse({ error: "Session signing is not configured." }, 503);
  }
  return redirect(
    "/",
    `${session.cookieName}=${session.cookieValue}; Path=/; Secure; HttpOnly; SameSite=Lax; Expires=${session.expiresAt.toUTCString()}`,
  );
}
