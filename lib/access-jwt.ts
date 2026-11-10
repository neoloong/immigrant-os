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

export async function verifyAccessIdentity(request: Request, config: AccessConfig): Promise<string | null> {
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token || token.length > 32_768) return null;
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [encodedHeader, encodedPayload, encodedSignature] = parts;
    const header = decodeObject(encodedHeader);
    if (header.alg !== "RS256" || typeof header.kid !== "string" || !header.kid || header.crit !== undefined) return null;
    const payload = decodeObject(encodedPayload);
    const keys = await signingKeys(config.issuer);
    const matches = keys.filter((key) => key.kid === header.kid && key.kty === "RSA"
      && (key.alg === undefined || key.alg === "RS256") && (key.use === undefined || key.use === "sig"));
    if (matches.length !== 1) return null;
    const key = await crypto.subtle.importKey("jwk", matches[0], { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, decodeBase64Url(encodedSignature), new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`));
    if (!valid) return null;

    const now = Date.now() / 1000;
    const audiences = typeof payload.aud === "string" ? [payload.aud] : payload.aud;
    if (payload.iss !== config.issuer || !Array.isArray(audiences)
      || !audiences.every((aud) => typeof aud === "string") || !audiences.includes(config.audience)
      || typeof payload.exp !== "number" || !Number.isFinite(payload.exp) || payload.exp <= now
      || (payload.nbf !== undefined && (typeof payload.nbf !== "number" || !Number.isFinite(payload.nbf) || payload.nbf > now))) return null;
    if (typeof payload.email !== "string") return null;
    const email = payload.email.trim().toLowerCase();
    return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
  } catch {
    // Malformed tokens, unavailable JWKS, and invalid key material fail closed.
    return null;
  }
}

async function signingKeys(issuer: string): Promise<SigningKey[]> {
  if (keySet?.issuer === issuer && keySet.expiresAt > Date.now()) return keySet.keys;
  if (pendingKeys?.issuer === issuer) return (await pendingKeys.promise).keys;
  const pending = {
    issuer,
    promise: (async (): Promise<KeySet> => {
      const response = await fetch(`${issuer}/cdn-cgi/access/certs`, { redirect: "error", signal: AbortSignal.timeout(5000) });
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
