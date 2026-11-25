import { getAuthConfig, issueSession, ownerFromRequest, ownerFromSessionCookie, revokeSession, sessionCookieFromRequest } from "./auth";
import { accessConfig, verifyAccessIdentityDetailed, type AccessEnv } from "./access-jwt";
import { handleBrandedLoginCode, handleBrandedLoginPage, handleBrandedLoginVerify, LOGIN_CODE_PATH, LOGIN_VERIFY_PATH, type BrandedLoginEnv } from "./branded-login";
import {
  GOOGLE_CALLBACK_PATH,
  GOOGLE_START_PATH,
  handleGoogleCallback,
  handleGoogleStart,
  type GoogleLoginEnv,
} from "./google-login";
import { landingPage, publicPageResponse } from "./public-pages";

const PRIVATE_HEADERS = { "cache-control": "private, no-store" };

function redirect(location: string, cookie?: string): Response {
  const headers = new Headers({ ...PRIVATE_HEADERS, location });
  if (cookie) headers.set("set-cookie", cookie);
  return new Response(null, { status: 303, headers });
}

function error(message: string, status: number): Response {
  return Response.json({ error: message }, { status, headers: PRIVATE_HEADERS });
}

function hasAccessToken(request: Request): boolean {
  if (request.headers.get("Cf-Access-Jwt-Assertion")) return true;
  return (request.headers.get("cookie") ?? "").split(";").some((part) => part.split("=")[0]?.trim() === "CF_Authorization");
}

// Called before routing, including API and image requests. Returning null allows
// a request through only after Access and the app session identify the same owner
// (or, when brandedLoginEnabled is on, after validating the app session cookie).
export async function handleAccessAuth(request: Request, env: AccessEnv & BrandedLoginEnv & GoogleLoginEnv): Promise<Response | null> {
  const url = new URL(request.url);
  const auth = getAuthConfig();
  if (url.pathname === "/auth/login") {
    if (auth.authMode === "session" && auth.brandedLoginEnabled) {
      if (!auth.sessionSecret) return error("Sign-in is not configured.", 503);
      return handleBrandedLoginPage(request);
    }
    return redirect(auth.authMode === "session" ? "/auth/access" : "/signin-with-chatgpt?return_to=%2F");
  }
  if (auth.authMode === "session" && auth.brandedLoginEnabled) {
    if (url.pathname === LOGIN_CODE_PATH) {
      if (!auth.sessionSecret) return error("Sign-in is not configured.", 503);
      return handleBrandedLoginCode(request, env, auth.sessionSecret);
    }
    if (url.pathname === LOGIN_VERIFY_PATH) {
      if (!auth.sessionSecret) return error("Sign-in is not configured.", 503);
      return handleBrandedLoginVerify(request, auth.sessionSecret);
    }
    if (auth.googleLoginEnabled) {
      if (url.pathname === GOOGLE_START_PATH) {
        if (request.method !== "GET") {
          return new Response(null, { status: 405, headers: { ...PRIVATE_HEADERS, allow: "GET" } });
        }
        if (!auth.sessionSecret) return error("Sign-in is not configured.", 503);
        return handleGoogleStart(request, env, auth.sessionSecret);
      }
      if (url.pathname === GOOGLE_CALLBACK_PATH) {
        if (request.method !== "GET") {
          return new Response(null, { status: 405, headers: { ...PRIVATE_HEADERS, allow: "GET" } });
        }
        if (!auth.sessionSecret) return error("Sign-in is not configured.", 503);
        return handleGoogleCallback(request, env, auth.sessionSecret);
      }
    }
  }
  if (url.pathname === "/auth/logout") {
    if (request.method !== "POST") return new Response(null, { status: 405, headers: { ...PRIVATE_HEADERS, allow: "POST" } });
    const origin = request.headers.get("origin");
    if ((origin && origin !== url.origin) || request.headers.get("sec-fetch-site") === "cross-site") return error("Invalid logout origin.", 403);
    if (auth.authMode !== "session") return redirect("/signout-with-chatgpt?return_to=%2F");
    const cookie = sessionCookieFromRequest(request);
    if (cookie) await revokeSession(cookie);
    const clearCookie = `${auth.sessionCookieName}=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
    const logoutTarget = auth.brandedLoginEnabled && (!accessConfig(env) || !hasAccessToken(request)) ? "/" : "/cdn-cgi/access/logout";
    return redirect(logoutTarget, clearCookie);
  }
  if (auth.authMode !== "session") {
    return url.pathname === "/auth/access" ? error("Access sign-in is disabled.", 503) : null;
  }
  const config = accessConfig(env);
  if (auth.brandedLoginEnabled) {
    if (!auth.sessionSecret) return error("Sign-in is not configured.", 503);
    if (url.pathname !== "/auth/access") {
      const sessionOwner = await ownerFromSessionCookie(request, auth);
      if (sessionOwner) return null;
      if (!config) {
        if (url.pathname === "/" && (request.method === "GET" || request.method === "HEAD")) {
          return publicPageResponse(request, landingPage());
        }
        return error("Sign in to access your immigration workspace.", 401);
      }
    }
  }
  if (!config || !auth.sessionSecret) return error("Access sign-in is not configured.", 503);
  if (url.pathname === "/auth/access" && request.method !== "GET") {
    return new Response(null, { status: 405, headers: { ...PRIVATE_HEADERS, allow: "GET" } });
  }
  const identity = await verifyAccessIdentityDetailed(request, config);
  if (identity.reason !== "ok") {
    // A visitor with no valid Access identity has no app session (sessions are
    // only honored alongside a matching Access identity). The root then shows
    // the static public landing page, which contains no user data. Every other
    // path, and every non-GET/HEAD root request, is still rejected below.
    if (url.pathname === "/" && (request.method === "GET" || request.method === "HEAD")) {
      return publicPageResponse(request, landingPage());
    }
    // Server-side log carries only the fixed reason code; the response
    // body never exposes diagnostic details.
    console.error(identity.reason);
    return error("A valid Cloudflare Access identity is required.", 401);
  }
  const email = identity.email;

  if (url.pathname === "/auth/access") {
    // Revoke a previous account's session before replacing its cookie.
    const previous = sessionCookieFromRequest(request);
    if (previous) await revokeSession(previous);
    const session = await issueSession(email);
    if (!session) return error("Session signing is not configured.", 503);
    return redirect("/", `${session.cookieName}=${session.cookieValue}; Path=/; Secure; HttpOnly; SameSite=Lax; Expires=${session.expiresAt.toUTCString()}`);
  }

  const owner = await ownerFromRequest(request);
  if (owner !== email) {
    const previous = sessionCookieFromRequest(request);
    if (previous) await revokeSession(previous);
    // A top-level visit bootstraps the cookie; API calls never mutate as the
    // previous owner or receive login HTML in place of an API response.
    if (url.pathname === "/" && request.method === "GET") return redirect("/auth/access");
    return error("Sign in to access your immigration workspace.", 401);
  }
  return null;
}
