const AUTH_EMAIL_HEADER = "oai-authenticated-user-email";

export function ownerFromRequest(request: Request): string | null {
  const email = request.headers.get(AUTH_EMAIL_HEADER)?.trim().toLowerCase();
  if (email) return email;

  const hostname = new URL(request.url).hostname;
  if (hostname === "terminal.local" || hostname === "localhost" || hostname === "127.0.0.1") {
    return "preview@immigrantos.local";
  }

  return null;
}

export function unauthorized() {
  return Response.json({ error: "Sign in to access your immigration workspace." }, { status: 401 });
}
