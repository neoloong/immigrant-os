"use client";
import { useEffect, useState, type FormEvent } from "react";
import type { ImmigrationProfile } from "../lib/profile";

type Token = { id: string; label: string; scopes: "read" | "write"; createdAt: string; expiresAt: string; lastUsedAt: string | null; revokedAt: string | null };
async function tokensApi(init?: RequestInit, query = "") {
  const response = await fetch(`/api/agent-tokens${query}`, { ...init, cache: "no-store", headers: { "content-type": "application/json" } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Unable to manage tokens.");
  return data;
}
const dateTime = (date: string) => new Date(date).toLocaleString();

export default function AgentSettings({
  profiles = [],
  activeProfileId,
  onSelectProfile,
  onAddProfile,
  onRenameProfile,
  onDeleteProfile,
}: {
  profiles?: ImmigrationProfile[];
  activeProfileId?: string;
  onSelectProfile?: (id: string) => void;
  onAddProfile?: () => void;
  onRenameProfile?: (id: string, displayName: string) => Promise<void>;
  onDeleteProfile?: (profile: ImmigrationProfile) => Promise<void>;
}) {
  const [now] = useState(() => Date.now());
  const [tokens, setTokens] = useState<Token[]>([]);
  const [label, setLabel] = useState("");
  const [scopes, setScopes] = useState("read");
  const [secret, setSecret] = useState<{ value: string; id: string } | null>(null);
  const [message, setMessage] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [profileBusy, setProfileBusy] = useState(false);

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
  async function submitRename(event: FormEvent, id: string) {
    event.preventDefault();
    if (!onRenameProfile || !renameDraft.trim()) return;
    setProfileBusy(true);
    try {
      await onRenameProfile(id, renameDraft.trim());
      setRenamingId(null);
      setRenameDraft("");
    } finally {
      setProfileBusy(false);
    }
  }
  return <div className="page agent-settings">
    <div className="page-intro"><div><p className="eyebrow">SETTINGS</p><h1>Profiles & agent access</h1><p>Manage family profiles in this account and configure personal AI agent access.</p></div>{onAddProfile && <div className="intro-actions"><button type="button" className="secondary" onClick={onAddProfile}>+ Add profile</button></div>}</div>

    {profiles.length > 0 && <section className="section-block profile-management">
      <div className="section-heading"><div><p className="eyebrow">FAMILY PROFILES</p><h2>Saved profiles</h2></div><span>{profiles.length} profile{profiles.length === 1 ? "" : "s"}</span></div>
      <div className="agent-token-list">
        {profiles.map((item) => {
          const itemId = item.id ?? "";
          const isRenaming = renamingId === itemId;
          const canDelete = !item.isPrimary && profiles.length > 1;
          return <article key={itemId || item.displayName}>
            <div>
              <h3>{item.displayName || "Primary profile"} {item.isPrimary ? <span className="tag info">Primary</span> : null} {activeProfileId === itemId ? <span className="tag planning">Active</span> : null}</h3>
              <p>Stage: {item.lifecycleStage}{item.statusSubtype ? ` · ${item.statusSubtype}` : ""}</p>
              {isRenaming && <form className="inline-rename-form" onSubmit={(e) => void submitRename(e, itemId)}>
                <input value={renameDraft} maxLength={100} onChange={(e) => setRenameDraft(e.target.value)} placeholder="Profile nickname" required aria-label="New profile nickname" />
                <button type="submit" className="primary" disabled={profileBusy || !renameDraft.trim()}>Save</button>
                <button type="button" className="secondary" onClick={() => { setRenamingId(null); setRenameDraft(""); }}>Cancel</button>
              </form>}
            </div>
            <div className="agent-buttons">
              {onSelectProfile && activeProfileId !== itemId && itemId && <button type="button" className="secondary" onClick={() => onSelectProfile(itemId)}>Switch to profile</button>}
              {onRenameProfile && itemId && !isRenaming && <button type="button" className="secondary" onClick={() => { setRenamingId(itemId); setRenameDraft(item.displayName || ""); }}>Rename</button>}
              {onDeleteProfile && canDelete && itemId && <button type="button" className="secondary danger-text" disabled={profileBusy} onClick={() => void onDeleteProfile(item)}>Delete</button>}
            </div>
          </article>;
        })}
      </div>
    </section>}

    <h2>Connect your agent</h2>
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
