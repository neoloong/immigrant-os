"use client";
import { useEffect, useState, type FormEvent } from "react";

type Token = { id: string; label: string; scopes: "read" | "write"; createdAt: string; expiresAt: string; lastUsedAt: string | null; revokedAt: string | null };
async function tokensApi(init?: RequestInit, query = "") {
  const response = await fetch(`/api/agent-tokens${query}`, { ...init, cache: "no-store", headers: { "content-type": "application/json" } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Unable to manage tokens.");
  return data;
}
const dateTime = (date: string) => new Date(date).toLocaleString();

export default function AgentSettings() {
  const [now] = useState(() => Date.now());
  const [tokens, setTokens] = useState<Token[]>([]);
  const [label, setLabel] = useState("");
  const [scopes, setScopes] = useState("read");
  const [secret, setSecret] = useState<{ value: string; id: string } | null>(null);
  const [message, setMessage] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    tokensApi().then((data) => { if (active) { setTokens(data.tokens); setReady(true); } })
      .catch((error) => { if (active) setMessage(error.message); });
    return () => { active = false; };
  }, []);
  async function create(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const data = await tokensApi({ method: "POST", body: JSON.stringify({ label, scopes }) });
      setSecret({ value: data.token, id: data.agentToken.id });
      setTokens((current) => [data.agentToken, ...current]); setLabel("");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to create token."); }
    finally { setBusy(false); }
  }
  async function revoke(id: string) {
    setBusy(true); setMessage("");
    try {
      await tokensApi({ method: "DELETE" }, `?id=${encodeURIComponent(id)}`);
      setTokens((current) => current.map((token) => token.id === id ? { ...token, revokedAt: new Date().toISOString() } : token));
      if (secret?.id === id) setSecret(null);
      setMessage("Token revoked. Your agent can no longer use it.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to revoke token."); }
    finally { setBusy(false); }
  }
  return <div className="page agent-settings">
    <div className="page-intro"><div><p className="eyebrow">SETTINGS</p><h1>Connect your agent</h1><p>Give your own AI agent access to your saved records and action plan.</p></div></div>
    <p><a href="/agents">Use with your AI agent: connection guide and starter prompt →</a></p>
    <p>Start with Read only. Read + write also allows date/status corrections and adding receipts. Tokens expire after 90 days. Revoke access here whenever you need to.</p>
    {message && <p role="status" className="agent-notice">{message}</p>}
    {secret && <section className="agent-secret" aria-label="New token">
      <h2>Copy your token now</h2><p>This is the only time it is shown. Keep it in your agent’s private credential settings; never paste it into chat.</p>
      <code>{secret.value}</code><div className="agent-buttons">
        <button className="primary" onClick={async () => { try { await navigator.clipboard.writeText(secret.value); setMessage("Token copied."); } catch { setMessage("Copy was unavailable. Select the token and copy it manually."); } }}>Copy token</button>
        <button className="secondary" onClick={() => setSecret(null)}>I saved it — dismiss</button>
      </div></section>}
    <form onSubmit={(event) => void create(event)} className="agent-form">
      <label>Token label<input required maxLength={80} value={label} placeholder="My personal agent" onChange={(event) => setLabel(event.target.value)} /></label>
      <label>Permission<select value={scopes} onChange={(event) => setScopes(event.target.value)}><option value="read">Read only</option><option value="write">Read + write</option></select></label>
      <button className="primary" disabled={!ready || busy || !!secret || !label.trim()}>Create token</button>
    </form>
    <h2>Your tokens</h2>
    {ready && !tokens.length && <p>No agent tokens yet.</p>}
    <div className="agent-token-list">{tokens.map((token) => <article key={token.id}>
      <div><h3>{token.label}</h3><p>{token.scopes === "write" ? "Read + write" : "Read only"} · {token.revokedAt ? "Revoked" : new Date(token.expiresAt).getTime() <= now ? "Expired" : "Active"}</p>
      <p>Last used: {token.lastUsedAt ? dateTime(token.lastUsedAt) : "Never"}<br />Created: {dateTime(token.createdAt)}<br />Expires: {dateTime(token.expiresAt)}</p></div>
      {!token.revokedAt && <button className="secondary" disabled={busy} onClick={() => void revoke(token.id)}>Revoke<span className="visually-hidden"> {token.label}</span></button>}
    </article>)}</div>
  </div>;
}
