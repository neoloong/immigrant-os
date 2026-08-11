"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { ImmigrationProfile, LifecycleStage } from "../lib/profile";
import type { PlanItem, PlanResult, Source } from "../lib/rules";

type View = "plan" | "documents" | "cases" | "assistant";
type SavedDocument = { id: string; kind: string; filename: string; mimeType: string; sizeBytes: number; uploadedAt: string };
type TrackedCase = { id: string; receiptNumber: string; formType: string; nickname: string; statusText: string; lastCheckedAt: string | null; createdAt: string };
type ChatMessage = { role: "user" | "assistant"; text: string; sources?: Source[]; limitations?: string };

const EMPTY_PROFILE: ImmigrationProfile = {
  displayName: "",
  lifecycleStage: "F1",
  statusSubtype: "STUDENT",
  admissionBasis: "DS_TRANSITION",
  programEndDate: null,
  eadEndDate: null,
  i94ExpirationDate: null,
  passportExpirationDate: null,
  visaExpirationDate: null,
  priorityDate: null,
  greenCardSince: null,
  greenCardExpirationDate: null,
  naturalizationBasis: "five_year",
};

const STAGES: { id: LifecycleStage; label: string; short: string; coverage: string }[] = [
  { id: "F1", label: "F-1 / OPT", short: "Study & work", coverage: "Verified" },
  { id: "H1B", label: "H-1B / H-4", short: "Temporary worker", coverage: "Beta" },
  { id: "GREEN_CARD", label: "Green card", short: "Permanent residence process", coverage: "Beta" },
  { id: "LPR", label: "Permanent resident", short: "Maintain & renew", coverage: "Verified" },
  { id: "CITIZENSHIP", label: "Citizenship", short: "Naturalization", coverage: "Verified" },
];

const NAV: { id: View; label: string; icon: string }[] = [
  { id: "plan", label: "Action plan", icon: "plan" },
  { id: "documents", label: "Documents", icon: "file" },
  { id: "cases", label: "Cases", icon: "case" },
  { id: "assistant", label: "Assistant", icon: "spark" },
];

export default function Home() {
  const [view, setView] = useState<View>("plan");
  const [profile, setProfile] = useState<ImmigrationProfile | null>(null);
  const [plan, setPlan] = useState<PlanResult | null>(null);
  const [documents, setDocuments] = useState<SavedDocument[]>([]);
  const [cases, setCases] = useState<TrackedCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [profileOpen, setProfileOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [fatalError, setFatalError] = useState("");

  const refresh = async () => {
    setFatalError("");
    try {
      const [profileData, planData, documentData, caseData] = await Promise.all([
        api<{ profile: ImmigrationProfile | null }>("/api/profile"),
        api<{ plan: PlanResult | null }>("/api/plan"),
        api<{ documents: SavedDocument[] }>("/api/documents"),
        api<{ cases: TrackedCase[] }>("/api/cases"),
      ]);
      setProfile(profileData.profile);
      setPlan(planData.plan);
      setDocuments(documentData.documents);
      setCases(caseData.cases);
    } catch (error) {
      setFatalError(error instanceof Error ? error.message : "Unable to load your workspace.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, []);

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 3400);
  };

  if (loading) return <LoadingScreen />;
  if (fatalError) return <ErrorScreen message={fatalError} onRetry={() => { setLoading(true); void refresh(); }} />;
  if (!profile) return <Onboarding onSaved={() => { setLoading(true); void refresh(); }} />;

  const stage = STAGES.find((item) => item.id === profile.lifecycleStage) ?? STAGES[0];

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <Brand />
        <div className="journey-chip"><span className="journey-dot" /><div><small>YOUR JOURNEY</small><strong>{stage.label}</strong><em>{plan?.coverage ?? stage.coverage}</em></div></div>
        <nav className="side-nav" aria-label="Main navigation">
          {NAV.map((item) => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)}><Icon name={item.icon} /><span>{item.label}</span></button>)}
        </nav>
        <div className="privacy-note"><Icon name="shield" /><div><strong>Account-private workspace</strong><span>Files and records are scoped to your signed-in account.</span></div></div>
        <button className="profile-button" onClick={() => setProfileOpen(true)}><span className="avatar">{initials(profile.displayName)}</span><span><strong>{profile.displayName || "Your profile"}</strong><small>Edit immigration profile</small></span><Icon name="chevron" /></button>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <Brand mobile />
          <div className="topbar-copy"><span className="coverage-dot" /><span>{plan?.coverage ?? stage.coverage} module</span><b>Rules checked Aug 11, 2026</b></div>
          <button className="avatar top-avatar" onClick={() => setProfileOpen(true)} aria-label="Edit profile">{initials(profile.displayName)}</button>
        </header>

        {view === "plan" && <PlanView profile={profile} plan={plan} documents={documents} cases={cases} onEdit={() => setProfileOpen(true)} onNavigate={setView} onRefresh={async () => { await refresh(); }} notify={notify} />}
        {view === "documents" && <DocumentsView documents={documents} onChanged={async () => { await refresh(); }} notify={notify} />}
        {view === "cases" && <CasesView cases={cases} onChanged={async () => { await refresh(); }} notify={notify} />}
        {view === "assistant" && <AssistantView plan={plan} />}
      </section>

      <nav className="bottom-nav" aria-label="Mobile navigation">{NAV.map((item) => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)}><Icon name={item.icon} /><span>{item.label}</span></button>)}</nav>

      {profileOpen && <ProfileDialog profile={profile} onClose={() => setProfileOpen(false)} onSaved={async () => { setProfileOpen(false); await refresh(); notify("Profile saved and action plan recalculated."); }} />}
      {toast && <div className="toast"><span><Icon name="check" /></span>{toast}</div>}
    </main>
  );
}

function PlanView({ profile, plan, documents, cases, onEdit, onNavigate, onRefresh, notify }: { profile: ImmigrationProfile; plan: PlanResult | null; documents: SavedDocument[]; cases: TrackedCase[]; onEdit: () => void; onNavigate: (view: View) => void; onRefresh: () => Promise<void>; notify: (message: string) => void }) {
  const [busy, setBusy] = useState("");
  const openItems = plan?.items.filter((item) => !item.completed) ?? [];
  const next = openItems[0];

  const toggle = async (item: PlanItem) => {
    setBusy(item.id);
    try {
      await api("/api/actions", { method: "POST", body: JSON.stringify({ actionKey: item.id, completed: !item.completed }) });
      await onRefresh();
      notify(item.completed ? "Action reopened." : "Action marked complete.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Unable to update action.");
    } finally {
      setBusy("");
    }
  };

  return <div className="page plan-page">
    <section className="page-intro"><div><p className="eyebrow">{new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" }).format(new Date()).toUpperCase()}</p><h1>{greeting()}, {firstName(profile.displayName)}.</h1><p>{plan?.summary}</p></div><div className="intro-actions"><button className="secondary" onClick={onEdit}><Icon name="edit" /> Update profile</button><button className="icon-action" onClick={() => window.print()} aria-label="Print action plan"><Icon name="print" /></button></div></section>

    {plan?.missingFields.length ? <section className="missing-card"><div className="missing-icon"><Icon name="alert" /></div><div><span className="overline">NEEDED TO VERIFY YOUR TIMELINE</span><h2>{plan.missingFields.length} profile item{plan.missingFields.length === 1 ? "" : "s"} missing</h2><ul>{plan.missingFields.map((field) => <li key={field}>{field}</li>)}</ul><button onClick={onEdit}>Add missing details <Icon name="arrow" /></button></div></section> : null}

    {next ? <section className={`next-action ${next.severity}`}><div className="next-date"><span>{next.dueDate ? month(next.dueDate) : "NEXT"}</span><strong>{next.dueDate ? day(next.dueDate) : "→"}</strong><small>{next.dueDate ? year(next.dueDate) : "ACTION"}</small></div><div className="next-copy"><div className="tag-row"><span className={`tag ${next.severity}`}>{next.severity}</span><span className={`confidence ${next.confidence}`}>{labelConfidence(next.confidence)}</span></div><h2>{next.title}</h2><p>{next.description}</p><div className="basis"><span>Calculated from</span>{next.basis.map((value) => <b key={value}>{value}</b>)}</div><a href={next.source.url} target="_blank" rel="noreferrer">{next.source.label} <Icon name="external" /></a></div><button className="complete-button" disabled={busy === next.id} onClick={() => toggle(next)}><Icon name="check" /> Mark complete</button></section> : <section className="all-done"><Icon name="check" /><h2>You’re caught up.</h2><p>There are no open actions in the supported rules for this profile.</p></section>}

    <section className="section-block"><div className="section-heading"><div><p className="eyebrow">PERSONALIZED ROADMAP</p><h2>All actions</h2></div><span>{plan?.items.length ?? 0} calculated</span></div><div className="action-list">{plan?.items.map((item) => <article className={`action-row ${item.completed ? "done" : ""}`} key={item.id}><button className="check-button" disabled={busy === item.id} onClick={() => toggle(item)} aria-label={item.completed ? "Reopen action" : "Complete action"}>{item.completed && <Icon name="check" />}</button><div className="action-date">{item.dueDate ? <><b>{month(item.dueDate)} {day(item.dueDate)}</b><span>{year(item.dueDate)}</span></> : <><b>Ongoing</b><span>No fixed date</span></>}</div><div className="action-copy"><div><span className={`tag ${item.severity}`}>{item.severity}</span><span className={`confidence ${item.confidence}`}>{labelConfidence(item.confidence)}</span></div><h3>{item.title}</h3><p>{item.description}</p><details><summary>Why this date?</summary><ul>{item.basis.map((basis) => <li key={basis}>{basis}</li>)}</ul><a href={item.source.url} target="_blank" rel="noreferrer">{item.source.label} · {item.source.ruleVersion} <Icon name="external" /></a></details></div></article>)}</div></section>

    <section className="quick-grid"><button className="quick-card" onClick={() => onNavigate("documents")}><span className="quick-icon blue"><Icon name="file" /></span><div><small>DOCUMENT VAULT</small><strong>{documents.length ? `${documents.length} saved document${documents.length === 1 ? "" : "s"}` : "Add your first document"}</strong><p>PDF, JPEG, or PNG · 10 MB max</p></div><Icon name="arrow" /></button><button className="quick-card" onClick={() => onNavigate("cases")}><span className="quick-icon green"><Icon name="case" /></span><div><small>USCIS CASES</small><strong>{cases.length ? `${cases.length} receipt${cases.length === 1 ? "" : "s"} tracked` : "Add a receipt number"}</strong><p>Stored separately for each filing</p></div><Icon name="arrow" /></button><button className="quick-card" onClick={() => onNavigate("assistant")}><span className="quick-icon gold"><Icon name="spark" /></span><div><small>GROUNDED ASSISTANT</small><strong>Ask about your plan</strong><p>Answers from saved facts and cited rules</p></div><Icon name="arrow" /></button></section>

    <p className="legal-note">ImmigrantOS provides general administrative information, not legal advice. It does not determine eligibility or replace a DSO, employer counsel, accredited representative, or immigration attorney.</p>
  </div>;
}

function DocumentsView({ documents, onChanged, notify }: { documents: SavedDocument[]; onChanged: () => Promise<void>; notify: (message: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState("Passport");
  const [uploading, setUploading] = useState(false);

  const upload = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("kind", kind);
      await api("/api/documents", { method: "POST", body: form });
      if (fileRef.current) fileRef.current.value = "";
      await onChanged();
      notify(`${file.name} saved.`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const remove = async (document: SavedDocument) => {
    if (!window.confirm(`Delete ${document.filename}? This cannot be undone.`)) return;
    try {
      await api(`/api/documents?id=${encodeURIComponent(document.id)}`, { method: "DELETE" });
      await onChanged();
      notify("Document deleted.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Delete failed.");
    }
  };

  return <div className="page"><section className="page-intro"><div><p className="eyebrow">PRIVATE DOCUMENT VAULT</p><h1>Your documents</h1><p>Actual files are stored with your signed-in workspace—not simulated.</p></div></section><section className="upload-panel"><div className="upload-mark"><Icon name="upload" /></div><div><h2>Add a document</h2><p>Save a PDF, JPEG, or PNG. OCR and field extraction are not enabled in this build, so use Profile to enter confirmed dates.</p></div><label><span>Document type</span><select value={kind} onChange={(event) => setKind(event.target.value)}><option>Passport</option><option>Visa</option><option>Form I-20</option><option>I-94</option><option>EAD</option><option>USCIS notice</option><option>Green Card</option><option>Other</option></select></label><input ref={fileRef} className="visually-hidden" type="file" accept="application/pdf,image/jpeg,image/png" onChange={(event) => void upload(event.target.files?.[0])} /><button className="primary" disabled={uploading} onClick={() => fileRef.current?.click()}><Icon name="upload" /> {uploading ? "Uploading…" : "Choose file"}</button></section>

    <div className="section-heading document-heading"><div><p className="eyebrow">SAVED FILES</p><h2>{documents.length} document{documents.length === 1 ? "" : "s"}</h2></div><span>Maximum 10 MB each</span></div>
    {documents.length ? <div className="document-list">{documents.map((document) => <article className="document-row" key={document.id}><span className="document-icon"><Icon name="file" /></span><div><span className="tag info">{document.kind}</span><h3>{document.filename}</h3><p>{formatBytes(document.sizeBytes)} · Uploaded {formatDateTime(document.uploadedAt)}</p></div><a className="icon-action" href={`/api/documents?download=${encodeURIComponent(document.id)}`} aria-label={`Download ${document.filename}`}><Icon name="download" /></a><button className="icon-action danger" onClick={() => void remove(document)} aria-label={`Delete ${document.filename}`}><Icon name="trash" /></button></article>)}</div> : <EmptyState icon="file" title="No saved documents" copy="Upload one document to test the real vault flow." />}
    <section className="security-strip"><Icon name="shield" /><div><strong>Use the minimum data needed.</strong><p>Do not upload Social Security cards, payment cards, or unrelated financial records. You can download or permanently delete each file.</p></div></section>
  </div>;
}

function CasesView({ cases, onChanged, notify }: { cases: TrackedCase[]; onChanged: () => Promise<void>; notify: (message: string) => void }) {
  const [receiptNumber, setReceiptNumber] = useState("");
  const [formType, setFormType] = useState("");
  const [nickname, setNickname] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await api("/api/cases", { method: "POST", body: JSON.stringify({ receiptNumber, formType, nickname }) });
      setReceiptNumber(""); setFormType(""); setNickname("");
      await onChanged();
      notify("USCIS receipt saved.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Unable to save case.");
    } finally { setSaving(false); }
  };

  const remove = async (id: string) => {
    try { await api(`/api/cases?id=${encodeURIComponent(id)}`, { method: "DELETE" }); await onChanged(); notify("Case removed."); }
    catch (error) { notify(error instanceof Error ? error.message : "Unable to remove case."); }
  };

  return <div className="page"><section className="page-intro"><div><p className="eyebrow">CASE WORKSPACE</p><h1>USCIS receipts</h1><p>Keep each filing separate and open the official status tool with the correct receipt number.</p></div></section><form className="case-form" onSubmit={submit}><div><label>Receipt number</label><input value={receiptNumber} onChange={(event) => setReceiptNumber(event.target.value.toUpperCase())} placeholder="IOE1234567890" maxLength={15} required /><small>3 letters + 10 digits</small></div><div><label>Form</label><input value={formType} onChange={(event) => setFormType(event.target.value)} placeholder="I-765" /></div><div><label>Label</label><input value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="My OPT EAD" /></div><button className="primary" disabled={saving}><Icon name="plus" /> {saving ? "Saving…" : "Add case"}</button></form>

    <div className="case-list">{cases.map((item) => <article className="case-card" key={item.id}><div className="case-form-badge">{item.formType || "CASE"}</div><div><span>{item.nickname || "USCIS filing"}</span><h2>{item.receiptNumber}</h2><p>Saved {formatDateTime(item.createdAt)} · Live API connection pending USCIS production credentials</p></div><a className="secondary" href={`https://egov.uscis.gov/casestatus/mycasestatus.do?appReceiptNum=${encodeURIComponent(item.receiptNumber)}`} target="_blank" rel="noreferrer">Open official status <Icon name="external" /></a><button className="icon-action danger" onClick={() => void remove(item.id)} aria-label="Remove case"><Icon name="trash" /></button></article>)}</div>
    {!cases.length && <EmptyState icon="case" title="No receipts yet" copy="Add an actual USCIS receipt number above. It will persist across sessions." />}
    <section className="info-strip"><Icon name="info" /><div><strong>What works now</strong><p>Receipt validation, saved case records, and official-status deep links are live. Automatic status retrieval requires ImmigrantOS to obtain USCIS Torch production credentials; the UI does not fake a status.</p></div></section>
  </div>;
}

function AssistantView({ plan }: { plan: PlanResult | null }) {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [asking, setAsking] = useState(false);
  const suggestions = ["What should I do next?", "When does my status expire?", "What information is missing?", "What is my earliest filing date?"];

  const ask = async (value?: string) => {
    const text = (value ?? question).trim();
    if (!text || asking) return;
    setMessages((current) => [...current, { role: "user", text }]);
    setQuestion(""); setAsking(true);
    try {
      const response = await api<{ answer: string; sources: Source[]; limitations: string }>("/api/assistant", { method: "POST", body: JSON.stringify({ question: text }) });
      setMessages((current) => [...current, { role: "assistant", text: response.answer, sources: response.sources, limitations: response.limitations }]);
    } catch (error) {
      setMessages((current) => [...current, { role: "assistant", text: error instanceof Error ? error.message : "Unable to answer." }]);
    } finally { setAsking(false); }
  };

  return <div className="page assistant-page"><section className="assistant-intro"><span className="assistant-mark"><Icon name="spark" /></span><p className="eyebrow">PROFILE-GROUNDED ASSISTANT</p><h1>Ask about your action plan.</h1><p>This build answers from your saved profile and deterministic rules. It does not improvise legal strategy.</p><div className="assistant-status"><span className="coverage-dot" /><b>{plan?.stageLabel}</b><em>{plan?.coverage} module</em></div></section><section className="chat-card"><div className="chat-log" aria-live="polite">{!messages.length ? <div className="suggestion-grid">{suggestions.map((suggestion) => <button onClick={() => void ask(suggestion)} key={suggestion}>{suggestion}<Icon name="arrow" /></button>)}</div> : messages.map((message, index) => <div className={`message ${message.role}`} key={`${message.role}-${index}`}><span>{message.role === "assistant" ? <Icon name="spark" /> : "You"}</span><div><p>{message.text}</p>{message.sources?.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.label} <Icon name="external" /></a>)}{message.limitations && <small>{message.limitations}</small>}</div></div>)}</div><form className="composer" onSubmit={(event) => { event.preventDefault(); void ask(); }}><input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask about your status, dates, or missing information…" aria-label="Ask ImmigrantOS" /><button disabled={asking || !question.trim()} aria-label="Send question">{asking ? <span className="spinner" /> : <Icon name="send" />}</button></form></section></div>;
}

function Onboarding({ onSaved }: { onSaved: () => void }) {
  const [draft, setDraft] = useState<ImmigrationProfile>({ ...EMPTY_PROFILE });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError("");
    try { await api("/api/profile", { method: "PUT", body: JSON.stringify(draft) }); onSaved(); }
    catch (err) { setError(err instanceof Error ? err.message : "Unable to save profile."); setSaving(false); }
  };

  return <main className="onboarding-shell"><header><Brand /><span>Private beta · General information only</span></header><div className="onboarding-grid"><section className="onboarding-copy"><p className="eyebrow">YOUR IMMIGRATION COMMAND CENTER</p><h1>Know what matters next.</h1><p>Save the facts that control your timeline. ImmigrantOS calculates a sourced action plan, keeps your documents and case receipts together, and shows where human review is needed.</p><div className="trust-list"><div><Icon name="plan" /><span><strong>Deterministic dates</strong><small>See every input and official source.</small></span></div><div><Icon name="shield" /><span><strong>No fake automation</strong><small>Unavailable integrations are labeled clearly.</small></span></div><div><Icon name="spark" /><span><strong>Lifecycle-wide</strong><small>F-1 through work, green card, and citizenship.</small></span></div></div></section><form className="onboarding-card" onSubmit={save}><div className="step-label"><span>1</span><div><small>START HERE</small><strong>Where are you now?</strong></div></div><div className="stage-grid">{STAGES.map((stage) => <button type="button" className={draft.lifecycleStage === stage.id ? "selected" : ""} onClick={() => setDraft(stageDefaults(stage.id, draft.displayName))} key={stage.id}><span><b>{stage.label}</b><small>{stage.short}</small></span><em>{stage.coverage}</em></button>)}</div><div className="step-label second"><span>2</span><div><small>MINIMUM INPUTS</small><strong>Build your first timeline</strong></div></div><ProfileFields draft={draft} setDraft={setDraft} compact />{error && <p className="form-error">{error}</p>}<button className="primary wide" disabled={saving}>{saving ? "Building your plan…" : "Create my action plan"} <Icon name="arrow" /></button><p className="form-disclaimer">By continuing, you understand this is administrative information—not legal advice or an eligibility decision.</p></form></div></main>;
}

function ProfileDialog({ profile, onClose, onSaved }: { profile: ImmigrationProfile; onClose: () => void; onSaved: () => Promise<void> }) {
  const [draft, setDraft] = useState<ImmigrationProfile>({ ...profile });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const save = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError("");
    try { await api("/api/profile", { method: "PUT", body: JSON.stringify(draft) }); await onSaved(); }
    catch (err) { setError(err instanceof Error ? err.message : "Unable to save profile."); setSaving(false); }
  };
  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><form className="profile-dialog" onSubmit={save} role="dialog" aria-modal="true" aria-labelledby="profile-title"><div className="dialog-head"><div><p className="eyebrow">CONFIRMED INPUTS</p><h2 id="profile-title">Immigration profile</h2></div><button type="button" className="icon-action" onClick={onClose} aria-label="Close"><Icon name="close" /></button></div><div className="stage-tabs">{STAGES.map((stage) => <button type="button" className={draft.lifecycleStage === stage.id ? "active" : ""} onClick={() => setDraft(stageDefaults(stage.id, draft.displayName))} key={stage.id}>{stage.label}<small>{stage.coverage}</small></button>)}</div><ProfileFields draft={draft} setDraft={setDraft} />{error && <p className="form-error">{error}</p>}<div className="dialog-actions"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={saving}>{saving ? "Saving…" : "Save & recalculate"}</button></div></form></div>;
}

function ProfileFields({ draft, setDraft, compact = false }: { draft: ImmigrationProfile; setDraft: (profile: ImmigrationProfile) => void; compact?: boolean }) {
  const field = (key: keyof ImmigrationProfile, value: string | null) => setDraft({ ...draft, [key]: value });
  return <div className={`profile-fields ${compact ? "compact" : ""}`}><label className="span-2"><span>Your name</span><input value={draft.displayName} onChange={(event) => field("displayName", event.target.value)} placeholder="Name shown in your workspace" required /></label>
    {draft.lifecycleStage === "F1" && <><label><span>Current F-1 stage</span><select value={draft.statusSubtype} onChange={(event) => field("statusSubtype", event.target.value)}><option value="STUDENT">Student</option><option value="OPT">Post-completion OPT</option><option value="STEM_OPT">STEM OPT</option></select></label><label><span>I-94 admission</span><select value={draft.admissionBasis} onChange={(event) => field("admissionBasis", event.target.value)}><option value="DS_TRANSITION">D/S (transition cohort)</option><option value="FIXED_DATE">Fixed admit-until date</option></select></label><DateField label="I-20 program end" value={draft.programEndDate} onChange={(value) => field("programEndDate", value)} required />{draft.admissionBasis === "FIXED_DATE" && <DateField label="I-94 admit-until" value={draft.i94ExpirationDate} onChange={(value) => field("i94ExpirationDate", value)} required />}{draft.statusSubtype !== "STUDENT" && <DateField label="Current EAD expires" value={draft.eadEndDate} onChange={(value) => field("eadEndDate", value)} />}</>}
    {draft.lifecycleStage === "H1B" && <><label><span>Status</span><select value={draft.statusSubtype} onChange={(event) => field("statusSubtype", event.target.value)}><option value="H1B">H-1B</option><option value="H4">H-4</option></select></label><DateField label="I-94 admit-until" value={draft.i94ExpirationDate} onChange={(value) => field("i94ExpirationDate", value)} required /><DateField label="Visa stamp expires" value={draft.visaExpirationDate} onChange={(value) => field("visaExpirationDate", value)} /></>}
    {draft.lifecycleStage === "GREEN_CARD" && <><label><span>Current step</span><select value={draft.statusSubtype} onChange={(event) => field("statusSubtype", event.target.value)}><option value="PERM">PERM</option><option value="I140">I-140</option><option value="I485">I-485 / adjustment</option><option value="CONSULAR">Consular processing</option></select></label><DateField label="Priority date" value={draft.priorityDate} onChange={(value) => field("priorityDate", value)} /></>}
    {(draft.lifecycleStage === "LPR" || draft.lifecycleStage === "CITIZENSHIP") && <><DateField label="Resident since" value={draft.greenCardSince} onChange={(value) => field("greenCardSince", value)} required />{draft.lifecycleStage === "LPR" && <DateField label="Green Card expires" value={draft.greenCardExpirationDate} onChange={(value) => field("greenCardExpirationDate", value)} />}<label><span>Naturalization basis</span><select value={draft.naturalizationBasis} onChange={(event) => field("naturalizationBasis", event.target.value)}><option value="five_year">General 5-year rule</option><option value="three_year">3-year spouse rule</option></select></label></>}
    <DateField label="Passport expires" value={draft.passportExpirationDate} onChange={(value) => field("passportExpirationDate", value)} />
  </div>;
}

function DateField({ label, value, onChange, required = false }: { label: string; value: string | null; onChange: (value: string | null) => void; required?: boolean }) {
  return <label><span>{label}</span><input type="date" value={value ?? ""} onChange={(event) => onChange(event.target.value || null)} required={required} /></label>;
}

function EmptyState({ icon, title, copy }: { icon: string; title: string; copy: string }) { return <div className="empty-state"><span><Icon name={icon} /></span><h2>{title}</h2><p>{copy}</p></div>; }
function LoadingScreen() { return <main className="center-screen"><Brand /><span className="large-spinner" /><p>Loading your immigration workspace…</p></main>; }
function ErrorScreen({ message, onRetry }: { message: string; onRetry: () => void }) { return <main className="center-screen error-screen"><span className="error-mark"><Icon name="alert" /></span><h1>Workspace unavailable</h1><p>{message}</p><button className="primary" onClick={onRetry}>Try again</button></main>; }
function Brand({ mobile = false }: { mobile?: boolean }) { return <div className={mobile ? "brand mobile-brand" : "brand"}><span className="brand-mark">I</span><span>Immigrant<b>OS</b></span></div>; }

function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    plan: <><path d="M5 4h14v16H5z" /><path d="M8 9h8M8 13h5M8 17h7" /></>, file: <><path d="M6 2h8l4 4v16H6z" /><path d="M14 2v5h5" /></>, case: <><path d="M5 7h14v13H5zM9 7V4h6v3" /><path d="M5 12h14" /></>, spark: <><path d="m12 3 1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5z" /><path d="m19 16 .7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7z" /></>, shield: <><path d="M12 2 4 5v6c0 5 3.5 8.5 8 11 4.5-2.5 8-6 8-11V5z" /><path d="m9 12 2 2 4-5" /></>, chevron: <path d="m9 18 6-6-6-6" />, edit: <><path d="m4 20 4-.8L19 8.2 15.8 5 4.8 16z" /><path d="m14 6.8 3.2 3.2" /></>, print: <><path d="M7 9V3h10v6M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2" /><path d="M7 14h10v7H7z" /></>, alert: <><path d="m12 3 10 18H2z" /><path d="M12 9v5M12 18h.01" /></>, arrow: <path d="m9 18 6-6-6-6" />, external: <><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 13v7H4V6h7" /></>, check: <path d="m5 12 4 4L19 6" />, upload: <><path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 15v5h16v-5" /></>, download: <><path d="M12 4v12M7 11l5 5 5-5" /><path d="M4 20h16" /></>, trash: <><path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14" /><path d="M10 11v6M14 11v6" /></>, plus: <path d="M12 5v14M5 12h14" />, info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7h.01" /></>, send: <><path d="m3 3 18 9-18 9 4-9z" /><path d="M7 12h14" /></>, close: <path d="m6 6 12 12M18 6 6 18" />,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

async function api<T = { ok: boolean }>(url: string, options?: RequestInit): Promise<T> {
  const headers = new Headers(options?.headers);
  if (options?.body && !(options.body instanceof FormData)) headers.set("content-type", "application/json");
  const response = await fetch(url, { ...options, headers, cache: "no-store" });
  const payload = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status}).`);
  return payload;
}

function stageDefaults(stage: LifecycleStage, displayName: string): ImmigrationProfile {
  return { ...EMPTY_PROFILE, displayName, lifecycleStage: stage, statusSubtype: stage === "H1B" ? "H1B" : stage === "GREEN_CARD" ? "PERM" : "STUDENT", admissionBasis: stage === "F1" ? "DS_TRANSITION" : "" };
}
function greeting() { const hour = new Date().getHours(); return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"; }
function firstName(name: string) { return name.trim().split(/\s+/)[0] || "there"; }
function initials(name: string) { return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "IO"; }
function month(value: string) { return new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`)).toUpperCase(); }
function day(value: string) { return new Date(`${value}T12:00:00Z`).getUTCDate(); }
function year(value: string) { return new Date(`${value}T12:00:00Z`).getUTCFullYear(); }
function labelConfidence(value: PlanItem["confidence"]) { return value === "needs-review" ? "Needs review" : value === "preliminary" ? "Preliminary" : "Verified rule"; }
function formatBytes(bytes: number) { return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`; }
function formatDateTime(value: string) { const date = new Date(value.endsWith("Z") ? value : `${value.replace(" ", "T")}Z`); return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date); }
