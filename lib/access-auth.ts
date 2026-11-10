import { getAuthConfig, issueSession, ownerFromRequest, revokeSession, sessionCookieFromRequest } from "./auth";
import { accessConfig, verifyAccessIdentityDetailed, type AccessEnv } from "./access-jwt";

const PRIVATE_HEADERS = { "cache-control": "private, no-store" };

function redirect(location: string, cookie?: string): Response {
  const headers = new Headers({ ...PRIVATE_HEADERS, location });
  if (cookie) headers.set("set-cookie", cookie);
  return new Response(null, { status: 303, headers });
}

function error(message: string, status: number): Response {
  return Response.json({ error: message }, { status, headers: PRIVATE_HEADERS });
}

// Called before routing, including API and image requests. Returning null allows
// a request through only after Access and the app session identify the same owner.
export async function handleAccessAuth(request: Request, env: AccessEnv): Promise<Response | null> {
  const url = new URL(request.url);
  const auth = getAuthConfig();
  if (url.pathname === "/auth/login") {
    return redirect(auth.authMode === "session" ? "/auth/access" : "/signin-with-chatgpt?return_to=%2F");
  }
  if (url.pathname === "/auth/logout") {
    if (request.method !== "POST") return new Response(null, { status: 405, headers: { ...PRIVATE_HEADERS, allow: "POST" } });
    const origin = request.headers.get("origin");
    if ((origin && origin !== url.origin) || request.headers.get("sec-fetch-site") === "cross-site") return error("Invalid logout origin.", 403);
    if (auth.authMode !== "session") return redirect("/signout-with-chatgpt?return_to=%2F");
    const cookie = sessionCookieFromRequest(request);
    if (cookie) await revokeSession(cookie);
    return redirect("/cdn-cgi/access/logout", `${auth.sessionCookieName}=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`);
  }
  if (auth.authMode !== "session") {
    return url.pathname === "/auth/access" ? error("Access sign-in is disabled.", 503) : null;
  }
  const config = accessConfig(env);
  if (!config || !auth.sessionSecret) return error("Access sign-in is not configured.", 503);
  if (url.pathname === "/auth/access" && request.method !== "GET") {
    return new Response(null, { status: 405, headers: { ...PRIVATE_HEADERS, allow: "GET" } });
  }
  const identity = await verifyAccessIdentityDetailed(request, config);
  if (identity.reason !== "ok") {
    // TEMP-DEBUG: remove before public launch. Log only the fixed reason code.
    console.error(identity.reason);
    const message = "A valid Cloudflare Access identity is required.";
    if (url.pathname === "/auth/access") {
      // TEMP-DEBUG: remove before public launch.
      return Response.json({ error: message, detail: identity.reason }, { status: 401, headers: PRIVATE_HEADERS });
    }
    return error(message, 401);
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
