"use client";

// Extension of stay (Form I-539) workspace for a VISITOR profile: plain-language
// dates computed from the I-94 date the user entered, the per-profile checklist,
// and a written-statement drafter. No eligibility determinations, no legal advice;
// every date note links its official USCIS source and the fee is never stated.

import { useEffect, useId, useMemo, useState } from "react";
import type { ImmigrationProfile } from "../lib/profile";
import {
  CHECKLIST_GROUP_LABELS,
  DRAFT_LABEL,
  I539_SOURCES,
  type ChecklistGroup,
  type ExtensionChecklistItem,
  type ExtensionHelper,
  type ExtensionSource,
} from "../lib/extension";
import {
  HOME_SITUATIONS,
  REASON_THEMES,
  buildStatementLetter,
  emptyStatementInput,
  letterFilename,
  letterPlaceholders,
  longDate,
  type ReasonTheme,
  type StatementInput,
} from "../lib/extension-letter";
import Icon from "./icon";

type Person = { name: string; possessive: string; possessiveCap: string; isSelf: boolean };
type Notify = (message: string, tone?: "success" | "error") => void;
type HelperResponse = { profileId: string; extension: ExtensionHelper };
type Available = Extract<ExtensionHelper, { available: true }>;

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: "no-store", headers: { "content-type": "application/json" } });
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status}).`);
  return payload;
}

const plain = (value: string) => longDate(value, value);
function relative(days: number) {
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  return days > 0 ? `in ${days} days` : `${-days} days ago`;
}
function localToday() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function SourceLink({ source }: { source: ExtensionSource }) {
  return <a className="ext-source" href={source.url} target="_blank" rel="noreferrer">{source.label}{source.section ? ` — “${source.section}”` : ""} <Icon name="external" size={16} /></a>;
}

export default function ExtensionView({ profile, person, onBack, onEdit, notify }: {
  profile: ImmigrationProfile;
  person: Person;
  onBack: () => void;
  onEdit: () => void;
  notify: Notify;
}) {
  const [data, setData] = useState<ExtensionHelper | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const query = profile.id ? `?profileId=${encodeURIComponent(profile.id)}` : "";

  const load = async () => {
    try {
      const result = await request<HelperResponse>(`/api/extension${query}`);
      setData(result.extension); setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load the extension helper.");
    }
  };
  useEffect(() => {
    let active = true;
    request<HelperResponse>(`/api/extension${query}`)
      .then((result) => { if (active) setData(result.extension); })
      .catch((err) => { if (active) setError(err instanceof Error ? err.message : "Unable to load the extension helper."); });
    return () => { active = false; };
  }, [query]);

  const toggle = async (item: ExtensionChecklistItem) => {
    setBusy(item.id);
    try {
      await request("/api/actions", { method: "POST", body: JSON.stringify({ actionKey: item.id, completed: !item.completed, profileId: profile.id }) });
      await load();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Unable to update the checklist.", "error");
    } finally { setBusy(""); }
  };

  const saveRequestedUntil = async (value: string | null) => {
    setBusy("requested-until");
    try {
      const result = await request<HelperResponse>(`/api/extension${query}`, { method: "PUT", body: JSON.stringify({ requestedUntil: value }) });
      setData(result.extension);
      notify(value ? "Requested-until date saved." : "Requested-until date reset to 6 months after the I-94 date.");
      return true;
    } catch (err) {
      notify(err instanceof Error ? err.message : "Unable to save the date.", "error");
      return false;
    } finally { setBusy(""); }
  };

  const intro = <section className="page-intro"><div><p className="eyebrow">Extension of stay · Form I-539</p><h1>{person.possessiveCap} extension of stay</h1><p>Dates worked out from the I-94 date you entered, a checklist, and a statement letter to draft. General information only: USCIS decides every application.</p></div><div className="intro-actions"><button type="button" className="secondary" onClick={onBack}><Icon name="back" /> Back to plan</button></div></section>;

  if (error && !data) return <div className="page ext-page">{intro}<section className="plan-empty"><span className="plan-empty-icon"><Icon name="alert" /></span><h2>Couldn’t load the extension helper</h2><p>{error}</p><button type="button" className="primary" onClick={() => void load()}>Try again</button></section></div>;
  if (!data) return <div className="page ext-page">{intro}<p className="ext-loading"><span className="spinner" /> Loading…</p></div>;
  if (!data.available) {
    const missing = data.reason === "missing-i94";
    return <div className="page ext-page">{intro}<section className="plan-empty"><span className="plan-empty-icon"><Icon name={missing ? "calendar" : "info"} /></span>
      <h2>{missing ? "Add the I-94 admit-until date first" : "This helper is for visitor (B-1/B-2) profiles"}</h2>
      <p>{missing ? "Every date here is worked out from the “Admit Until Date” on the most recent I-94 record (i94.cbp.dhs.gov)." : `${person.possessiveCap} profile is not set to Visitor (B1/B2). Change the stage in Edit details if that is wrong.`}</p>
      <button type="button" className="primary" onClick={onEdit}><Icon name="edit" /> Edit details</button>
    </section><Sources sources={data.sources} /></div>;
  }

  return <div className="page ext-page">
    {intro}
    <p className="ext-draft-label" role="note"><Icon name="alert" size={18} /><strong>{DRAFT_LABEL}</strong></p>
    <TimelineCards data={data} busy={busy === "requested-until"} onSave={saveRequestedUntil} />
    <Checklist data={data} busy={busy} onToggle={(item) => void toggle(item)} />
    <StatementDrafter key={`${profile.id ?? "primary"}:${data.timeline.i94ExpirationDate}`} profile={profile} data={data} notify={notify} />
    <Sources sources={data.sources} />
    <p className="legal-note">ImmigrantOS provides general administrative information, not legal advice. It does not determine eligibility or replace an accredited representative or immigration attorney.</p>
  </div>;
}

function TimelineCards({ data, busy, onSave }: { data: Available; busy: boolean; onSave: (value: string | null) => Promise<boolean> }) {
  const t = data.timeline;
  const byId = Object.fromEntries(t.dates.map((d) => [d.id, d]));
  const fileBy = byId["recommended-file-by"], deadline = byId.deadline, until = byId["requested-until"], opens = byId["earliest-suggested"];
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(t.requestedUntilDate);
  const inputId = useId();

  const phaseNote =
    t.phase === "after-i94-date" ? <>The I-94 date you entered (<b>{plain(t.deadlineDate)}</b>) has passed. This app can’t tell you what that means for you. Check the <a href={I539_SOURCES.extendStay.url} target="_blank" rel="noreferrer">USCIS Extend Your Stay page</a> or talk to an immigration attorney or accredited representative.</>
      : t.phase === "after-recommended-date" ? <>The recommended 45-day date has passed. The I-539 instructions say you generally must submit before your authorized stay expires on <b>{plain(t.deadlineDate)}</b>.</>
        : t.phase === "before-suggested-window" ? <>The I-539 instructions suggest filing generally not more than 6 months before your stay expires. That window opens on <b>{plain(t.earliestSuggestedFileDate)}</b>.</>
          : null;

  return <section className="section-block" aria-labelledby="ext-dates-title">
    <div className="section-heading"><div><h2 id="ext-dates-title">Key dates</h2></div><span>From the I-94 date you entered: {plain(t.i94ExpirationDate)}</span></div>
    {phaseNote && <p className={`review-note ${t.phase === "after-i94-date" || t.phase === "after-recommended-date" ? "warn" : ""}`}><Icon name="info" size={18} /><span>{phaseNote}</span></p>}
    <div className="ext-dates">
      <article className={`ext-date-card ${fileBy.daysFromToday < 0 ? "past" : fileBy.daysFromToday <= 30 ? "soon" : ""}`}>
        <p className="ext-date-kicker">File by {plain(fileBy.date)} if you can</p>
        <strong>{plain(fileBy.date)}</strong>
        <span className="ext-when">{relative(fileBy.daysFromToday)}</span>
        <p>{fileBy.note}</p>
        <SourceLink source={fileBy.source} />
      </article>
      <article className={`ext-date-card ${deadline.daysFromToday < 0 ? "past" : deadline.daysFromToday <= 30 ? "soon" : ""}`}>
        <p className="ext-date-kicker">USCIS must have it before your stay ends</p>
        <strong>{plain(deadline.date)}</strong>
        <span className="ext-when">{relative(deadline.daysFromToday)}</span>
        <p>{deadline.note}</p>
        <SourceLink source={deadline.source} />
      </article>
      <article className="ext-date-card accent">
        <p className="ext-date-kicker">You are asking to stay until</p>
        {editing
          ? <form className="ext-until-form" onSubmit={async (event) => { event.preventDefault(); if (await onSave(value)) setEditing(false); }}>
              <label htmlFor={inputId} className="visually-hidden">Requested-until date</label>
              <input id={inputId} type="date" value={value} min={t.i94ExpirationDate} required onChange={(event) => setValue(event.target.value)} />
              <div><button type="submit" className="primary" disabled={busy || !value}>Save</button><button type="button" className="secondary" onClick={() => { setEditing(false); setValue(t.requestedUntilDate); }}>Cancel</button></div>
            </form>
          : <strong>{plain(until.date)}</strong>}
        <span className="ext-when">{t.requestedUntilIsDefault ? "Default: 6 months after the I-94 date" : "Your chosen date"}</span>
        <p>{until.note}</p>
        {t.savedRequestedUntilIgnored && <p className="ext-small-warn">A previously saved date was on or before the current I-94 date, so the default is shown.</p>}
        {!editing && <div className="ext-card-actions"><button type="button" className="secondary" onClick={() => { setValue(t.requestedUntilDate); setEditing(true); }}><Icon name="edit" size={18} /> Change</button>{!t.requestedUntilIsDefault && <button type="button" className="secondary" disabled={busy} onClick={() => void onSave(null)}>Use default</button>}</div>}
        <SourceLink source={until.source} />
      </article>
    </div>
    <p className="ext-window">Suggested window {opens.daysFromToday > 0 ? "opens" : "opened"} {plain(opens.date)} (6 months before the I-94 date). <SourceLink source={opens.source} /></p>
  </section>;
}

function Checklist({ data, busy, onToggle }: { data: Available; busy: string; onToggle: (item: ExtensionChecklistItem) => void }) {
  const groups = Array.from(new Set(data.checklist.map((item) => item.group))) as ChecklistGroup[];
  const p = data.progress;
  return <section className="section-block" aria-labelledby="ext-checklist-title">
    <div className="section-heading"><div><h2 id="ext-checklist-title">Checklist</h2></div><span>{p.requiredDone} of {p.requiredTotal} required done{p.total > p.requiredTotal ? ` · ${p.total - p.requiredTotal} optional` : ""}</span></div>
    <div className="ext-progress" role="progressbar" aria-label="Required checklist items done" aria-valuemin={0} aria-valuemax={p.requiredTotal} aria-valuenow={p.requiredDone}><span style={{ width: `${p.requiredTotal ? (p.requiredDone / p.requiredTotal) * 100 : 0}%` }} /></div>
    {groups.map((group) => <div className="ext-group" key={group}>
      <h3>{CHECKLIST_GROUP_LABELS[group]}</h3>
      <div className="action-list">{data.checklist.filter((item) => item.group === group).map((item) => <article className={`action-row ext-check-row ${item.completed ? "done" : ""}`} key={item.id}>
        <button type="button" className="check-button" disabled={busy === item.id} onClick={() => onToggle(item)} aria-label={item.completed ? `Mark “${item.title}” not done` : `Mark “${item.title}” done`} aria-pressed={item.completed}>{item.completed && <Icon name="check" size={14} />}</button>
        <div className="action-copy">
          {item.optional && <div className="tag-row"><span className="tag ongoing">Optional</span></div>}
          <h3>{item.title}</h3>
          <p>{item.detail}</p>
          {item.group === "fee" && <p><a className="ext-inline-link" href={I539_SOURCES.form.url} target="_blank" rel="noreferrer">Check the current fee on the USCIS I-539 page <Icon name="external" size={14} /></a></p>}
          <details><summary>Source</summary><a href={item.source.url} target="_blank" rel="noreferrer">{item.source.label}{item.source.section ? ` — “${item.source.section}”` : ""} <Icon name="external" /></a></details>
        </div>
      </article>)}</div>
    </div>)}
  </section>;
}

// ---------------------------------------------------------------------------
// Statement drafter
// ---------------------------------------------------------------------------

type DraftState = { input: StatementInput; letter: string; edited: boolean };
const storageKey = (profileId: string | undefined, i94: string) => `immigrant-os:i539-statement:${profileId ?? "primary"}:${i94}`;

function initialInput(profile: ImmigrationProfile, data: Available): StatementInput {
  return {
    ...emptyStatementInput(),
    applicantName: profile.displayName.trim(),
    letterDate: localToday(),
    visitorClass: profile.statusSubtype?.toUpperCase() === "B1" ? "B-1" : "B-2",
    departureDate: data.timeline.requestedUntilDate,
  };
}

function loadDraft(key: string): DraftState | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DraftState;
    if (!parsed || typeof parsed !== "object" || !parsed.input || typeof parsed.letter !== "string") return null;
    return { input: { ...emptyStatementInput(), ...parsed.input }, letter: parsed.letter, edited: Boolean(parsed.edited) };
  } catch { return null; }
}

function StatementDrafter({ profile, data, notify }: { profile: ImmigrationProfile; data: Available; notify: Notify }) {
  const key = storageKey(profile.id, data.timeline.i94ExpirationDate);
  const [state, setState] = useState<DraftState>(() => {
    const saved = typeof window === "undefined" ? null : loadDraft(key);
    const input = saved?.input ?? initialInput(profile, data);
    return saved ?? { input, letter: "", edited: false };
  });
  const { input } = state;
  // The I-94 and requested-until dates always come from the saved workspace, so the
  // letter matches what the form will say.
  const effective = useMemo<StatementInput>(() => ({
    ...input,
    i94ExpirationDate: data.timeline.i94ExpirationDate,
    requestedUntilDate: data.timeline.requestedUntilDate,
  }), [input, data.timeline.i94ExpirationDate, data.timeline.requestedUntilDate]);
  const generated = useMemo(() => buildStatementLetter(effective), [effective]);
  const letter = state.edited ? state.letter : generated;
  const placeholders = letterPlaceholders(letter);

  useEffect(() => {
    try { window.localStorage.setItem(key, JSON.stringify({ ...state, letter })); } catch { /* storage full or blocked */ }
  }, [key, state, letter]);

  const set = <K extends keyof StatementInput>(field: K, value: StatementInput[K]) => setState((current) => ({ ...current, input: { ...current.input, [field]: value } }));
  const toggleTheme = (theme: ReasonTheme) => set("themes", input.themes.includes(theme) ? input.themes.filter((item) => item !== theme) : [...input.themes, theme]);

  const rebuild = () => {
    if (state.edited && !window.confirm("Replace your edited letter with a fresh draft built from the answers? Your edits to the letter text will be lost.")) return;
    setState((current) => ({ ...current, letter: "", edited: false }));
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(letter); notify("Draft copied. Review it carefully before use — this is not legal advice."); }
    catch { notify("Couldn’t copy automatically. Select the letter text and copy it.", "error"); }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([letter], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url; link.download = letterFilename(input.applicantName); link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify("Draft downloaded. Review it carefully before use — this is not legal advice.");
  };

  const ids = { name: useId(), address: useId(), email: useId(), phone: useId(), date: useId(), cls: useId(), arrival: useId(), visiting: useId(), previous: useId(), departure: useId(), temporary: useId(), home: useId(), homeDetails: useId(), money: useId(), letter: useId() };
  const themeDetail: Record<ReasonTheme, keyof StatementInput> = { childcare: "childcareDetails", "family-support": "familySupportDetails", other: "otherReason" };
  const themePlaceholder: Record<ReasonTheme, string> = {
    childcare: "e.g. My daughter has two young children, born May 2024 and March 2026. She is not employed and my son-in-law works full-time, so…",
    "family-support": "e.g. My daughter is recovering from surgery and needs help at home until…",
    other: "Your reason, in your own words",
  };

  return <section className="section-block ext-drafter" aria-labelledby="ext-drafter-title">
    <div className="section-heading"><div><h2 id="ext-drafter-title">Written statement</h2></div><span>Saved on this device only</span></div>
    <p className="ext-draft-label" role="note"><Icon name="alert" size={18} /><strong>{DRAFT_LABEL}</strong></p>
    <p className="review-note"><Icon name="info" size={18} /><span>The letter is built only from what you enter below, in three parts: reasons for the request, why the stay is temporary, and the effect on your job or residence at home. Anything you leave blank stays as a <b>[bracketed placeholder]</b>. The <a href={I539_SOURCES.instructions.url} target="_blank" rel="noreferrer">I-539 instructions</a> (B-1/B-2 section) also ask how you will support yourself financially; fill in that field to add a fourth part.</span></p>

    <div className="ext-drafter-grid">
      <form className="ext-form" onSubmit={(event) => event.preventDefault()}>
        <fieldset><legend>About you</legend>
          <div className="ext-fields">
            <label className="field span-2" htmlFor={ids.name}><span>Full name (as on passport)</span><input id={ids.name} value={input.applicantName} onChange={(e) => set("applicantName", e.target.value)} /></label>
            <label className="field span-2" htmlFor={ids.address}><span>Mailing address in the U.S.</span><textarea id={ids.address} rows={2} value={input.address} onChange={(e) => set("address", e.target.value)} placeholder={"Street\nCity, State ZIP"} /></label>
            <label className="field" htmlFor={ids.email}><span>Email <em>(optional)</em></span><input id={ids.email} type="email" value={input.email} onChange={(e) => set("email", e.target.value)} /></label>
            <label className="field" htmlFor={ids.phone}><span>Phone <em>(optional)</em></span><input id={ids.phone} type="tel" value={input.phone} onChange={(e) => set("phone", e.target.value)} /></label>
            <label className="field" htmlFor={ids.date}><span>Date on the letter</span><input id={ids.date} type="date" value={input.letterDate ?? ""} onChange={(e) => set("letterDate", e.target.value || null)} /></label>
            <label className="field" htmlFor={ids.cls}><span>Visitor class on your I-94</span><select id={ids.cls} value={input.visitorClass} onChange={(e) => set("visitorClass", e.target.value === "B-1" ? "B-1" : "B-2")}><option value="B-2">B-2 (visitor for pleasure)</option><option value="B-1">B-1 (visitor for business)</option></select></label>
          </div>
        </fieldset>

        <fieldset><legend>This visit</legend>
          <div className="ext-fields">
            <label className="field" htmlFor={ids.arrival}><span>Date you arrived</span><input id={ids.arrival} type="date" value={input.arrivalDate ?? ""} onChange={(e) => set("arrivalDate", e.target.value || null)} /></label>
            <label className="field" htmlFor={ids.visiting}><span>Who you are visiting</span><input id={ids.visiting} value={input.visiting} onChange={(e) => set("visiting", e.target.value)} placeholder="my daughter and her family" /></label>
            <p className="ext-fixed span-2">I-94 date <b>{plain(data.timeline.i94ExpirationDate)}</b> and requested-until date <b>{plain(data.timeline.requestedUntilDate)}</b> come from Key dates above.</p>
          </div>
        </fieldset>

        <fieldset><legend>1 · Reasons for the request</legend>
          <div className="ext-themes" role="group" aria-label="Reason themes">
            {REASON_THEMES.map((theme) => <label key={theme.id} className={`ext-theme ${input.themes.includes(theme.id) ? "selected" : ""}`}><input type="checkbox" checked={input.themes.includes(theme.id)} onChange={() => toggleTheme(theme.id)} /><span><b>{theme.label}</b><small>{theme.hint}</small></span></label>)}
          </div>
          {REASON_THEMES.filter((theme) => input.themes.includes(theme.id)).map((theme) => {
            const field = themeDetail[theme.id];
            return <label className="field" key={theme.id}><span>{theme.label}: the facts</span><textarea rows={4} value={String(input[field] ?? "")} onChange={(e) => set(field, e.target.value as never)} placeholder={themePlaceholder[theme.id]} /></label>;
          })}
          <label className="field" htmlFor={ids.previous}><span>Earlier visits or extensions <em>(optional)</em></span><textarea id={ids.previous} rows={2} value={input.previousStays} onChange={(e) => set("previousStays", e.target.value)} placeholder="e.g. receipt number of an earlier approved extension and when you departed" /><small>Only include facts you can document.</small></label>
        </fieldset>

        <fieldset><legend>2 · Why the stay is temporary</legend>
          <div className="ext-fields">
            <label className="field" htmlFor={ids.departure}><span>Planned departure date</span><input id={ids.departure} type="date" value={input.departureDate ?? ""} onChange={(e) => set("departureDate", e.target.value || null)} /><small>Usually the same as the requested-until date ({plain(data.timeline.requestedUntilDate)}) or earlier.</small></label>
            <label className="field span-2" htmlFor={ids.temporary}><span>Reasons you will go home <em>(optional)</em></span><textarea id={ids.temporary} rows={3} value={input.temporaryDetails} onChange={(e) => set("temporaryDetails", e.target.value)} placeholder="e.g. I need to return home to take care of my own parents, who are in their 80s." /></label>
          </div>
        </fieldset>

        <fieldset><legend>3 · Effect on your job or residence at home</legend>
          <div className="ext-themes compact" role="radiogroup" aria-label="Situation at home">
            {HOME_SITUATIONS.map((item) => <label key={item.id} className={`ext-theme ${input.homeSituation === item.id ? "selected" : ""}`}><input type="radio" name={ids.home} checked={input.homeSituation === item.id} onChange={() => set("homeSituation", item.id)} /><span><b>{item.label}</b></span></label>)}
          </div>
          <label className="field" htmlFor={ids.homeDetails}><span>{input.homeSituation === "employed" ? "Your job and the arrangement for your return" : "More details"} <em>{input.homeSituation === "employed" ? "" : "(optional)"}</em></span><textarea id={ids.homeDetails} rows={3} value={input.homeDetails} onChange={(e) => set("homeDetails", e.target.value)} placeholder={input.homeSituation === "employed" ? "e.g. I work at … and have approved leave until …" : "e.g. My residence in my home country remains unchanged."} /></label>
        </fieldset>

        <fieldset><legend>4 · Financial support <em>(adds a fourth part)</em></legend>
          <label className="field" htmlFor={ids.money}><span>How you will support yourself while in the U.S.</span><textarea id={ids.money} rows={2} value={input.financialSupport} onChange={(e) => set("financialSupport", e.target.value)} placeholder="Describe in your own words; leave blank to omit this part." /><small>Listed in the I-539 instructions for B-1/B-2 statements.</small></label>
        </fieldset>
      </form>

      <div className="ext-letter">
        <div className="ext-letter-head">
          <label htmlFor={ids.letter}><strong>Letter</strong> <span>{state.edited ? "Edited by you" : "Updates as you type"}</span></label>
          <div className="ext-letter-actions">
            <button type="button" className="secondary" onClick={() => void copy()}><Icon name="copy" size={18} /> Copy</button>
            <button type="button" className="secondary" onClick={download}><Icon name="download" size={18} /> Download</button>
          </div>
        </div>
        <textarea id={ids.letter} className="ext-letter-text" value={letter} spellCheck onChange={(e) => setState((current) => ({ ...current, letter: e.target.value, edited: true }))} />
        {state.edited && <button type="button" className="secondary ext-rebuild" onClick={rebuild}>Rebuild from answers</button>}
        {placeholders.length > 0 && <div className="ext-placeholders"><Icon name="alert" size={18} /><div><strong>{placeholders.length} placeholder{placeholders.length === 1 ? "" : "s"} still to fill</strong><ul>{placeholders.map((item) => <li key={item}>{item}</li>)}</ul></div></div>}
      </div>
    </div>
  </section>;
}

function Sources({ sources }: { sources: ExtensionSource[] }) {
  return <section className="info-strip"><Icon name="info" /><div><strong>Official sources</strong><p>Check every date and requirement against these USCIS pages before you file. The filing fee changes; check the current fee on the <a href={I539_SOURCES.form.url} target="_blank" rel="noreferrer">USCIS I-539 page</a>.</p><ul className="ext-source-list">{sources.map((source) => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.label} <Icon name="external" size={14} /></a></li>)}</ul></div></section>;
}
