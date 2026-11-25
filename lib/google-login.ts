import {
  getAuthConfig,
  hmacSha256,
  issueSession,
  revokeSession,
  sessionCookieFromRequest,
  timingSafeEqual,
} from "./auth";
import { isEmailEligible, normalizeEmail, type BrandedLoginEnv } from "./branded-login";
import { GOOGLE_LOGIN_ERROR_CODE } from "./public-pages";

export const GOOGLE_START_PATH = "/auth/google/start";
export const GOOGLE_CALLBACK_PATH = "/auth/google/callback";
export const GOOGLE_OAUTH_COOKIE_NAME = "immigrant_google_oauth";
export const GOOGLE_OAUTH_TTL_SECONDS = 10 * 60;
export const GOOGLE_IAT_MAX_FUTURE_SKEW_SECONDS = 300;
export const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
export const GOOGLE_JWKS_ENDPOINT = "https://www.googleapis.com/oauth2/v3/certs";

export type GoogleLoginEnv = {
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
};

type GoogleCallbackEnv = GoogleLoginEnv & Pick<BrandedLoginEnv, "BRANDED_LOGIN_ALLOWLIST">;

type GoogleClientConfig = {
  clientId: string;
  clientSecret: string;
};

type GoogleOAuthCookiePayload = {
  state: string;
  code_verifier: string;
  nonce: string;
  exp: number;
};

type GoogleJwk = JsonWebKey & { kid?: string };

type JwksCacheEntry = {
  keys: GoogleJwk[];
  expiresAt: number;
};

export type GoogleIdTokenFailureReason =
  | "bad_structure"
  | "bad_header"
  | "jwks_unavailable"
  | "key_mismatch"
  | "bad_signature"
  | "bad_claims"
  | "unverified_email"
  | "no_email";

export type GoogleIdTokenResult =
  | { ok: true; email: string }
  | { ok: false; reason: GoogleIdTokenFailureReason };

const PRIVATE_HEADERS = { "cache-control": "private, no-store" };
const OAUTH_COOKIE_DOMAIN = "google-oauth:v1:";
const GOOGLE_ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);
const FETCH_TIMEOUT_MS = 10_000;
const DEFAULT_JWKS_TTL_SECONDS = 300;
const MAX_JWKS_TTL_SECONDS = 3600;
const MAX_JWT_LENGTH = 32_768;
const MAX_OAUTH_COOKIE_LENGTH = 4096;
const CLEAR_OAUTH_COOKIE =
  `${GOOGLE_OAUTH_COOKIE_NAME}=; Path=/auth/google; Secure; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;

let jwksCache: JwksCacheEntry | undefined;
let pendingJwks: Promise<JwksCacheEntry> | undefined;

export function resetGoogleJwksCache(): void {
  jwksCache = undefined;
  pendingJwks = undefined;
}

function googleClientConfig(env: GoogleLoginEnv): GoogleClientConfig | null {
  const clientId = env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> {
  if (!value || value.length % 4 === 1 || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error("Invalid base64url encoding");
  }
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function decodeJsonObject(encoded: string): Record<string, unknown> {
  const decoded = new TextDecoder("utf-8", { fatal: true }).decode(decodeBase64Url(encoded));
  const parsed: unknown = JSON.parse(decoded);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Invalid JSON object");
  }
  return parsed as Record<string, unknown>;
}

function randomBase64Url(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return encodeBase64Url(bytes);
}

async function computeCodeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return encodeBase64Url(new Uint8Array(digest));
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    const value = part.slice(separator + 1).trim();
    return value.startsWith('"') && value.endsWith('"') && value.length >= 2
      ? value.slice(1, -1)
      : value;
  }
  return null;
}

async function signOAuthCookie(payload: GoogleOAuthCookiePayload, secret: string): Promise<string> {
  const encodedPayload = encodeBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await hmacSha256(secret, `${OAUTH_COOKIE_DOMAIN}${encodedPayload}`);
  return `${encodedPayload}.${encodeBase64Url(signature)}`;
}

async function verifyOAuthCookie(
  rawCookie: string,
  secret: string,
  nowSeconds: number,
): Promise<GoogleOAuthCookiePayload | null> {
  if (!rawCookie || rawCookie.length > MAX_OAUTH_COOKIE_LENGTH) return null;
  const dot = rawCookie.indexOf(".");
  if (dot <= 0 || dot !== rawCookie.lastIndexOf(".") || dot === rawCookie.length - 1) return null;
  const encodedPayload = rawCookie.slice(0, dot);
  const encodedSignature = rawCookie.slice(dot + 1);
  let signature: Uint8Array;
  try {
    signature = decodeBase64Url(encodedSignature);
  } catch {
    return null;
  }
  const expected = await hmacSha256(secret, `${OAUTH_COOKIE_DOMAIN}${encodedPayload}`);
  if (!timingSafeEqual(signature, expected)) return null;

  let parsed: Record<string, unknown>;
  try {
    parsed = decodeJsonObject(encodedPayload);
  } catch {
    return null;
  }

  const { state, code_verifier: codeVerifier, nonce, exp } = parsed;
  if (
    typeof state !== "string"
    || state.length < 32
    || typeof codeVerifier !== "string"
    || codeVerifier.length < 43
    || codeVerifier.length > 128
    || typeof nonce !== "string"
    || nonce.length < 16
    || typeof exp !== "number"
    || !Number.isFinite(exp)
    || exp <= nowSeconds
  ) {
    return null;
  }
  return { state, code_verifier: codeVerifier, nonce, exp };
}

function buildOAuthSetCookie(value: string, expiresAt: Date): string {
  return `${GOOGLE_OAUTH_COOKIE_NAME}=${value}; Path=/auth/google; Secure; HttpOnly; SameSite=Lax; Max-Age=${GOOGLE_OAUTH_TTL_SECONDS}; Expires=${expiresAt.toUTCString()}`;
}

function parseJwksTtlSeconds(cacheControl: string | null): number {
  if (!cacheControl) return DEFAULT_JWKS_TTL_SECONDS;
  if (/\bno-store\b/i.test(cacheControl)) return 0;
  const match = /\bmax-age=(\d+)\b/i.exec(cacheControl);
  if (!match) return DEFAULT_JWKS_TTL_SECONDS;
  const parsed = Number.parseInt(match[1], 10);
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_JWKS_TTL_SECONDS;
  return Math.min(MAX_JWKS_TTL_SECONDS, parsed);
}

async function fetchGoogleJwks(forceRefresh: boolean): Promise<{ keys: GoogleJwk[]; fromCache: boolean }> {
  const now = Date.now();
  if (!forceRefresh && jwksCache && jwksCache.expiresAt > now) {
    return { keys: jwksCache.keys, fromCache: true };
  }
  if (!forceRefresh && pendingJwks) {
    return { keys: (await pendingJwks).keys, fromCache: false };
  }

  const requestPromise = (async (): Promise<JwksCacheEntry> => {
    const response = await fetch(GOOGLE_JWKS_ENDPOINT, {
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error("Google JWKS unavailable");
    }
    const body = await response.json() as { keys?: unknown };
    if (!Array.isArray(body.keys) || !body.keys.every((key) => key && typeof key === "object")) {
      throw new Error("Invalid Google JWKS payload");
    }
    const ttlSeconds = parseJwksTtlSeconds(response.headers.get("cache-control"));
    const entry: JwksCacheEntry = {
      keys: body.keys as GoogleJwk[],
      expiresAt: Date.now() + ttlSeconds * 1000,
    };
    jwksCache = entry;
    return entry;
  })();

  pendingJwks = requestPromise;
  try {
    return { keys: (await requestPromise).keys, fromCache: false };
  } finally {
    if (pendingJwks === requestPromise) {
      pendingJwks = undefined;
    }
  }
}

function findMatchingKey(keys: GoogleJwk[], kid: string): GoogleJwk | null {
  const matches = keys.filter(
    (key) =>
      key.kid === kid
      && key.kty === "RSA"
      && (key.alg === undefined || key.alg === "RS256")
      && (key.use === undefined || key.use === "sig"),
  );
  return matches.length === 1 ? matches[0] : null;
}

function isEmailVerifiedClaim(value: unknown): boolean {
  return value === true || value === "true";
}

function constantTimeStringEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  return timingSafeEqual(encoder.encode(a), encoder.encode(b));
}

export async function verifyGoogleIdToken(
  idToken: string,
  options: { clientId: string; expectedNonce: string; nowSeconds?: number },
): Promise<GoogleIdTokenResult> {
  if (!idToken || idToken.length > MAX_JWT_LENGTH) {
    return { ok: false, reason: "bad_structure" };
  }
  const parts = idToken.split(".");
  if (parts.length !== 3 || parts.some((part) => !part)) {
    return { ok: false, reason: "bad_structure" };
  }
  const [encodedHeader, encodedPayload, encodedSignature] = parts;

  let header: Record<string, unknown>;
  try {
    header = decodeJsonObject(encodedHeader);
  } catch {
    return { ok: false, reason: "bad_header" };
  }
  if (header.alg !== "RS256" || typeof header.kid !== "string" || !header.kid || header.crit !== undefined) {
    return { ok: false, reason: "bad_header" };
  }

  let payload: Record<string, unknown>;
  let signature: Uint8Array<ArrayBuffer>;
  try {
    payload = decodeJsonObject(encodedPayload);
    signature = decodeBase64Url(encodedSignature);
  } catch {
    return { ok: false, reason: "bad_structure" };
  }

  let jwk: GoogleJwk | null = null;
  try {
    const initial = await fetchGoogleJwks(false);
    jwk = findMatchingKey(initial.keys, header.kid);
    if (!jwk && initial.fromCache) {
      const refreshed = await fetchGoogleJwks(true);
      jwk = findMatchingKey(refreshed.keys, header.kid);
    }
  } catch {
    return { ok: false, reason: "jwks_unavailable" };
  }
  if (!jwk) {
    return { ok: false, reason: "key_mismatch" };
  }

  let cryptoKey: CryptoKey;
  try {
    cryptoKey = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
  } catch {
    return { ok: false, reason: "key_mismatch" };
  }

  try {
    const valid = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      cryptoKey,
      signature,
      new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
    );
    if (!valid) {
      return { ok: false, reason: "bad_signature" };
    }
  } catch {
    return { ok: false, reason: "bad_signature" };
  }

  const now = options.nowSeconds ?? Date.now() / 1000;
  if (
    typeof payload.iss !== "string"
    || !GOOGLE_ISSUERS.has(payload.iss)
    || payload.aud !== options.clientId
    || typeof payload.exp !== "number"
    || !Number.isFinite(payload.exp)
    || payload.exp <= now
    || typeof payload.iat !== "number"
    || !Number.isFinite(payload.iat)
    || payload.iat <= 0
    || payload.iat > now + GOOGLE_IAT_MAX_FUTURE_SKEW_SECONDS
    || (payload.nbf !== undefined
      && (typeof payload.nbf !== "number"
        || !Number.isFinite(payload.nbf)
        || payload.nbf > now + GOOGLE_IAT_MAX_FUTURE_SKEW_SECONDS))
    || typeof payload.nonce !== "string"
    || !constantTimeStringEqual(payload.nonce, options.expectedNonce)
  ) {
    return { ok: false, reason: "bad_claims" };
  }

  if (!isEmailVerifiedClaim(payload.email_verified)) {
    return { ok: false, reason: "unverified_email" };
  }

  const email = normalizeEmail(payload.email);
  if (!email) {
    return { ok: false, reason: "no_email" };
  }

  return { ok: true, email };
}

async function exchangeAuthorizationCode(params: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  codeVerifier: string;
}): Promise<string | null> {
  try {
    const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: params.code,
        client_id: params.clientId,
        client_secret: params.clientSecret,
        redirect_uri: params.redirectUri,
        code_verifier: params.codeVerifier,
      }).toString(),
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const body = await response.json() as Record<string, unknown>;
    if (!body || typeof body !== "object" || typeof body.id_token !== "string" || !body.id_token) {
      return null;
    }
    return body.id_token;
  } catch {
    return null;
  }
}

function callbackFailure(reason: string): Response {
  console.error(`google_login_${reason}`);
  const headers = new Headers({
    ...PRIVATE_HEADERS,
    location: `/auth/login?error=${GOOGLE_LOGIN_ERROR_CODE}`,
  });
  headers.append("set-cookie", CLEAR_OAUTH_COOKIE);
  return new Response(null, { status: 303, headers });
}

export async function handleGoogleStart(
  request: Request,
  env: GoogleLoginEnv,
  sessionSecret?: string,
): Promise<Response> {
  if (request.method !== "GET") {
    return new Response(null, { status: 405, headers: { ...PRIVATE_HEADERS, allow: "GET" } });
  }
  const clientConfig = googleClientConfig(env);
  if (!clientConfig) {
    return new Response("Not found", { status: 404, headers: PRIVATE_HEADERS });
  }
  const secret = sessionSecret ?? getAuthConfig().sessionSecret;
  if (!secret) {
    return Response.json({ error: "Sign-in is not configured." }, { status: 503, headers: PRIVATE_HEADERS });
  }

  const state = randomBase64Url(32);
  const codeVerifier = randomBase64Url(48);
  const codeChallenge = await computeCodeChallenge(codeVerifier);
  const nonce = randomBase64Url(32);
  const expiresAt = new Date(Date.now() + GOOGLE_OAUTH_TTL_SECONDS * 1000);
  const exp = Math.floor(expiresAt.getTime() / 1000);
  const cookieValue = await signOAuthCookie(
    { state, code_verifier: codeVerifier, nonce, exp },
    secret,
  );

  const requestUrl = new URL(request.url);
  const redirectUri = `${requestUrl.origin}${GOOGLE_CALLBACK_PATH}`;
  const authUrl = new URL(GOOGLE_AUTH_ENDPOINT);
  authUrl.searchParams.set("client_id", clientConfig.clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid email");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("nonce", nonce);
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");
  authUrl.searchParams.set("prompt", "select_account");

  const headers = new Headers({
    ...PRIVATE_HEADERS,
    location: authUrl.toString(),
  });
  headers.append("set-cookie", buildOAuthSetCookie(cookieValue, expiresAt));
  return new Response(null, { status: 303, headers });
}

export async function handleGoogleCallback(
  request: Request,
  env: GoogleCallbackEnv,
  sessionSecret: string,
): Promise<Response> {
  if (request.method !== "GET") {
    return new Response(null, { status: 405, headers: { ...PRIVATE_HEADERS, allow: "GET" } });
  }
  const clientConfig = googleClientConfig(env);
  if (!clientConfig) {
    return new Response("Not found", { status: 404, headers: PRIVATE_HEADERS });
  }
  if (!sessionSecret) {
    return Response.json({ error: "Sign-in is not configured." }, { status: 503, headers: PRIVATE_HEADERS });
  }

  const url = new URL(request.url);
  if (url.searchParams.has("error")) {
    return callbackFailure("provider_error");
  }

  const code = url.searchParams.get("code")?.trim();
  const state = url.searchParams.get("state")?.trim();
  if (!code || !state) {
    return callbackFailure("missing_params");
  }

  const rawCookie = readCookie(request, GOOGLE_OAUTH_COOKIE_NAME);
  if (!rawCookie) {
    return callbackFailure("missing_cookie");
  }

  const cookiePayload = await verifyOAuthCookie(rawCookie, sessionSecret, Date.now() / 1000);
  if (!cookiePayload) {
    return callbackFailure("invalid_cookie");
  }
  if (!constantTimeStringEqual(state, cookiePayload.state)) {
    return callbackFailure("state_mismatch");
  }

  const redirectUri = `${url.origin}${GOOGLE_CALLBACK_PATH}`;
  const idToken = await exchangeAuthorizationCode({
    code,
    clientId: clientConfig.clientId,
    clientSecret: clientConfig.clientSecret,
    redirectUri,
    codeVerifier: cookiePayload.code_verifier,
  });
  if (!idToken) {
    return callbackFailure("token_exchange_failed");
  }

  const verified = await verifyGoogleIdToken(idToken, {
    clientId: clientConfig.clientId,
    expectedNonce: cookiePayload.nonce,
  });
  if (!verified.ok) {
    return callbackFailure(verified.reason);
  }

  const eligible = await isEmailEligible(verified.email, env.BRANDED_LOGIN_ALLOWLIST);
  if (!eligible) {
    return callbackFailure("ineligible");
  }

  const previous = sessionCookieFromRequest(request);
  if (previous) await revokeSession(previous);
  const session = await issueSession(verified.email);
  if (!session) {
    return callbackFailure("session_unavailable");
  }

  const headers = new Headers({
    ...PRIVATE_HEADERS,
    location: "/",
  });
  headers.append(
    "set-cookie",
    `${session.cookieName}=${session.cookieValue}; Path=/; Secure; HttpOnly; SameSite=Lax; Expires=${session.expiresAt.toUTCString()}`,
  );
  headers.append("set-cookie", CLEAR_OAUTH_COOKIE);
  return new Response(null, { status: 303, headers });
}
