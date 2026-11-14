import assert from "node:assert/strict";
import { generateKeyPairSync, randomUUID, sign } from "node:crypto";

export function accessFixture(t) {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const kid = randomUUID();
  const env = { ACCESS_TEAM_DOMAIN: `${randomUUID()}.cloudflareaccess.com`, ACCESS_AUD: randomUUID() };
  const issuer = `https://${env.ACCESS_TEAM_DOMAIN}`;
  const jwks = { keys: [{ ...publicKey.export({ format: "jwk" }), kid, alg: "RS256", use: "sig" }] };
  const originalFetch = globalThis.fetch;
  let available = true;
  t.mock.method(globalThis, "fetch", async (input, options) => {
    if (String(input).startsWith(issuer)) {
      assert.equal(String(input), `${issuer}/cdn-cgi/access/certs`);
      assert.equal(options.redirect, "manual");
      return available ? Response.json(jwks) : new Response("Unavailable", { status: 503 });
    }
    return originalFetch(input, options);
  });
  const jwt = (claims = {}, header = {}, signingKey = privateKey) => {
    const now = Math.floor(Date.now() / 1000);
    const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
    const unsigned = `${encode({ alg: "RS256", kid, typ: "JWT", ...header })}.${encode({ iss: issuer, aud: [env.ACCESS_AUD], exp: now + 3600, nbf: now - 10, email: "owner@example.test", ...claims })}`;
    return `${unsigned}.${sign("RSA-SHA256", Buffer.from(unsigned), signingKey).toString("base64url")}`;
  };
  return { env, jwt, setAvailable(value) { available = value; } };
}
