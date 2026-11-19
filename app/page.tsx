"use client";

import { FormEvent, useEffect, useId, useRef, useState } from "react";
import type { ImmigrationProfile, LifecycleStage } from "../lib/profile";
import type { PlanItem, PlanResult, Source } from "../lib/rules";
import AgentConnect from "./agent-settings";
import { calendarFile } from "../lib/calendar";

type View = "plan" | "profiles" | "documents" | "cases" | "assistant" | "settings";
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

const STAGES: { id: LifecycleStage; label: string; short: string }[] = [
  { id: "F1", label: "F-1 / OPT", short: "Study & work" },
  { id: "H1B", label: "H-1B / H-4", short: "Temporary worker" },
  { id: "VISITOR", label: "Visitor (B1/B2)", short: "Temporary visitor" },
  { id: "GREEN_CARD", label: "Green card", short: "Permanent residence process" },
  { id: "LPR", label: "Permanent resident", short: "Maintain & renew" },
  { id: "CITIZENSHIP", label: "Citizenship", short: "Naturalization" },
];

const NAV: { id: View; label: string; short: string; icon: string }[] = [
  { id: "plan", label: "Action plan", short: "Plan", icon: "plan" },
  { id: "profiles", label: "Profiles", short: "Profiles", icon: "users" },
  { id: "documents", label: "Documents", short: "Documents", icon: "file" },
  { id: "cases", label: "Cases", short: "Cases", icon: "case" },
  { id: "assistant", label: "Connect assistant", short: "Assistant", icon: "spark" },
  { id: "settings", label: "Settings", short: "Settings", icon: "gear" },
];

// Plain-language names for status codes. The same wording is used in the form dropdowns,
// the profile switcher, the Profiles page and Settings, so users never see a raw code.
const STATUS_LABELS: Record<string, string> = {
  STUDENT: "Student", OPT: "Working on OPT", STEM_OPT: "STEM OPT extension",
  H1B: "H-1B worker", H4: "H-4 family member", B1_B2: "Visitor (B1/B2)",
  PERM: "Labor certification (PERM)", I140: "Immigrant petition (I-140)", I485: "Applying from inside the U.S. (I-485)", CONSULAR: "Visa interview abroad (consular)",
};
const STATUS_OPTIONS: Record<string, string[]> = { F1: ["STUDENT", "OPT", "STEM_OPT"], H1B: ["H1B", "H4"], GREEN_CARD: ["PERM", "I140", "I485", "CONSULAR"] };
function statusLabel(code: string) { return STATUS_LABELS[code] ?? "Not set"; }
function stageLabel(stage: LifecycleStage) { return STAGES.find((item) => item.id === stage)?.label ?? "Not set"; }
// "Green card · Applying from inside the U.S. (I-485)"; the sub-step is omitted when it only repeats the stage.
function describeProfile(item: ImmigrationProfile) {
  const stage = stageLabel(item.lifecycleStage);
  const showStatus = item.statusSubtype && STATUS_OPTIONS[item.lifecycleStage]?.includes(item.statusSubtype);
  return showStatus ? `${stage} · ${statusLabel(item.statusSubtype)}` : stage;
}

type Workspace = { profile: ImmigrationProfile | null; profiles: ImmigrationProfile[]; plan: PlanResult | null; documents: SavedDocument[]; cases: TrackedCase[] };
type ToastState = { message: string; tone: "success" | "error" };
type Notify = (message: string, tone?: ToastState["tone"]) => void;

async function loadWorkspace(targetId: string | null): Promise<Workspace> {
  const query = targetId ? `?profileId=${encodeURIComponent(targetId)}` : "";
  const [profileData, planData, documentData, caseData] = await Promise.all([
    api<{ profile: ImmigrationProfile | null; profiles?: ImmigrationProfile[] }>(`/api/profile${query}`),
    api<{ plan: PlanResult | null }>(`/api/plan${query}`),
    api<{ documents: SavedDocument[] }>(`/api/documents${query}`),
    api<{ cases: TrackedCase[] }>(`/api/cases${query}`),
  ]);
  return {
    profile: profileData.profile,
    profiles: profileData.profiles ?? (profileData.profile ? [profileData.profile] : []),
    plan: planData.plan,
    documents: documentData.documents,
    cases: caseData.cases,
  };
}

export default function Home() {
  const [view, setView] = useState<View>("plan");
  const [profile, setProfile] = useState<ImmigrationProfile | null>(null);
  const [profiles, setProfiles] = useState<ImmigrationProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [plan, setPlan] = useState<PlanResult | null>(null);
  const [documents, setDocuments] = useState<SavedDocument[]>([]);
  const [cases, setCases] = useState<TrackedCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [profileOpen, setProfileOpen] = useState(false);
  const [addingProfile, setAddingProfile] = useState(false);
  const [switchingTo, setSwitchingTo] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [fatalError, setFatalError] = useState("");
  const toastTimer = useRef<number | undefined>(undefined);

  const notify: Notify = (message, tone = "success") => {
    window.clearTimeout(toastTimer.current);
    setToast({ message, tone });
    toastTimer.current = window.setTimeout(() => setToast(null), tone === "error" ? 7000 : 3400);
  };

  const applyWorkspace = (data: Workspace) => {
    setProfile(data.profile);
    setProfiles(data.profiles);
    setActiveProfileId(data.profile?.id ?? null);
    setPlan(data.plan);
    setDocuments(data.documents);
    setCases(data.cases);
    return data.profile?.id ?? null;
  };

  // Reloads the workspace for the active (or requested) profile. It never swaps the
  // on-screen person silently: a transient failure keeps the current data and says so;
  // only a profile that no longer exists (404) falls back to the primary profile, with
  // an explicit notice naming who is now shown.
  const refresh = async (requestedProfileId?: string | null): Promise<string | null> => {
    setFatalError("");
    const targetId = requestedProfileId !== undefined ? requestedProfileId : activeProfileId;
    try {
      return applyWorkspace(await loadWorkspace(targetId));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load your workspace.";
      if (targetId && error instanceof ApiError && error.status === 404) {
        try {
          const data = await loadWorkspace(null);
          const loadedId = applyWorkspace(data);
          if (data.profile) notify(`That profile is no longer available, so you are now viewing ${profileLabel(data.profile, data.profiles.indexOf(data.profile))}.`, "error");
          return loadedId;
        } catch (fallbackError) {
          setFatalError(fallbackError instanceof Error ? fallbackError.message : message);
          return null;
        }
      }
      if (profile) {
        notify(`Couldn’t refresh ${profileLabel(profile, profiles.indexOf(profile))}’s information. What you see may be out of date. ${message}`, "error");
        return profile.id ?? null;
      }
      setFatalError(message);
      return null;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => { void refresh(); }, 0);
    return () => { window.clearTimeout(timer); window.clearTimeout(toastTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Switching loads the chosen profile first and only replaces what is on screen once that
  // profile has loaded. On failure the current profile stays visible and the error says so.
  const selectProfile = async (nextProfileId: string) => {
    if (!nextProfileId || nextProfileId === profile?.id || switchingTo) return;
    const chosenIndex = profiles.findIndex((item) => item.id === nextProfileId);
    const chosenLabel = chosenIndex >= 0 ? profileLabel(profiles[chosenIndex], chosenIndex) : "that profile";
    const currentLabel = profile ? profileLabel(profile, profiles.indexOf(profile)) : "your current profile";
    setSwitchingTo(nextProfileId);
    try {
      const data = await loadWorkspace(nextProfileId);
      if (data.profile?.id !== nextProfileId) throw new Error("A different profile was returned.");
      applyWorkspace(data);
      notify(`Now viewing ${chosenLabel}.`);
    } catch (error) {
      const reason = error instanceof Error ? ` (${error.message})` : "";
      notify(`Couldn’t open ${chosenLabel}${reason}. You are still viewing ${currentLabel}.`, "error");
      if (error instanceof ApiError && error.status === 404) void refresh(profile?.id ?? null);
    } finally {
      setSwitchingTo(null);
    }
  };

  const handleRenameProfile = async (id: string, displayName: string) => {
    try {
      await api("/api/profile", {
        method: "PATCH",
        body: JSON.stringify({ profileId: id, displayName }),
      });
      await refresh(activeProfileId);
      notify("Profile renamed.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Unable to rename profile.", "error");
      throw error;
    }
  };

  const handleDeleteProfile = async (target: ImmigrationProfile) => {
    if (!target.id || target.isPrimary || profiles.length <= 1) return;
    const label = target.displayName || "this profile";
    if (!window.confirm(`Delete profile "${label}" and its saved documents, cases, and completed tasks? This cannot be undone.`)) {
      return;
    }
    try {
      const result = await api<{ profile: ImmigrationProfile | null; profiles: ImmigrationProfile[] }>(
        `/api/profile?profileId=${encodeURIComponent(target.id)}`,
        { method: "DELETE" },
      );
      const nextId = activeProfileId === target.id ? (result.profile?.id ?? null) : activeProfileId;
      setActiveProfileId(nextId);
      await refresh(nextId);
      notify(`Profile "${label}" deleted.`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Unable to delete profile.", "error");
    }
  };

  const toastNode = toast && <div className={`toast ${toast.tone}`} role={toast.tone === "error" ? "alert" : "status"}><span><Icon name={toast.tone === "error" ? "alert" : "check"} /></span>{toast.message}</div>;

  if (loading) return <LoadingScreen />;
  if (fatalError) return <ErrorScreen message={fatalError} onRetry={() => { setLoading(true); void refresh(); }} />;
  if (!profile) return <Onboarding onSaved={(createdId) => { setLoading(true); void refresh(createdId ?? null); }} />;
  if (addingProfile) {
    return (
      <>
        <Onboarding
          mode="add"
          onCancel={() => setAddingProfile(false)}
          onSaved={(createdId) => {
            setAddingProfile(false);
            setLoading(true);
            void refresh(createdId ?? null);
            notify("Profile added and action plan calculated.");
          }}
        />
        {toastNode}
      </>
    );
  }

  const profileList = profiles.length ? profiles : [profile];
  const person = personFor(profile, profileList.indexOf(profile));
  const go = (next: View) => { setView(next); window.scrollTo({ top: 0 }); };

  return (
    <main className="app-shell">
      <header className="app-nav">
        <div className="app-nav-inner">
          <button type="button" className="brand-button" onClick={() => go("plan")} aria-label="Immigrant OS — go to action plan"><Brand /></button>
          <nav className="primary-nav" aria-label="Main navigation">
            {NAV.map((item) => <button type="button" key={item.id} className={view === item.id ? "active" : ""} aria-current={view === item.id ? "page" : undefined} onClick={() => go(item.id)}><Icon name={item.icon} size={18} /><span>{item.label}</span></button>)}
          </nav>
          <ProfileSwitcher
            profiles={profileList}
            active={profile}
            switchingTo={switchingTo}
            onSelect={(id) => void selectProfile(id)}
            onAdd={() => setAddingProfile(true)}
            onManage={() => go("profiles")}
            onEdit={() => setProfileOpen(true)}
          />
        </div>
      </header>

      <section className="workspace" aria-busy={switchingTo ? true : undefined}>
        {view === "plan" && <PlanView key={profile.id ?? "primary"} profile={profile} person={person} plan={plan} documents={documents} cases={cases} onEdit={() => setProfileOpen(true)} onNavigate={go} onRefresh={async () => { await refresh(); }} notify={notify} />}
        {view === "profiles" && (
          <ProfilesView
            profiles={profileList}
            activeProfileId={profile.id}
            person={person}
            switchingTo={switchingTo}
            onSelectProfile={(id) => void selectProfile(id)}
            onAddProfile={() => setAddingProfile(true)}
            onRenameProfile={handleRenameProfile}
            onDeleteProfile={handleDeleteProfile}
          />
        )}
        {view === "documents" && <DocumentsView key={profile.id ?? "primary"} profileId={profile.id} person={person} documents={documents} onChanged={async () => { await refresh(); }} notify={notify} />}
        {view === "cases" && <CasesView key={profile.id ?? "primary"} profileId={profile.id} person={person} cases={cases} onChanged={async () => { await refresh(); }} notify={notify} />}
        {view === "assistant" && <AssistantView key={profile.id ?? "primary"} profileId={profile.id} person={person} plan={plan} />}
        {view === "settings" && <SettingsPage profile={profile} person={person} onEdit={() => setProfileOpen(true)} onManageProfiles={() => go("profiles")} />}
      </section>

      <nav className="bottom-nav" aria-label="Main navigation">{NAV.map((item) => <button type="button" key={item.id} className={view === item.id ? "active" : ""} aria-current={view === item.id ? "page" : undefined} onClick={() => go(item.id)}><Icon name={item.icon} /><span>{item.short}</span></button>)}</nav>

      {profileOpen && (
        <ProfileDialog
          profile={profile}
          canDelete={!profile.isPrimary && profileList.length > 1}
          onDelete={async () => {
            setProfileOpen(false);
            await handleDeleteProfile(profile);
          }}
          onClose={() => setProfileOpen(false)}
          onSaved={async () => {
            setProfileOpen(false);
            await refresh();
            notify("Profile saved and action plan recalculated.");
          }}
        />
      )}
      {toastNode}
    </main>
  );
}

function ProfileSwitcher({ profiles, active, switchingTo, onSelect, onAdd, onManage, onEdit }: {
  profiles: ImmigrationProfile[];
  active: ImmigrationProfile;
  switchingTo: string | null;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onManage: () => void;
  onEdit: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent | TouchEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false); };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); triggerRef.current?.focus(); } };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer);
    document.addEventListener("keydown", onKey);
    rootRef.current?.querySelector<HTMLElement>("[role^=menuitem]")?.focus();
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const moveFocus = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const items = Array.from(rootRef.current?.querySelectorAll<HTMLElement>("[role^=menuitem]") ?? []);
    const index = items.indexOf(document.activeElement as HTMLElement);
    const next = event.key === "ArrowDown" ? (index + 1) % items.length : (index - 1 + items.length) % items.length;
    items[next]?.focus();
  };

  const activeIndex = profiles.findIndex((item) => item.id === active.id);
  const activeName = profileLabel(active, activeIndex);
  const activePerson = personFor(active, activeIndex);
  const pending = switchingTo ? profiles.find((item) => item.id === switchingTo) : undefined;
  const close = (then: () => void) => () => { setOpen(false); then(); };

  return <div className="switcher" ref={rootRef}>
    <button ref={triggerRef} type="button" className={`switcher-trigger ${open ? "open" : ""}`} aria-haspopup="menu" aria-expanded={open} aria-label={`Viewing ${activeName}. Switch profile`} onClick={() => setOpen((value) => !value)}>
      <span className="avatar">{initials(active.displayName)}</span>
      <span className="switcher-text"><small>{pending ? "Switching…" : "Viewing"}</small><strong>{pending ? profileLabel(pending, profiles.indexOf(pending)) : activeName}</strong></span>
      <Icon name="chevronDown" size={16} />
    </button>
    {open && <div className="switcher-menu" role="menu" aria-label="Switch profile" onKeyDown={moveFocus}>
      <p className="switcher-menu-label">Switch profile</p>
      {profiles.map((item, idx) => {
        const isActive = item.id === active.id;
        return <button type="button" role="menuitemradio" aria-checked={isActive} key={item.id ?? idx} className={isActive ? "current" : ""} disabled={!!switchingTo} onClick={close(() => { if (item.id && !isActive) onSelect(item.id); })}>
          <span className="avatar">{initials(item.displayName)}</span>
          <span className="switcher-item-text"><strong>{profileLabel(item, idx)}{item.isPrimary ? <em> · You</em> : null}</strong><small>{describeProfile(item)}</small></span>
          {isActive && <Icon name="check" size={18} />}
        </button>;
      })}
      <div className="switcher-divider" role="separator" />
      <button type="button" role="menuitem" onClick={close(onEdit)}><Icon name="edit" size={18} /><span>Edit {activePerson.possessive} details</span></button>
      <button type="button" role="menuitem" onClick={close(onAdd)}><Icon name="plus" size={18} /><span>Add a family member</span></button>
      <button type="button" role="menuitem" onClick={close(onManage)}><Icon name="users" size={18} /><span>Manage profiles</span></button>
      <div className="switcher-divider" role="separator" />
      <form action="/auth/logout" method="post"><button type="submit" role="menuitem"><Icon name="logout" size={18} /><span>Sign out</span></button></form>
    </div>}
  </div>;
}

function SettingsPage({ profile, person, onEdit, onManageProfiles }: { profile: ImmigrationProfile; person: Person; onEdit: () => void; onManageProfiles: () => void }) {
  return <div className="page settings-page">
    <section className="page-intro"><div><p className="eyebrow">Settings</p><h1>{person.possessiveCap} settings</h1><p>Edit {person.isSelf ? "your" : person.possessive} immigration details, or manage your account.</p></div></section>
    <section className="settings-card">
      <div><h2>{person.possessiveCap} profile details</h2><p>{describeProfile(profile)}. The dates saved here build {person.isSelf ? "your" : person.possessive} action plan.</p></div>
      <div className="settings-actions"><button type="button" className="primary" onClick={onEdit}><Icon name="edit" /> Edit details</button><button type="button" className="secondary" onClick={onManageProfiles}><Icon name="users" /> Manage profiles</button></div>
    </section>
    <section className="settings-card">
      <div><h2>Account</h2><p>Your files and records are private to your signed-in account. Signing out ends the session for every profile in this account.</p></div>
      <div className="settings-actions"><form action="/auth/logout" method="post"><button type="submit" className="secondary"><Icon name="logout" /> Sign out</button></form></div>
    </section>
    <p className="legal-note">ImmigrantOS provides general administrative information, not legal advice. It does not determine eligibility or replace a DSO, employer counsel, accredited representative, or immigration attorney.</p>
  </div>;
}

function PlanView({ profile, person, plan, documents, cases, onEdit, onNavigate, onRefresh, notify }: { profile: ImmigrationProfile; person: Person; plan: PlanResult | null; documents: SavedDocument[]; cases: TrackedCase[]; onEdit: () => void; onNavigate: (view: View) => void; onRefresh: () => Promise<void>; notify: Notify }) {
  const [busy, setBusy] = useState("");
  const openItems = plan?.items.filter((item) => !item.completed) ?? [];
  const next = openItems[0];
  const exportCalendar = () => {
    if (!plan) return;
    const url = URL.createObjectURL(new Blob([calendarFile(plan)], { type: "text/calendar;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url; link.download = "immigrant-os-dates.ics"; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify("Calendar downloaded. Import it into your calendar; future changes are not synced automatically.");
  };

  const toggle = async (item: PlanItem) => {
    setBusy(item.id);
    try {
      await api("/api/actions", {
        method: "POST",
        body: JSON.stringify({ actionKey: item.id, completed: !item.completed, profileId: profile.id }),
      });
      await onRefresh();
      notify(item.completed ? "Action reopened." : "Action marked complete.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Unable to update action.", "error");
    } finally {
      setBusy("");
    }
  };

  const items = plan?.items ?? [];
  const missing = plan?.missingFields ?? [];
  const doneCount = items.length - openItems.length;
  const whose = person.isSelf ? "your" : person.possessive;
  const addDatesTitle = person.isSelf ? "Add your dates to see your plan" : `Add ${person.possessive} dates to see the plan`;
  const s = (count: number) => count === 1 ? "" : "s";
  const subtitle = openItems.length
    ? `${openItems.length} open action${s(openItems.length)}, built from ${whose} saved dates.${missing.length ? ` Add ${missing.length} more date${s(missing.length)} to complete the plan.` : ""}`
    : missing.length ? `The plan is built from the dates you save. ${missing.length} date${s(missing.length)} still missing.` : items.length ? "Everything in this plan is marked complete." : "Add more dates to get reminders.";

  return <div className="page plan-page">
    <section className="page-intro"><div><p className="eyebrow">{new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" }).format(new Date())}</p><h1>{person.isSelf ? `${greeting()}, ${firstName(profile.displayName)}.` : `Viewing ${person.possessive} plan`}</h1><p>{subtitle}</p></div><div className="intro-actions"><button className="secondary" onClick={onEdit}><Icon name="edit" /> Edit details</button><button className="secondary" onClick={exportCalendar} disabled={!openItems.some((item) => item.dueDate)} title={openItems.some((item) => item.dueDate) ? undefined : "No dated actions to export yet"}><Icon name="download" /> Export calendar</button><button className="icon-action" onClick={() => window.print()} aria-label="Print action plan"><Icon name="print" /></button></div></section>

    {next ? <>
      {missing.length ? <section className="missing-card"><div className="missing-icon"><Icon name="alert" /></div><div><h2>{missing.length} date{s(missing.length)} missing from {whose} plan</h2><p>Some actions can’t be shown until these are saved.</p><ul>{missing.map((field) => <li key={field}>{field}</li>)}</ul><button onClick={onEdit}>Add missing dates <Icon name="arrow" /></button></div></section> : null}
      <section className={`next-action ${timing(next).tone}`} aria-labelledby="next-action-title"><div className="next-date">{next.dueDate ? <><span>{month(next.dueDate)}</span><strong>{day(next.dueDate)}</strong><small>{year(next.dueDate)}</small></> : <span className="no-date">No fixed date</span>}</div><div className="next-copy"><p className="next-label">Next up</p><TagRow item={next} /><h2 id="next-action-title">{next.title}</h2><p>{next.description}</p><div className="basis"><span>Based on</span>{next.basis.map((value) => <b key={value}>{value}</b>)}</div><a href={next.source.url} target="_blank" rel="noreferrer">{next.source.label} <Icon name="external" /></a></div><button className="secondary complete-button" disabled={busy === next.id} onClick={() => toggle(next)}><Icon name="check" /> Mark done</button></section>
    </> : missing.length ? <section className="plan-empty"><span className="plan-empty-icon"><Icon name="plan" /></span><h2>{addDatesTitle}</h2><p>Actions and reminders appear once these dates are saved. Each one shows where to find it.</p><ul>{missing.map((field) => <li key={field}>{field}</li>)}</ul><button className="primary" onClick={onEdit}><Icon name="plus" /> Add dates</button></section>
      : items.length ? <section className="all-done"><Icon name="check" /><h2>All caught up</h2><p>Every action in {whose} plan is marked done. New actions appear when {person.isSelf ? "you update your" : `you update ${person.possessive}`} dates.</p></section>
      : <section className="plan-empty"><span className="plan-empty-icon"><Icon name="plan" /></span><h2>Nothing to schedule yet</h2><p>Add more dates, such as a passport or work-permit expiration, to get reminders here.</p><button className="primary" onClick={onEdit}><Icon name="edit" /> Edit details</button></section>}

    {items.length ? <section className="section-block"><div className="section-heading"><div><h2>Everything in {whose} plan</h2></div><span>{openItems.length} open{doneCount ? ` · ${doneCount} done` : ""}</span></div>
      <p className="review-note"><Icon name="info" size={18} /><span>Dates come from what you entered. Before acting on one, check it against the official source under “Why this date?”.</span></p>
      <div className="action-list">{items.map((item) => <article className={`action-row ${item.completed ? "done" : ""}`} key={item.id}><button className="check-button" disabled={busy === item.id} onClick={() => toggle(item)} aria-label={item.completed ? `Mark “${item.title}” not done` : `Mark “${item.title}” done`} aria-pressed={item.completed}>{item.completed && <Icon name="check" size={14} />}</button><div className="action-date">{item.dueDate ? <><b>{month(item.dueDate)} {day(item.dueDate)}</b><span>{year(item.dueDate)}</span></> : <><b>Ongoing</b><span>No fixed date</span></>}</div><div className="action-copy"><TagRow item={item} /><h3>{item.title}</h3><p>{item.description}</p><details><summary>Why this date?</summary><ul>{item.basis.map((basis) => <li key={basis}>{basis}</li>)}</ul><a href={item.source.url} target="_blank" rel="noreferrer">{item.source.label} · {item.source.ruleVersion} <Icon name="external" /></a></details></div></article>)}</div></section> : null}

    <section className="quick-grid"><button className="quick-card" onClick={() => onNavigate("documents")}><span className="quick-icon"><Icon name="file" /></span><div><small>Documents</small><strong>{documents.length ? `${documents.length} saved document${s(documents.length)}` : "Add your first document"}</strong><p>PDF, JPEG, or PNG · 10 MB max</p></div><Icon name="arrow" /></button><button className="quick-card" onClick={() => onNavigate("cases")}><span className="quick-icon"><Icon name="case" /></span><div><small>USCIS receipts</small><strong>{cases.length ? `${cases.length} receipt${s(cases.length)} saved` : "Add a receipt number"}</strong><p>One entry for each filing</p></div><Icon name="arrow" /></button><button className="quick-card" onClick={() => onNavigate("assistant")}><span className="quick-icon"><Icon name="spark" /></span><div><small>Assistant</small><strong>Ask about {whose} plan</strong><p>Answers from saved dates and this checklist</p></div><Icon name="arrow" /></button></section>

    <p className="legal-note">ImmigrantOS provides general administrative information, not legal advice. It does not determine eligibility or replace a DSO, employer counsel, accredited representative, or immigration attorney.</p>
  </div>;
}

// Plain-language "when" chip that replaces the raw critical/important/planning severity tags.
function TagRow({ item }: { item: PlanItem }) {
  const when = timing(item);
  return <div className="tag-row"><span className={`tag ${when.tone}`}>{when.label}</span>{item.confidence === "preliminary" && !item.completed ? <span className="tag estimate" title="A suggested reminder date worked out from your dates, not a date shown on any document.">Suggested reminder</span> : null}</div>;
}

function ProfilesView({ profiles, activeProfileId, person, switchingTo, onSelectProfile, onAddProfile, onRenameProfile, onDeleteProfile }: {
  profiles: ImmigrationProfile[];
  activeProfileId?: string;
  person: Person;
  switchingTo: string | null;
  onSelectProfile: (id: string) => void;
  onAddProfile: () => void;
  onRenameProfile: (id: string, displayName: string) => Promise<void>;
  onDeleteProfile: (profile: ImmigrationProfile) => Promise<void>;
}) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const submitRename = async (event: FormEvent, id: string) => {
    event.preventDefault();
    if (!renameDraft.trim()) return;
    setBusy(true);
    try {
      await onRenameProfile(id, renameDraft.trim());
      setRenamingId(null);
      setRenameDraft("");
    } finally {
      setBusy(false);
    }
  };

  return <div className="page">
    <section className="page-intro"><div><p className="eyebrow">Profiles</p><h1>Family profiles</h1><p>You are viewing <strong>{person.name}</strong>. Each profile keeps its own dates, documents, and receipts. Open, rename, or add a family member.</p></div><div className="intro-actions"><button type="button" className="primary" onClick={onAddProfile}><Icon name="plus" /> Add a family member</button></div></section>

    <div className="section-block">
      <div className="profile-list">
        {profiles.map((item, idx) => {
          const itemId = item.id ?? "";
          const isActive = activeProfileId === itemId;
          const isRenaming = renamingId === itemId;
          const canDelete = !item.isPrimary && profiles.length > 1;
          return <article className={`profile-card ${isActive ? "current" : ""}`} key={itemId || `${item.displayName}-${idx}`}>
            <span className="avatar">{initials(item.displayName)}</span>
            <div className="profile-card-body">
              <h3>{profileLabel(item, idx)} {item.isPrimary ? <span className="tag neutral">You</span> : null} {isActive ? <span className="tag accent">Viewing now</span> : null}</h3>
              <p>{describeProfile(item)}</p>
              {isRenaming && <form className="inline-rename-form" onSubmit={(event) => void submitRename(event, itemId)}>
                <input value={renameDraft} maxLength={100} onChange={(event) => setRenameDraft(event.target.value)} placeholder="Name (e.g. spouse, child)" required aria-label="New profile name" />
                <button type="submit" className="primary" disabled={busy || !renameDraft.trim()}>Save</button>
                <button type="button" className="secondary" onClick={() => { setRenamingId(null); setRenameDraft(""); }}>Cancel</button>
              </form>}
            </div>
            <div className="profile-card-actions">
              {!isActive && itemId && <button type="button" className="secondary" disabled={!!switchingTo} onClick={() => onSelectProfile(itemId)}>{switchingTo === itemId ? "Opening…" : "Open"}</button>}
              {itemId && !isRenaming && <button type="button" className="secondary" onClick={() => { setRenamingId(itemId); setRenameDraft(item.displayName || ""); }}>Rename</button>}
              {itemId && canDelete && <button type="button" className="secondary danger-text" disabled={busy} onClick={() => void onDeleteProfile(item)}>Delete</button>}
            </div>
          </article>;
        })}
      </div>
    </div>
  </div>;
}

function DocumentsView({ profileId, person, documents, onChanged, notify }: { profileId?: string; person: Person; documents: SavedDocument[]; onChanged: () => Promise<void>; notify: Notify }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState("Passport");
  const [uploading, setUploading] = useState(false);
  const profileParam = profileId ? `&profileId=${encodeURIComponent(profileId)}` : "";

  const upload = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("kind", kind);
      if (profileId) form.set("profileId", profileId);
      await api("/api/documents", { method: "POST", body: form });
      if (fileRef.current) fileRef.current.value = "";
      await onChanged();
      notify(`${file.name} saved to ${person.possessive} documents.`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Upload failed.", "error");
    } finally {
      setUploading(false);
    }
  };

  const remove = async (document: SavedDocument) => {
    if (!window.confirm(`Delete ${document.filename}? This cannot be undone.`)) return;
    try {
      await api(`/api/documents?id=${encodeURIComponent(document.id)}${profileParam}`, { method: "DELETE" });
      await onChanged();
      notify("Document deleted.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Delete failed.", "error");
    }
  };

  return <div className="page"><section className="page-intro"><div><p className="eyebrow">Documents</p><h1>{person.possessiveCap} documents</h1><p>Files are private to your signed-in account. Only you can download or delete them.</p></div></section><section className="upload-panel"><div className="upload-mark"><Icon name="upload" /></div><div><h2>Add a document</h2><p>Choose the document type, then pick a PDF, JPEG, or PNG (up to 10 MB). Dates are not read from files, so also enter them in Edit details.</p></div><label><span>Document type</span><select value={kind} onChange={(event) => setKind(event.target.value)}><option>Passport</option><option value="Visa">Visa (in passport)</option><option value="Form I-20">Form I-20</option><option value="I-94">I-94 arrival record</option><option value="EAD">Work permit (EAD card)</option><option value="USCIS notice">USCIS notice (I-797)</option><option value="Green Card">Green Card</option><option>Other</option></select></label><input ref={fileRef} className="visually-hidden" type="file" accept="application/pdf,image/jpeg,image/png" onChange={(event) => void upload(event.target.files?.[0])} /><button className="primary" disabled={uploading} onClick={() => fileRef.current?.click()}><Icon name="upload" /> {uploading ? "Uploading…" : "Choose file"}</button></section>

    <div className="section-heading document-heading"><div><h2>{documents.length ? `${documents.length} saved document${documents.length === 1 ? "" : "s"}` : "Saved documents"}</h2></div></div>
    {documents.length ? <div className="document-list">{documents.map((document) => <article className="document-row" key={document.id}><span className="document-icon"><Icon name="file" /></span><div><span className="tag neutral">{documentKindLabel(document.kind)}</span><h3>{document.filename}</h3><p>{formatBytes(document.sizeBytes)} · Uploaded {formatDateTime(document.uploadedAt)}</p></div><a className="icon-action" href={`/api/documents?download=${encodeURIComponent(document.id)}${profileParam}`} aria-label={`Download ${document.filename}`}><Icon name="download" /></a><button className="icon-action danger" onClick={() => void remove(document)} aria-label={`Delete ${document.filename}`}><Icon name="trash" /></button></article>)}</div> : <EmptyState icon="file" title={`No documents saved for ${person.isSelf ? "you" : person.name} yet`} copy="Pick a document type above, then choose a file. A passport photo page or the latest USCIS notice is a good place to start." />}
    <section className="security-strip"><Icon name="shield" /><div><strong>Use the minimum data needed.</strong><p>Do not upload Social Security cards, payment cards, or unrelated financial records. You can download or permanently delete each file.</p></div></section>
  </div>;
}

function CasesView({ profileId, person, cases, onChanged, notify }: { profileId?: string; person: Person; cases: TrackedCase[]; onChanged: () => Promise<void>; notify: Notify }) {
  const [receiptNumber, setReceiptNumber] = useState("");
  const [formType, setFormType] = useState("");
  const [nickname, setNickname] = useState("");
  const [saving, setSaving] = useState(false);
  const profileParam = profileId ? `&profileId=${encodeURIComponent(profileId)}` : "";

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await api("/api/cases", { method: "POST", body: JSON.stringify({ receiptNumber, formType, nickname, profileId }) });
      setReceiptNumber(""); setFormType(""); setNickname("");
      await onChanged();
      notify(`USCIS receipt saved to ${person.possessive} cases.`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Unable to save case.", "error");
    } finally { setSaving(false); }
  };

  const remove = async (id: string) => {
    try { await api(`/api/cases?id=${encodeURIComponent(id)}${profileParam}`, { method: "DELETE" }); await onChanged(); notify("Case removed."); }
    catch (error) { notify(error instanceof Error ? error.message : "Unable to remove case.", "error"); }
  };

  return <div className="page"><section className="page-intro"><div><p className="eyebrow">Cases</p><h1>{person.possessiveCap} USCIS receipts</h1><p>Save the receipt number from each USCIS notice, then open the official USCIS status page for it in one tap.</p></div></section><form className="case-form" onSubmit={submit}><div><label htmlFor="case-receipt">Receipt number</label><input id="case-receipt" aria-describedby="case-receipt-hint" value={receiptNumber} onChange={(event) => setReceiptNumber(event.target.value.toUpperCase())} placeholder="IOE1234567890" maxLength={15} required /><small id="case-receipt-hint">3 letters + 10 digits, printed as “Receipt Number” near the top of the notice</small></div><div><label htmlFor="case-form-type">Form <em>(optional)</em></label><input id="case-form-type" aria-describedby="case-form-hint" value={formType} onChange={(event) => setFormType(event.target.value)} placeholder="I-765" /><small id="case-form-hint">Shown on the notice, e.g. I-765</small></div><div><label htmlFor="case-nickname">Nickname <em>(optional)</em></label><input id="case-nickname" value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="Work permit renewal" /><small>Only you see this</small></div><button className="primary" disabled={saving}><Icon name="plus" /> {saving ? "Saving…" : "Save receipt"}</button></form>

    <div className="case-list">{cases.map((item) => <article className="case-card" key={item.id}><div className="case-form-badge">{item.formType || <Icon name="case" />}</div><div><span>{item.nickname || (item.formType ? `Form ${item.formType}` : "USCIS filing")}</span><h2>{item.receiptNumber}</h2><p>Saved {formatDateTime(item.createdAt)}</p></div><a className="secondary" href={`https://egov.uscis.gov/casestatus/mycasestatus.do?appReceiptNum=${encodeURIComponent(item.receiptNumber)}`} target="_blank" rel="noreferrer">Open official status <Icon name="external" /></a><button className="icon-action danger" onClick={() => void remove(item.id)} aria-label={`Remove receipt ${item.receiptNumber}`}><Icon name="trash" /></button></article>)}</div>
    {!cases.length && <EmptyState icon="case" title={`No receipts saved for ${person.isSelf ? "you" : person.name} yet`} copy="When USCIS accepts a filing, it mails a receipt notice (Form I-797C). Enter its receipt number above to keep it here." />}
    <section className="info-strip"><Icon name="info" /><div><strong>Status is checked on the USCIS website</strong><p>Immigrant OS doesn’t fetch case status automatically. Use “Open official status” to see the latest update.</p></div></section>
  </div>;
}

function AssistantView({ profileId, person, plan }: { profileId?: string; person: Person; plan: PlanResult | null }) {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [asking, setAsking] = useState(false);
  const suggestions = ["What should I do next?", "When does my status expire?", "What information is missing?", "What dates have I saved?"];

  const ask = async (value?: string) => {
    const text = (value ?? question).trim();
    if (!text || asking) return;
    setMessages((current) => [...current, { role: "user", text }]);
    setQuestion(""); setAsking(true);
    try {
      const response = await api<{ answer: string; sources: Source[]; limitations: string }>("/api/assistant", { method: "POST", body: JSON.stringify({ question: text, profileId }) });
      setMessages((current) => [...current, { role: "assistant", text: response.answer, sources: response.sources, limitations: response.limitations }]);
    } catch (error) {
      setMessages((current) => [...current, { role: "assistant", text: error instanceof Error ? error.message : "Unable to answer." }]);
    } finally { setAsking(false); }
  };

  return <div className="page assistant-page"><section className="assistant-intro"><span className="assistant-mark"><Icon name="spark" /></span><p className="eyebrow">Assistant</p><h1>Ask about {person.possessive} action plan</h1><p>Quick answers use {person.possessive} saved dates and checklist. This is a simple guide, not an AI chat or a legal eligibility assessment.</p>{plan?.stageLabel && <div className="assistant-status"><span className="coverage-dot" /><b>{plan.stageLabel}</b><em>Beta</em></div>}</section><section className="chat-card"><div className="chat-log" aria-live="polite">{!messages.length ? <div className="suggestion-grid">{suggestions.map((suggestion) => <button onClick={() => void ask(suggestion)} key={suggestion}>{suggestion}<Icon name="arrow" /></button>)}</div> : messages.map((message, index) => <div className={`message ${message.role}`} key={`${message.role}-${index}`}><span>{message.role === "assistant" ? <Icon name="spark" /> : "You"}</span><div><p>{message.text}</p>{message.sources?.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.label} <Icon name="external" /></a>)}{message.limitations && <small>{message.limitations}</small>}</div></div>)}</div><form className="composer" onSubmit={(event) => { event.preventDefault(); void ask(); }}><input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask about dates, next steps, or missing information…" aria-label="Ask ImmigrantOS" /><button disabled={asking || !question.trim()} aria-label="Send question">{asking ? <span className="spinner" /> : <Icon name="send" />}</button></form></section><AgentConnect /></div>;
}

function Onboarding({ mode = "initial", onCancel, onSaved }: { mode?: "initial" | "add"; onCancel?: () => void; onSaved: (createdProfileId?: string) => void }) {
  const [draft, setDraft] = useState<ImmigrationProfile>({ ...EMPTY_PROFILE });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError("");
    try {
      const response = await api<{ profile?: ImmigrationProfile }>("/api/profile", {
        method: mode === "add" ? "POST" : "PUT",
        body: JSON.stringify(draft),
      });
      onSaved(response.profile?.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save profile.");
      setSaving(false);
    }
  };

  return <main className="onboarding-shell"><header><Brand /><span>Private beta · General information only</span>{onCancel && <button type="button" className="secondary" onClick={onCancel}>Cancel</button>}</header><div className="onboarding-grid"><section className="onboarding-copy"><p className="eyebrow">Your dates, in one place</p><h1>{mode === "add" ? "Add a family profile." : "Know what matters next."}</h1><p>Start with the dates you know. Save a personal checklist, track your receipts, and export dates to your calendar. Document upload is optional; you can add more details later.</p><div className="trust-list"><div><Icon name="plan" /><span><strong>Your saved dates</strong><small>Review the inputs and official guidance.</small></span></div><div><Icon name="shield" /><span><strong>A simple checklist</strong><small>Mark tasks done and pick up where you left off.</small></span></div><div><Icon name="spark" /><span><strong>Start small</strong><small>Choose your current stage; add details later.</small></span></div></div></section><form className="onboarding-card" onSubmit={save}><div className="step-label"><span>1</span><div><small>Step 1</small><strong>{mode === "add" ? "Where is this family member now?" : "Where are you now?"}</strong></div></div><div className="stage-grid">{STAGES.map((stage) => <button type="button" className={draft.lifecycleStage === stage.id ? "selected" : ""} onClick={() => stage.id !== draft.lifecycleStage && setDraft({ ...draft, lifecycleStage: stage.id, statusSubtype: stageDefaults(stage.id, draft.displayName).statusSubtype, admissionBasis: stageDefaults(stage.id, draft.displayName).admissionBasis })} key={stage.id}><span><b>{stage.label}</b><small>{stage.short}</small></span></button>)}</div><div className="step-label second"><span>2</span><div><small>Step 2</small><strong>Add the dates you know</strong><em className="step-hint">All optional. You can add the rest later.</em></div></div><ProfileFields draft={draft} setDraft={setDraft} nameLabel={mode === "add" ? "Their name" : "Your name"} namePlaceholder={mode === "add" ? "e.g. Mia, or “my spouse”" : "Name or nickname (optional)"} compact />{error && <p className="form-error">{error}</p>}<button className="primary wide" disabled={saving}>{saving ? "Building your plan…" : mode === "add" ? "Add family member" : "Create my action plan"} <Icon name="arrow" /></button><p className="form-disclaimer">Your entries are saved to your signed-in account. Start without uploading documents. This checklist is not legal advice or an eligibility decision.</p></form></div></main>;
}

function ProfileDialog({ profile, canDelete, onDelete, onClose, onSaved }: { profile: ImmigrationProfile; canDelete?: boolean; onDelete?: () => Promise<void>; onClose: () => void; onSaved: () => Promise<void> }) {
  const [draft, setDraft] = useState<ImmigrationProfile>({ ...profile });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const save = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError("");
    try { await api("/api/profile", { method: "PUT", body: JSON.stringify({ ...draft, profileId: profile.id }) }); await onSaved(); }
    catch (err) { setError(err instanceof Error ? err.message : "Unable to save profile."); setSaving(false); }
  };
  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><form className="profile-dialog" onSubmit={save} role="dialog" aria-modal="true" aria-labelledby="profile-title"><div className="dialog-head"><div><p className="eyebrow">Edit details</p><h2 id="profile-title">{profile.displayName.trim() ? `${profile.displayName.trim()}’s details` : profile.isPrimary ? "Your details" : "Profile details"}</h2><p className="dialog-sub">Change the stage or dates. The action plan updates when you save.</p></div><button type="button" className="icon-action" onClick={onClose} aria-label="Close"><Icon name="close" /></button></div><div className="stage-tabs">{STAGES.map((stage) => <button type="button" className={draft.lifecycleStage === stage.id ? "active" : ""} onClick={() => stage.id !== draft.lifecycleStage && setDraft({ ...draft, lifecycleStage: stage.id, statusSubtype: stageDefaults(stage.id, draft.displayName).statusSubtype, admissionBasis: stageDefaults(stage.id, draft.displayName).admissionBasis })} key={stage.id} aria-pressed={draft.lifecycleStage === stage.id}>{stage.label}<small>{stage.short}</small></button>)}</div><ProfileFields draft={draft} setDraft={setDraft} nameLabel={profile.isPrimary ? "Your name" : "Name"} />{error && <p className="form-error">{error}</p>}<div className="dialog-actions">{canDelete && onDelete && <button type="button" className="secondary danger-text" onClick={() => void onDelete()} disabled={saving}>Delete profile</button>}<button type="button" className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={saving}>{saving ? "Saving…" : "Save and update plan"}</button></div></form></div>;
}

// Where-to-find hints describe where a date is printed. They are not advice about what the date means.
const HINTS = {
  name: "Only used to label this profile.",
  f1Stage: "Student while in classes; OPT or STEM OPT once working on a work permit (EAD).",
  admission: "Look up your I-94 at i94.cbp.dhs.gov. “D/S” in the Admit Until field means duration of status.",
  programEnd: "“Program End Date” on page 1 of your Form I-20.",
  i94: "“Admit Until Date” on your most recent I-94 record (i94.cbp.dhs.gov).",
  ead: "“Card Expires” on the front of your work permit (EAD card).",
  visa: "“Expiration Date” on the visa in your passport.",
  h1bStatus: "H-1B if you hold the job; H-4 if you are the spouse or child of an H-1B worker.",
  gcStep: "The most recent step filed in your green card case.",
  priority: "“Priority Date” on your I-140 receipt or approval notice (Form I-797).",
  residentSince: "“Resident Since” on the front of your Green Card.",
  gcExpires: "“Card Expires” on the front of your Green Card.",
  passport: "“Date of expiration” on your passport’s photo page.",
};

function ProfileFields({ draft, setDraft, nameLabel, namePlaceholder = "Name or nickname (optional)", compact = false }: { draft: ImmigrationProfile; setDraft: (profile: ImmigrationProfile) => void; nameLabel: string; namePlaceholder?: string; compact?: boolean }) {
  const field = (key: keyof ImmigrationProfile, value: string | null) => setDraft({ ...draft, [key]: value });
  const statusSelect = (label: string, hint: string) => <SelectField label={label} hint={hint} value={draft.statusSubtype} onChange={(value) => field("statusSubtype", value)} options={(STATUS_OPTIONS[draft.lifecycleStage] ?? []).map((code): [string, string] => [code, statusLabel(code)])} />;
  return <div className={`profile-fields ${compact ? "compact" : ""}`}>
    <TextField className="span-2" label={nameLabel} hint={HINTS.name} value={draft.displayName} placeholder={namePlaceholder} onChange={(value) => field("displayName", value)} />
    {draft.lifecycleStage === "F1" && <>{statusSelect("Current F-1 stage", HINTS.f1Stage)}<SelectField label="What your I-94 shows" hint={HINTS.admission} value={draft.admissionBasis} onChange={(value) => field("admissionBasis", value)} options={[["DS_TRANSITION", "“D/S” (no end date)"], ["FIXED_DATE", "A specific end date"]]} /><DateField label="I-20 program end date" hint={HINTS.programEnd} value={draft.programEndDate} onChange={(value) => field("programEndDate", value)} />{draft.admissionBasis === "FIXED_DATE" && <DateField label="I-94 admit-until date" hint={HINTS.i94} value={draft.i94ExpirationDate} onChange={(value) => field("i94ExpirationDate", value)} />}{draft.statusSubtype !== "STUDENT" && <DateField label="Work permit (EAD) expires" hint={HINTS.ead} value={draft.eadEndDate} onChange={(value) => field("eadEndDate", value)} />}</>}
    {draft.lifecycleStage === "H1B" && <>{statusSelect("Status", HINTS.h1bStatus)}<DateField label="I-94 admit-until date" hint={HINTS.i94} value={draft.i94ExpirationDate} onChange={(value) => field("i94ExpirationDate", value)} /><DateField label="Visa expires" hint={HINTS.visa} value={draft.visaExpirationDate} onChange={(value) => field("visaExpirationDate", value)} /></>}
    {draft.lifecycleStage === "VISITOR" && <><DateField label="I-94 admit-until date" hint={HINTS.i94} value={draft.i94ExpirationDate} onChange={(value) => field("i94ExpirationDate", value)} /><DateField label="Visa expires" hint={HINTS.visa} value={draft.visaExpirationDate} onChange={(value) => field("visaExpirationDate", value)} /></>}
    {draft.lifecycleStage === "GREEN_CARD" && <>{statusSelect("Current step", HINTS.gcStep)}<DateField label="Priority date" hint={HINTS.priority} value={draft.priorityDate} onChange={(value) => field("priorityDate", value)} /></>}
    {(draft.lifecycleStage === "LPR" || draft.lifecycleStage === "CITIZENSHIP") && <><DateField label="Resident since" hint={HINTS.residentSince} value={draft.greenCardSince} onChange={(value) => field("greenCardSince", value)} />{draft.lifecycleStage === "LPR" && <DateField label="Green Card expires" hint={HINTS.gcExpires} value={draft.greenCardExpirationDate} onChange={(value) => field("greenCardExpirationDate", value)} />}<label className="field"><span>Naturalization rule to review</span><select aria-describedby="naturalization-basis-hint" value={draft.naturalizationBasis} onChange={(event) => field("naturalizationBasis", event.target.value)}><option value="five_year">General 5-year rule</option><option value="three_year">3-year rule for spouses of U.S. citizens</option></select><small id="naturalization-basis-hint">Conditions apply; this selection does not determine eligibility. Review <a href="https://www.uscis.gov/n-400" target="_blank" rel="noreferrer">USCIS Form N-400 requirements</a>.</small></label></>}
    {draft.lifecycleStage !== "F1" && draft.lifecycleStage !== "VISITOR" && <DateField label="Work permit (EAD) expires, if you have one" hint={HINTS.ead} value={draft.eadEndDate} onChange={(value) => field("eadEndDate", value)} />}
    <DateField label="Passport expires" hint={HINTS.passport} value={draft.passportExpirationDate} onChange={(value) => field("passportExpirationDate", value)} />
  </div>;
}

function TextField({ label, hint, value, placeholder, onChange, className }: { label: string; hint: string; value: string; placeholder?: string; onChange: (value: string) => void; className?: string }) {
  const id = useId();
  return <label className={`field ${className ?? ""}`}><span>{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} aria-describedby={`${id}-hint`} /><small id={`${id}-hint`}>{hint}</small></label>;
}

function SelectField({ label, hint, value, options, onChange }: { label: string; hint: string; value: string; options: [string, string][]; onChange: (value: string) => void }) {
  const id = useId();
  return <label className="field"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} aria-describedby={`${id}-hint`}>{options.map(([code, text]) => <option key={code} value={code}>{text}</option>)}</select><small id={`${id}-hint`}>{hint}</small></label>;
}

function DateField({ label, hint, value, onChange, required = false }: { label: string; hint: string; value: string | null; onChange: (value: string | null) => void; required?: boolean }) {
  const id = useId();
  return <label className="field"><span>{label}</span><input type="date" value={value ?? ""} onInput={(event) => onChange(event.currentTarget.value || null)} required={required} aria-describedby={`${id}-hint`} /><small id={`${id}-hint`}>{hint}</small></label>;
}

function EmptyState({ icon, title, copy }: { icon: string; title: string; copy: string }) { return <div className="empty-state"><span><Icon name={icon} /></span><h2>{title}</h2><p>{copy}</p></div>; }
function LoadingScreen() { return <main className="center-screen"><Brand /><span className="large-spinner" /><p>Loading your immigration workspace…</p></main>; }
function ErrorScreen({ message, onRetry }: { message: string; onRetry: () => void }) { return <main className="center-screen error-screen"><span className="error-mark"><Icon name="alert" /></span><h1>Workspace unavailable</h1><p>{message}</p><button className="primary" onClick={onRetry}>Try again</button><a href="/auth/login">Sign in</a></main>; }
function Brand({ mobile = false }: { mobile?: boolean }) { return <div className={mobile ? "brand mobile-brand" : "brand"}><span className="brand-mark">I</span><span>Immigrant<b>OS</b></span></div>; }

function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    plan: <><path d="M5 4h14v16H5z" /><path d="M8 9h8M8 13h5M8 17h7" /></>, file: <><path d="M6 2h8l4 4v16H6z" /><path d="M14 2v5h5" /></>, case: <><path d="M5 7h14v13H5zM9 7V4h6v3" /><path d="M5 12h14" /></>, spark: <><path d="m12 3 1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5z" /><path d="m19 16 .7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7z" /></>, shield: <><path d="M12 2 4 5v6c0 5 3.5 8.5 8 11 4.5-2.5 8-6 8-11V5z" /><path d="m9 12 2 2 4-5" /></>, chevron: <path d="m9 18 6-6-6-6" />, edit: <><path d="m4 20 4-.8L19 8.2 15.8 5 4.8 16z" /><path d="m14 6.8 3.2 3.2" /></>, print: <><path d="M7 9V3h10v6M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2" /><path d="M7 14h10v7H7z" /></>, alert: <><path d="m12 3 10 18H2z" /><path d="M12 9v5M12 18h.01" /></>, arrow: <path d="m9 18 6-6-6-6" />, external: <><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 13v7H4V6h7" /></>, check: <path d="m5 12 4 4L19 6" />, upload: <><path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 15v5h16v-5" /></>, download: <><path d="M12 4v12M7 11l5 5 5-5" /><path d="M4 20h16" /></>, trash: <><path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14" /><path d="M10 11v6M14 11v6" /></>, plus: <path d="M12 5v14M5 12h14" />, info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7h.01" /></>, send: <><path d="m3 3 18 9-18 9 4-9z" /><path d="M7 12h14" /></>, close: <path d="m6 6 12 12M18 6 6 18" />, chevronDown: <path d="m6 9 6 6 6-6" />, users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5" /><path d="M15.5 4.8a3.3 3.3 0 0 1 0 6.4M18 14.8c2 .7 3.2 2.4 3.5 5.2" /></>, gear: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>, logout: <><path d="M10 4H5v16h5" /><path d="M14 8l4 4-4 4M18 12H9" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); this.name = "ApiError"; }
}

async function api<T = { ok: boolean }>(url: string, options?: RequestInit): Promise<T> {
  const headers = new Headers(options?.headers);
  if (options?.body && !(options.body instanceof FormData)) headers.set("content-type", "application/json");
  const response = await fetch(url, { ...options, headers, cache: "no-store" });
  const payload = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new ApiError(payload.error || `Request failed (${response.status}).`, response.status);
  return payload;
}

function stageDefaults(stage: LifecycleStage, displayName: string): ImmigrationProfile {
  return {
    ...EMPTY_PROFILE,
    displayName,
    lifecycleStage: stage,
    statusSubtype: stage === "H1B" ? "H1B" : stage === "GREEN_CARD" ? "PERM" : stage === "VISITOR" ? "B1_B2" : stage === "F1" ? "STUDENT" : "",
    admissionBasis: stage === "F1" ? "DS_TRANSITION" : stage === "VISITOR" ? "FIXED_DATE" : "",
  };
}
function greeting() { const hour = new Date().getHours(); return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"; }
function firstName(name: string) { return name.trim().split(/\s+/)[0] || "there"; }
type Person = { name: string; possessive: string; possessiveCap: string; isSelf: boolean; named: boolean };
// Who is on screen, for headings: "Mia’s documents", "Viewing Mia’s plan", or "Your documents"
// for an unnamed primary profile.
function personFor(item: ImmigrationProfile, idx: number): Person {
  const named = item.displayName.trim();
  const isSelf = !!item.isPrimary;
  if (named) return { name: named, possessive: `${named}’s`, possessiveCap: `${named}’s`, isSelf, named: true };
  if (isSelf) return { name: "your primary profile", possessive: "your", possessiveCap: "Your", isSelf, named: false };
  const label = profileLabel(item, idx);
  return { name: label, possessive: `${label}’s`, possessiveCap: `${label}’s`, isSelf, named: false };
}
function profileLabel(item: ImmigrationProfile, idx: number) { return item.displayName.trim() || (item.isPrimary ? "Primary profile" : `Profile ${idx + 1}`); }
function initials(name: string) { return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "IO"; }
function month(value: string) { return new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`)).toUpperCase(); }
function day(value: string) { return new Date(`${value}T12:00:00Z`).getUTCDate(); }
function year(value: string) { return new Date(`${value}T12:00:00Z`).getUTCFullYear(); }
type Timing = { label: string; tone: "past" | "soon" | "upcoming" | "later" | "ongoing" | "done" };
function timing(item: Pick<PlanItem, "dueDate" | "completed">): Timing {
  if (item.completed) return { label: "Done", tone: "done" };
  if (!item.dueDate) return { label: "Ongoing", tone: "ongoing" };
  const days = Math.round((Date.parse(`${item.dueDate}T12:00:00Z`) - Date.parse(`${localToday()}T12:00:00Z`)) / 86_400_000);
  if (days === 0) return { label: "Today", tone: "soon" };
  if (days === 1) return { label: "Tomorrow", tone: "soon" };
  if (days < 0) return { label: `Passed ${distance(-days)} ago · check this`, tone: "past" };
  return { label: `In ${distance(days)}`, tone: days <= 30 ? "soon" : days <= 90 ? "upcoming" : "later" };
}
function distance(days: number) {
  if (days < 60) return `${days} day${days === 1 ? "" : "s"}`;
  if (days < 730) return `${Math.round(days / 30.44)} months`;
  return `${Math.round(days / 365.25)} years`;
}
const DOCUMENT_KINDS: Record<string, string> = { Visa: "Visa (in passport)", "I-94": "I-94 arrival record", EAD: "Work permit (EAD card)", "USCIS notice": "USCIS notice (I-797)" };
function documentKindLabel(kind: string) { return DOCUMENT_KINDS[kind] ?? kind; }
function formatBytes(bytes: number) { return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`; }
function formatDateTime(value: string) { const date = new Date(value.endsWith("Z") ? value : `${value.replace(" ", "T")}Z`); return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date); }

function localToday() { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`; }
