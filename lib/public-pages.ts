// Standalone public pages (landing at `/` for visitors without a valid
// session, and `/privacy`). They contain no user data, load no app bundles,
// third-party assets, scripts or images, so they can be exposed through an
// Access bypass without exposing anything else.

// The owner confirms or replaces this address before launch.
export const ACCESS_REQUEST_EMAIL = "neoloong@gmail.com";
const ACCESS_REQUEST_HREF = `mailto:${ACCESS_REQUEST_EMAIL}?subject=${encodeURIComponent("Immigrant OS access request")}`;
const DELETION_REQUEST_HREF = `mailto:${ACCESS_REQUEST_EMAIL}?subject=${encodeURIComponent("Immigrant OS data deletion request")}`;
// Existing login flow: /auth/login -> /auth/access (Access-protected) -> session -> /.
const SIGN_IN_HREF = "/auth/login";

export const PUBLIC_PAGE_HEADERS: Record<string, string> = {
  "content-type": "text/html; charset=utf-8",
  // `/` varies by sign-in state; never let a shared cache store either variant.
  "cache-control": "private, no-store",
  "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
};

export const LOGIN_PAGE_HEADERS: Record<string, string> = {
  ...PUBLIC_PAGE_HEADERS,
  "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
};

export function publicPageResponse(request: Request, html: string): Response {
  if (!["GET", "HEAD"].includes(request.method)) return new Response(null, { status: 405, headers: { allow: "GET, HEAD" } });
  return new Response(request.method === "HEAD" ? null : html, { headers: PUBLIC_PAGE_HEADERS });
}

export function loginPageResponse(request: Request, html: string, status = 200, extraHeaders?: Record<string, string>): Response {
  return new Response(request.method === "HEAD" ? null : html, {
    status,
    headers: { ...LOGIN_PAGE_HEADERS, ...extraHeaders },
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const STYLE = `
:root{--ink:#17231f;--muted:#5d6b65;--line:#e2e7e2;--paper:#f8f9f6;--green:#174f3e;--green-2:#2f725c;--green-soft:#e8f1ec;--cream:#f5f0e6;--orange:#b8552d}
*{box-sizing:border-box}html{background:var(--paper)}body{margin:0;background:var(--paper);color:var(--ink);font:17px/1.6 Inter,system-ui,-apple-system,"Segoe UI",Arial,sans-serif}
a{color:var(--green)}a:focus-visible{outline:3px solid var(--green-2);outline-offset:3px;border-radius:6px}
.wrap{max-width:1040px;margin:0 auto;padding:0 24px}
header{border-bottom:1px solid var(--line);background:rgba(248,249,246,.92)}
header .wrap{display:flex;align-items:center;justify-content:space-between;height:68px}
.brand{display:flex;align-items:center;gap:10px;font-size:18px;font-weight:650;letter-spacing:-.4px;text-decoration:none;color:var(--ink)}
.brand-mark{display:grid;place-items:center;width:31px;height:31px;background:var(--green);color:#fff;border-radius:9px;font-family:Georgia,serif;font-size:18px;font-style:italic}
.signin{font-size:15px;font-weight:600;text-decoration:none;padding:8px 16px;border:1px solid #cbd7cd;border-radius:10px;background:#fff}
.hero{padding:72px 0 48px}.eyebrow{font-size:12px;letter-spacing:1.6px;text-transform:uppercase;color:var(--green-2);font-weight:750;margin:0 0 14px}
h1{font-size:clamp(2.1rem,5vw,3.3rem);line-height:1.1;letter-spacing:-1.2px;margin:0 0 20px;max-width:780px}
.lead{font-size:1.18rem;color:var(--muted);max-width:680px;margin:0 0 30px}
.actions{display:flex;flex-wrap:wrap;gap:12px;align-items:center}
.primary{display:inline-block;background:var(--green);color:#fff;text-decoration:none;font-weight:650;padding:13px 22px;border-radius:11px}
.secondary{display:inline-block;color:var(--green);text-decoration:none;font-weight:650;padding:13px 18px;border-radius:11px;border:1px solid #cbd7cd;background:#fff}
section{padding:36px 0}h2{font-size:1.6rem;letter-spacing:-.5px;margin:0 0 18px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;padding:0;margin:0;list-style:none}
.card{background:#fff;border:1px solid var(--line);border-radius:14px;padding:22px;box-shadow:0 18px 55px rgba(26,43,35,.05)}
.card h3{margin:0 0 8px;font-size:1.05rem}.card p{margin:0;color:var(--muted);font-size:.97rem}
.tag{display:inline-block;font-size:11px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--green-2);background:var(--green-soft);border-radius:999px;padding:2px 9px;margin-left:6px;vertical-align:2px}
.boundaries{background:var(--cream);border:1px solid #e6dcc8;border-radius:16px;padding:26px 28px}
.boundaries ul{margin:0;padding-left:20px}.boundaries li{margin:.45em 0}
.prose{max-width:760px;padding:56px 0}.prose h1{font-size:2.4rem}.prose h2{font-size:1.25rem;margin-top:2rem}.prose li{margin:.4em 0}
.login-shell{max-width:540px;margin:0 auto;padding:56px 0 24px}.login-shell h1{font-size:clamp(1.85rem,4vw,2.35rem);margin:0 0 12px}.login-shell .lead{font-size:1.02rem;margin:0 0 22px}
.login-card{background:#fff;border:1px solid var(--line);border-radius:16px;padding:28px;box-shadow:0 18px 55px rgba(26,43,35,.06);margin-bottom:24px}
.field{margin-bottom:16px}.field label{display:block;font-size:.92rem;font-weight:650;margin-bottom:6px;color:var(--ink)}
.field input{width:100%;font:inherit;font-size:16px;padding:12px 14px;border:1px solid #cbd7cd;border-radius:10px;background:#fff;color:var(--ink)}
.field input:focus{outline:3px solid var(--green-2);outline-offset:1px;border-color:var(--green)}
.code-input{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:1.4rem;letter-spacing:.35em;text-align:center}
.btn-submit{width:100%;border:0;cursor:pointer;font:inherit;font-weight:650;background:var(--green);color:#fff;padding:13px 20px;border-radius:11px}
.btn-submit:hover{background:var(--green-2)}.btn-submit:focus-visible{outline:3px solid var(--green-2);outline-offset:3px}
.notice{background:var(--green-soft);border:1px solid #c3dbce;color:var(--ink);border-radius:12px;padding:13px 15px;font-size:.95rem;margin-bottom:18px}
.alert-error{background:#fdf1ed;border:1px solid #eabfb0;color:#7a2e14;border-radius:12px;padding:13px 15px;font-size:.95rem;margin-bottom:18px}
.login-links{display:flex;flex-wrap:wrap;justify-content:space-between;gap:12px;margin-top:16px;font-size:.92rem;color:var(--muted)}
footer{border-top:1px solid var(--line);margin-top:40px;padding:26px 0 40px;color:var(--muted);font-size:14px}
footer .wrap{display:flex;flex-wrap:wrap;gap:18px;justify-content:space-between}footer nav{display:flex;gap:18px}
@media(max-width:600px){body{font-size:16px}.hero{padding:44px 0 28px}.boundaries{padding:20px}}
`;

function page(title: string, body: string, description = "A private, invite-only tracker for your and your family's US immigration dates, deadlines and documents."): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><meta name="theme-color" content="#f8f7f3"><title>${title}</title><meta name="description" content="${description}"><style>${STYLE}</style></head><body>
<header><div class="wrap"><a class="brand" href="/"><span class="brand-mark" aria-hidden="true">I</span>Immigrant OS</a><a class="signin" href="${SIGN_IN_HREF}">Sign in</a></div></header>
${body}
<footer><div class="wrap"><span>Immigrant OS · Invite-only beta · Not a law firm · No legal advice</span><nav aria-label="Footer"><a href="/privacy">Privacy</a><a href="/agents">Connect an AI agent</a><a href="${ACCESS_REQUEST_HREF}">Request access</a></nav></div></footer>
</body></html>`;
}

export function landingPage(): string {
  return page("Immigrant OS · Private tracker for immigration dates and documents", `<main class="wrap">
<section class="hero">
<p class="eyebrow">Invite-only beta</p>
<h1>Your family's immigration dates, deadlines and documents, in one private place.</h1>
<p class="lead">Immigrant OS is a private tracker for people in the US on visas or green cards, and their families. Enter the dates from your own documents and get an action plan that links to the official government sources for each task.</p>
<div class="actions"><a class="primary" href="${ACCESS_REQUEST_HREF}">Request access</a><a class="secondary" href="${SIGN_IN_HREF}">Sign in</a></div>
</section>
<section aria-labelledby="what">
<h2 id="what">What it does</h2>
<ul class="grid">
<li class="card"><h3>Key dates in one place</h3><p>Keep the dates you enter, like I-94, visa, passport, work permit and green card expirations, together for each person in your family.</p></li>
<li class="card"><h3>An action plan with sources</h3><p>See upcoming review tasks based on the dates you saved. Each task links to the official source it comes from, so you can read the rules yourself.</p></li>
<li class="card"><h3>Documents organized per person</h3><p>Upload copies of PDFs and photos and keep them filed under the right family member, available only to your account.</p></li>
<li class="card"><h3>Connect your own AI agent<span class="tag">Optional</span></h3><p>If you use an AI assistant that supports MCP connectors, you can give it access to your saved records with a token you control. <a href="/agents">How it works</a></p></li>
</ul>
</section>
<section aria-labelledby="who">
<h2 id="who">Who it is for</h2>
<p class="lead" style="margin:0">People living in the US on student, work or visitor visas, green card holders, and the family members whose dates they help keep track of.</p>
</section>
<section aria-labelledby="limits">
<div class="boundaries">
<h2 id="limits">What it is not</h2>
<ul>
<li><strong>Invite-only beta.</strong> Access is by invitation while the product is being tested.</li>
<li><strong>Not a law firm.</strong> Immigrant OS is not a law firm and is not affiliated with USCIS or any government agency.</li>
<li><strong>No legal advice.</strong> Nothing in the app is legal advice. For questions about your case, talk to a qualified immigration attorney.</li>
<li><strong>It tracks, it does not judge.</strong> It organizes the dates you enter. It does not decide whether you are eligible for anything or calculate filing deadlines for you.</li>
</ul>
</div>
</section>
<section aria-labelledby="access">
<h2 id="access">Request access</h2>
<p>Email us to ask for an invitation. Please don't include case details or personal documents in your email.</p>
<div class="actions"><a class="primary" href="${ACCESS_REQUEST_HREF}">Email an access request</a><a class="secondary" href="/privacy">Read the privacy note</a></div>
</section>
</main>`);
}

export function privacyPage(): string {
  return page("Privacy · Immigrant OS", `<main class="wrap prose">
<h1>Privacy note</h1>
<p>This is a short, factual description of how Immigrant OS handles your information.</p>
<h2>What is stored</h2>
<ul>
<li>The email address you sign in with.</li>
<li>The profiles you create: a nickname, the immigration status you select and the dates you enter.</li>
<li>USCIS case receipt numbers you add, with the form type and label you give them, and which tasks you mark as done.</li>
<li>Copies of documents you choose to upload.</li>
<li>If you connect an AI agent: a record of each token you create (never the token itself, only a fingerprint of it), when it was last used, and when it expires.</li>
</ul>
<h2>Where it is stored</h2>
<p>Your records are kept in the app's cloud database and your uploaded files in its cloud file storage, both hosted on Cloudflare. Each record is tied to your account and is shown only to you when you are signed in, or to an AI agent you connect with your own token.</p>
<h2>What we don't do</h2>
<ul>
<li>Your data is never sold.</li>
<li>There are no advertising trackers or third-party analytics on the app. A sign-in cookie keeps you signed in.</li>
</ul>
<h2>A tracking tool, not legal advice</h2>
<p>Immigrant OS helps you keep track of dates and documents you enter. It is not a law firm, does not give legal advice, and does not decide eligibility.</p>
<h2>Deleting your data</h2>
<p>You can delete uploaded documents in the app at any time. To delete your account and all of its data, email <a href="${DELETION_REQUEST_HREF}">${ACCESS_REQUEST_EMAIL}</a> from the address you sign in with.</p>
<p><a href="/">Back to Immigrant OS</a></p>
</main>`, "A private, invite-only tracker for your and your family's US immigration dates and documents.");
}

export type BrandedLoginPageOptions = {
  step?: "email" | "verify";
  email?: string;
  notice?: string;
  error?: string;
};

export function brandedLoginPage(options: BrandedLoginPageOptions = {}): string {
  const step = options.step === "verify" ? "verify" : "email";
  const safeEmail = options.email ? escapeHtml(options.email) : "";
  const noticeHtml = options.notice ? `<div class="notice" role="status">${escapeHtml(options.notice)}</div>` : "";
  const errorHtml = options.error ? `<div class="alert-error" role="alert">${escapeHtml(options.error)}</div>` : "";

  const formHtml = step === "verify"
    ? `<form method="post" action="/auth/login/verify">
<div class="field"><label for="email">Email address</label><input id="email" name="email" type="email" autocomplete="email" value="${safeEmail}" placeholder="you@example.com" required></div>
<div class="field"><label for="code">6-digit sign-in code</label><input id="code" name="code" class="code-input" type="text" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" placeholder="000000" required autofocus></div>
<button class="btn-submit" type="submit">Verify and sign in</button>
</form>
<div class="login-links"><a href="/auth/login">Request a new code</a><a href="${ACCESS_REQUEST_HREF}">Need an invite?</a></div>`
    : `<form method="post" action="/auth/login/code">
<div class="field"><label for="email">Email address</label><input id="email" name="email" type="email" autocomplete="email" value="${safeEmail}" placeholder="you@example.com" required autofocus></div>
<button class="btn-submit" type="submit">Send sign-in code</button>
</form>
<div class="login-links"><a href="/auth/login?step=verify">Already have a code?</a><a href="${ACCESS_REQUEST_HREF}">Request access</a></div>`;

  return page("Sign in · Immigrant OS", `<main class="wrap"><div class="login-shell">
<p class="eyebrow">Invite-only beta</p>
<h1>Sign in to Immigrant OS</h1>
<p class="lead">${step === "verify"
  ? "Enter the 6-digit code sent to your email address. Codes expire after 10 minutes."
  : "Enter your invited email address and we will send a one-time 6-digit sign-in code."}</p>
<div class="login-card">
${noticeHtml}${errorHtml}${formHtml}
</div>
<div class="boundaries">
<ul>
<li><strong>Invite-only beta.</strong> Access is by invitation while the product is being tested.</li>
<li><strong>Not a law firm.</strong> Immigrant OS is not a law firm and is not affiliated with USCIS or any government agency.</li>
<li><strong>No legal advice.</strong> Nothing in the app is legal advice. For questions about your case, talk to a qualified immigration attorney.</li>
</ul>
</div>
</div></main>`, "Sign in to Immigrant OS with a one-time email sign-in code.");
}
