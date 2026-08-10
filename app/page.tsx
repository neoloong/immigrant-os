"use client";

import { useState } from "react";

type View = "home" | "documents" | "timeline" | "assistant";

const Icon = ({ name, size = 20 }: { name: string; size?: number }) => {
  const paths: Record<string, React.ReactNode> = {
    home: <><path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10M9 20v-6h6v6"/></>,
    file: <><path d="M6 2h8l4 4v16H6z"/><path d="M14 2v5h5M9 13h6M9 17h6"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    chat: <><path d="M4 4h16v12H8l-4 4z"/><path d="M8 9h8M8 13h5"/></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 8h18c0-1-3-1-3-8M10 20h4"/></>,
    upload: <><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 15v5h16v-5"/></>,
    arrow: <path d="m9 18 6-6-6-6"/>,
    check: <path d="m5 12 4 4L19 6"/>,
    external: <><path d="M14 4h6v6M20 4l-9 9"/><path d="M18 13v7H4V6h7"/></>,
    user: <><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
    shield: <><path d="M12 2 4 5v6c0 5 3.5 8.5 8 11 4.5-2.5 8-6 8-11V5z"/><path d="m9 12 2 2 4-5"/></>,
    send: <path d="m3 3 18 9-18 9 4-9zM7 12h14"/>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
};

const nav = [
  { id: "home" as View, label: "Home", icon: "home" },
  { id: "documents" as View, label: "Documents", icon: "file" },
  { id: "timeline" as View, label: "Timeline", icon: "clock" },
  { id: "assistant" as View, label: "Assistant", icon: "chat" },
];

const documents = [
  { name: "Passport", meta: "Expires Aug 14, 2029", status: "Verified", tone: "blue" },
  { name: "F-1 Visa", meta: "Expires Jun 03, 2027", status: "Verified", tone: "lavender" },
  { name: "Form I-20", meta: "Program ends May 22, 2027", status: "Verified", tone: "gold" },
  { name: "I-94", meta: "Admit until D/S", status: "Review", tone: "mint" },
];

const events = [
  { month: "NOV", day: "23", title: "OPT planning window", copy: "Meet with your DSO and confirm your program end date.", tag: "105 days", kind: "info" },
  { month: "FEB", day: "21", title: "Earliest OPT filing date", copy: "USCIS can receive your I-765 up to 90 days before program completion.", tag: "Priority", kind: "urgent" },
  { month: "MAY", day: "22", title: "Program end date", copy: "Based on your confirmed Form I-20.", tag: "Confirmed", kind: "ok" },
];

export default function Home() {
  const [view, setView] = useState<View>("home");
  const [notice, setNotice] = useState("");
  const [question, setQuestion] = useState("");
  const [chat, setChat] = useState(false);

  const choose = (next: View) => { setView(next); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const upload = () => { setNotice("Demo upload complete — Passport data is ready for review."); setTimeout(() => setNotice(""), 4200); };
  const ask = () => { if (!question.trim()) return; setChat(true); setQuestion(""); };

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => choose("home")} aria-label="Immigrant OS home"><span className="brand-mark">I</span><span>Immigrant<span className="brand-os">OS</span></span></button>
        <nav className="side-nav" aria-label="Main navigation">
          {nav.map((item) => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => choose(item.id)}><Icon name={item.icon}/><span>{item.label}</span></button>)}
        </nav>
        <div className="privacy"><Icon name="shield"/><div><strong>Your data is private</strong><span>Encrypted and never sold.</span></div></div>
        <button className="profile"><span className="avatar">CW</span><span><strong>Chao Wang</strong><small>F-1 Student</small></span><Icon name="arrow" size={17}/></button>
      </aside>

      <section className="content">
        <header className="topbar">
          <button className="mobile-brand" onClick={() => choose("home")}><span className="brand-mark">I</span><b>Immigrant<span className="brand-os">OS</span></b></button>
          <div className="top-actions"><button className="icon-button" aria-label="Notifications"><Icon name="bell"/></button><span className="top-avatar">CW</span></div>
        </header>

        {view === "home" && <Dashboard onView={choose} onUpload={upload}/>} 
        {view === "documents" && <Documents onUpload={upload}/>} 
        {view === "timeline" && <Timeline/>} 
        {view === "assistant" && <Assistant question={question} setQuestion={setQuestion} ask={ask} chat={chat}/>} 
      </section>

      <nav className="bottom-nav" aria-label="Mobile navigation">{nav.map((item) => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => choose(item.id)}><Icon name={item.icon}/><span>{item.label}</span></button>)}</nav>
      {notice && <div className="toast"><span className="toast-check"><Icon name="check" size={16}/></span>{notice}</div>}
    </main>
  );
}

function Dashboard({ onView, onUpload }: { onView: (v: View) => void; onUpload: () => void }) {
  return <div className="page dashboard">
    <section className="welcome"><div><p className="eyebrow">MONDAY, AUGUST 10</p><h1>Good afternoon, Chao.</h1><p>Here’s what’s happening with your immigration journey.</p></div><div className="status-ring"><span>Profile</span><strong>72%</strong><small>complete</small></div></section>

    <section className="alert-card">
      <div className="alert-icon"><Icon name="clock"/></div><div className="alert-copy"><span className="pill urgent">ACTION NEEDED</span><h2>Confirm your I-94 record</h2><p>Your latest I-94 hasn’t been reviewed. This record controls your authorized stay—not the visa stamp.</p><button onClick={() => onView("documents")}>Review now <Icon name="arrow" size={16}/></button></div><span className="days"><b>3</b> days</span>
    </section>

    <div className="section-head"><div><p className="eyebrow">YOUR STATUS</p><h2>F-1 Student</h2></div><button className="text-button" onClick={() => onView("documents")}>View full profile <Icon name="arrow" size={15}/></button></div>
    <section className="status-grid">
      <article className="status-card"><span className="card-icon blue"><Icon name="user"/></span><div><label>Current status</label><strong>F-1</strong><p>Duration of Status (D/S)</p></div><span className="verified"><Icon name="check" size={13}/> Verified</span></article>
      <article className="status-card"><span className="card-icon amber"><Icon name="clock"/></span><div><label>Program end date</label><strong>May 22, 2027</strong><p>University of California</p></div><span className="source">From I-20</span></article>
      <article className="status-card"><span className="card-icon green"><Icon name="file"/></span><div><label>Work authorization</label><strong>Not active</strong><p>OPT planning begins soon</p></div><span className="neutral">Upcoming</span></article>
    </section>

    <div className="two-col">
      <section><div className="section-head compact"><div><p className="eyebrow">UP NEXT</p><h2>Your timeline</h2></div><button className="text-button" onClick={() => onView("timeline")}>See all <Icon name="arrow" size={15}/></button></div><div className="timeline-preview">{events.slice(0,2).map((e,i) => <div className="event-row" key={e.title}><div className="date-tile"><span>{e.month}</span><b>{e.day}</b></div><div className="line-wrap"><span className={`dot ${i ? "orange" : ""}`}></span>{!i && <span className="line"/>}</div><div><h3>{e.title}</h3><p>{e.copy}</p><span className={`event-tag ${e.kind}`}>{e.tag}</span></div></div>)}</div></section>
      <section><div className="section-head compact"><div><p className="eyebrow">DOCUMENTS</p><h2>Your vault</h2></div><button className="text-button" onClick={() => onView("documents")}>View all <Icon name="arrow" size={15}/></button></div><div className="vault-card"><div className="vault-list">{documents.slice(0,3).map(d => <div className="doc-row" key={d.name}><span className={`doc-tile ${d.tone}`}><Icon name="file"/></span><div><strong>{d.name}</strong><small>{d.meta}</small></div><span className="verified"><Icon name="check" size={13}/> {d.status}</span></div>)}</div><button className="upload-button" onClick={onUpload}><Icon name="upload"/> Upload a document</button></div></section>
    </div>

    <section className="ask-card"><div className="spark">✦</div><div><h2>Ask ImmigrantOS</h2><p>Get answers grounded in your documents and official sources.</p></div><button onClick={() => onView("assistant")}>Ask a question <Icon name="arrow" size={17}/></button></section>
    <p className="disclaimer">ImmigrantOS provides general information, not legal advice. For legal guidance, consult a qualified immigration attorney.</p>
  </div>;
}

function Documents({ onUpload }: { onUpload: () => void }) {
  return <div className="page"><div className="page-title"><p className="eyebrow">SECURE DOCUMENT VAULT</p><h1>Your documents</h1><p>Every important date, identifier, and source in one private place.</p></div><button className="primary top-cta" onClick={onUpload}><Icon name="upload"/> Upload document</button><div className="document-grid">{documents.map((d, i) => <article className="document-card" key={d.name}><div className={`large-doc ${d.tone}`}><Icon name="file" size={28}/></div><span className={d.status === "Review" ? "review-badge" : "verified"}><Icon name={d.status === "Review" ? "clock" : "check"} size={13}/>{d.status}</span><h2>{d.name}</h2><p>{d.meta}</p><div className="fields"><span>Source</span><b>{i === 3 ? "CBP record" : "Uploaded PDF"}</b></div><button className="card-action">Open details <Icon name="arrow" size={15}/></button></article>)}</div><section className="dropzone" onClick={onUpload}><Icon name="upload" size={26}/><h2>Drop a PDF or image here</h2><p>We’ll extract fields and ask you to confirm them before saving.</p><button>Choose file</button></section></div>;
}

function Timeline() {
  return <div className="page"><div className="page-title"><p className="eyebrow">PERSONALIZED ROADMAP</p><h1>Your immigration timeline</h1><p>Calculated from your confirmed documents. Dates show their source.</p></div><div className="timeline-page">{events.map((e, i) => <article className="timeline-card" key={e.title}><div className="date-tile large"><span>{e.month}</span><b>{e.day}</b><small>{i === 0 ? "2026" : "2027"}</small></div><div className="timeline-card-copy"><span className={`event-tag ${e.kind}`}>{e.tag}</span><h2>{e.title}</h2><p>{e.copy}</p><div className="source-line"><Icon name="file" size={15}/> Source: Confirmed Form I-20 · Checked Aug 10, 2026</div></div><button className="icon-button"><Icon name="arrow"/></button></article>)}</div><div className="info-note"><Icon name="shield"/><p><strong>Dates are estimates until verified.</strong> Confirm filing windows with your DSO. We’ll notify you if official rules or your documents change.</p></div></div>;
}

function Assistant({ question, setQuestion, ask, chat }: { question: string; setQuestion: (s:string)=>void; ask:()=>void; chat:boolean }) {
  return <div className="page assistant-page"><div className="assistant-hero"><div className="spark big">✦</div><p className="eyebrow">YOUR PERSONAL ASSISTANT</p><h1>What can I help with?</h1><p>I use your confirmed profile and current official sources.</p></div><div className="chat-panel">{!chat ? <div className="suggestions"><button onClick={() => setQuestion("When can I apply for OPT?")}>When can I apply for OPT?</button><button onClick={() => setQuestion("Can I travel while my OPT is pending?")}>Can I travel while OPT is pending?</button><button onClick={() => setQuestion("What documents am I missing?")}>What documents am I missing?</button></div> : <div className="answer"><div className="answer-mark">✦</div><div><p>Based on the program end date on your confirmed I-20 (<b>May 22, 2027</b>), your estimated earliest OPT filing date is <b>February 21, 2027</b>.</p><p>Before filing, ask your DSO to recommend OPT in SEVIS and issue an updated I-20. USCIS must receive Form I-765 within 30 days of that recommendation.</p><a href="https://www.uscis.gov/working-in-the-united-states/students-and-exchange-visitors/optional-practical-training-opt-for-f-1-students" target="_blank" rel="noreferrer">USCIS: Optional Practical Training <Icon name="external" size={14}/></a><small>This is general information, not legal advice.</small></div></div>}<div className="composer"><input value={question} onChange={e => setQuestion(e.target.value)} onKeyDown={e => e.key === "Enter" && ask()} placeholder="Ask about your status, documents, or next steps…" aria-label="Ask ImmigrantOS"/><button onClick={ask} aria-label="Send question"><Icon name="send"/></button></div></div></div>;
}
