export type AccessEnv = {
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
};

type AccessConfig = { issuer: string; audience: string };
type SigningKey = JsonWebKey & { kid?: string };
type KeySet = { issuer: string; expiresAt: number; keys: SigningKey[] };

// Cache public keys only, never identities or JWTs. A short TTL handles rotation.
let keySet: KeySet | undefined;
let pendingKeys: { issuer: string; promise: Promise<KeySet> } | undefined;

export function accessConfig(env: AccessEnv): AccessConfig | null {
  const domain = env.ACCESS_TEAM_DOMAIN?.trim();
  const audience = env.ACCESS_AUD?.trim();
  // A hostname only: no scheme, path, port, credentials, or token-controlled URL.
  if (!domain || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.cloudflareaccess\.com$/i.test(domain) || !audience) return null;
  return { issuer: `https://${domain.toLowerCase()}`, audience };
}

export type AccessIdentityReason =
  | "no_token" | "bad_structure" | "bad_header" | "jwks_unavailable"
  | "key_mismatch" | "bad_signature" | "bad_claims" | "no_email" | "ok";

type AccessIdentityResult =
  | { reason: "ok"; email: string }
  | { reason: Exclude<AccessIdentityReason, "ok">; email: null };

export async function verifyAccessIdentity(request: Request, config: AccessConfig): Promise<string | null> {
  return (await verifyAccessIdentityDetailed(request, config)).email;
}

export async function verifyAccessIdentityDetailed(request: Request, config: AccessConfig): Promise<AccessIdentityResult> {
  // A present assertion always wins, including an empty or invalid assertion.
  const token = request.headers.get("Cf-Access-Jwt-Assertion") ?? accessCookie(request);
  const reject = (reason: Exclude<AccessIdentityReason, "ok">): AccessIdentityResult => ({ reason, email: null });
  if (!token) return reject("no_token");
  if (token.length > 32_768) return reject("bad_structure");
  const parts = token.split(".");
  if (parts.length !== 3 || parts.some((part) => !part)) return reject("bad_structure");
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  let header: Record<string, unknown>;
  try {
    header = decodeObject(encodedHeader);
  } catch {
    return reject("bad_header");
  }
  if (header.alg !== "RS256" || typeof header.kid !== "string" || !header.kid || header.crit !== undefined) return reject("bad_header");
  let payload: Record<string, unknown>;
  let signature: Uint8Array<ArrayBuffer>;
  try {
    payload = decodeObject(encodedPayload);
    signature = decodeBase64Url(encodedSignature);
  } catch {
    return reject("bad_structure");
  }
  let keys: SigningKey[];
  try {
    keys = await signingKeys(config.issuer);
  } catch {
    return reject("jwks_unavailable");
  }
  const matches = keys.filter((key) => key.kid === header.kid && key.kty === "RSA"
    && (key.alg === undefined || key.alg === "RS256") && (key.use === undefined || key.use === "sig"));
  if (matches.length !== 1) return reject("key_mismatch");
  let key: CryptoKey;
  try {
    key = await crypto.subtle.importKey("jwk", matches[0], { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  } catch {
    // A matching key with unusable public key material also fails closed.
    return reject("key_mismatch");
  }
  try {
    const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, signature, new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`));
    if (!valid) return reject("bad_signature");
  } catch {
    return reject("bad_signature");
  }

  const now = Date.now() / 1000;
  const audiences = typeof payload.aud === "string" ? [payload.aud] : payload.aud;
  if (payload.iss !== config.issuer || !Array.isArray(audiences)
    || !audiences.every((aud) => typeof aud === "string") || !audiences.includes(config.audience)
    || typeof payload.exp !== "number" || !Number.isFinite(payload.exp) || payload.exp <= now
    || (payload.nbf !== undefined && (typeof payload.nbf !== "number" || !Number.isFinite(payload.nbf) || payload.nbf > now))) return reject("bad_claims");
  if (typeof payload.email !== "string") return reject("no_email");
  const email = payload.email.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reject("no_email");
  return { reason: "ok", email };
}

function accessCookie(request: Request): string | null {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0 || part.slice(0, separator).trim() !== "CF_Authorization") continue;
    const value = part.slice(separator + 1).trim();
    // Cookie values may be quoted; JWT base64url needs no URI decoding.
    return value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value;
  }
  return null;
}

async function signingKeys(issuer: string): Promise<SigningKey[]> {
  if (keySet?.issuer === issuer && keySet.expiresAt > Date.now()) return keySet.keys;
  if (pendingKeys?.issuer === issuer) return (await pendingKeys.promise).keys;
  const pending = {
    issuer,
    promise: (async (): Promise<KeySet> => {
      const response = await fetch(`${issuer}/cdn-cgi/access/certs`, { redirect: "manual", signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error("Access signing keys unavailable");
      const body = await response.json() as { keys?: SigningKey[] };
      if (!Array.isArray(body.keys) || !body.keys.every((key) => key && typeof key === "object")) throw new Error("Invalid Access key set");
      const result = { issuer, keys: body.keys, expiresAt: Date.now() + 60_000 };
      keySet = result;
      return result;
    })(),
  };
  pendingKeys = pending;
  try {
    return (await pending.promise).keys;
  } finally {
    if (pendingKeys === pending) pendingKeys = undefined;
  }
}

function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("Invalid JWT encoding");
  return Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), (char) => char.charCodeAt(0));
}

function decodeObject(value: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(decodeBase64Url(value)));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid JWT object");
  return parsed as Record<string, unknown>;
}
