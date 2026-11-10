# Reminders v1: email design (backlog 5)

Date: 2026-11-10. Status: **Phase 0 — design only; no sending authorized.**

Recommendation: opt-in, one daily email containing that day's eligible action reminders, using **Resend Free**. Keep **MailChannels Email API** as an owner-approved, manually selected fallback, subject to its payment-method restriction for arbitrary recipients. Do not automatically fail over a message whose send outcome is unknown. Both providers advertise 3,000 emails/month and 100/day; these are account-wide ceilings, not per-user allowances ([P1](#provider-evidence), [P5](#provider-evidence), [P6](#provider-evidence)). Inbox delivery remains untested; this design makes no delivery guarantee.

This document specifies future work. It creates no service account, key, migration, binding, trigger, deployment, email, or paid commitment. The backlog number and “选型与发送服务接法出方案” scope come from the task brief; no separate charter file was found in `docs/`.

## 1. Repository baseline and current state

Inspection was against local `independent-hosting` tip `84afeb928920ac680b9c74fcd582b3c4b49c8e58`. The checkout already had a clean `reminders-v1-design` branch at that exact commit; its reflog records creation from HEAD. Local `main` is `35c8e70834754d41c386db50c37f9166eac3f7e2`. These are local Git observations, not a verification of GitHub or the deployed artifact. No remote fetch or cloud inspection was performed.

`wrangler.jsonc` selects `worker/index.ts`, Worker `immigrant-os`, D1 `immigrant-os-db` through `DB`, and R2 `immigrant-os-files` through `BUCKET`. `worker/index.ts` delegates web requests to vinext's app-router handler. `wrangler.jsonc` sets session authentication and Access issuer/audience configuration; `lib/access-jwt.ts` verifies Access JWT identity and `lib/access-auth.ts` bridges it into app sessions. `docs/cloudflare-hosting.md` describes one-time-PIN setup, but the actual configured identity-provider policy and live deployment are **not repo-verifiable**. The task brief reports independent hosting as live; this design targets this branch's code, not the older Sites description in `AGENTS.md` or historical entries in `docs/project_state.md`.

`worker/index.ts` handles `/mcp` separately and passes the exact `AGENT_MCP_ENABLED === "true"` check into `lib/mcp.ts`; the committed flag is currently `true` in `wrangler.jsonc`. This proves code/configuration, not upstream Access reachability. Some historical documentation is stale: `README.md` still says MCP is unimplemented, and `docs/cloudflare-hosting.md` describes disabled default URLs whereas current `wrangler.jsonc` has `workers_dev: true`. Do not use those statements as current runtime evidence.

### Shared action plan and due dates

The web UI loads `/api/plan` in `app/page.tsx`. `app/api/plan/route.ts` authenticates the owner and calls `loadPlan(owner)` in `lib/workspace.ts`. That function loads the owner's profile and `completed_actions.action_key` values and calls `buildPlan` in `lib/rules.ts`. MCP `get_action_plan` uses the same `loadPlan` through `openActions` in `lib/mcp.ts`, returning only uncompleted items with ID, title, due date, open status and official source. The future scheduler must use this same owner-scoped service, without calling the public MCP endpoint or imitating a user's session.

In `lib/rules.ts`, action IDs are `${baseId}:${dueDate ?? "review"}`; completion is exact membership in the saved key set. Items sort open first, then dated first in ascending date order. `app/api/actions/route.ts` validates the current key, inserts completion, or deletes completion when reopened. Changing a date generates a new key; reverting to a previously completed date can restore completion. No email should interpret completion as a legal outcome.

All current action families below are verified in `lib/rules.ts`:

| Base action ID | Date derivation and condition | Proposed email ladder |
| --- | --- | --- |
| `f1-i94-end` | Entered I-94 date, only F1 with `FIXED_DATE`; D/S suppresses it even if an old date remains | 30/14/7/1 days before |
| `f1-program-end` | Entered I-20 program end date for F1 | 30/14/7/1 |
| `h1b-i94-end` | Entered I-94 date for H1B | 30/14/7/1 |
| `h1b-extension-planning` | Six calendar months before that I-94 date, clamped to destination month's last day; already a planning cue, not a filing deadline | 7/1 before the existing planning date |
| `lpr-card-expiry` | Entered card expiration for LPR/CITIZENSHIP when present | 30/14/7/1 |
| `ead-expiry` | Entered EAD expiration, any stage | 30/14/7/1 |
| `universal-passport-expiry` | Entered passport expiration, any stage | 30/14/7/1 |
| `gc-visa-bulletin` | First day of next month, based on the current UTC month, for GREEN_CARD | One reminder at 7 days before |
| `gc-case-receipts`, `lpr-n400-review` | Undated review/setup tasks, conditional on stage/profile | Excluded from scheduled email |

`lib/rules.ts` does not currently generate a visa-stamp-expiration task despite `visaExpirationDate` being accepted in `lib/profile.ts`. Do not invent one for email. Do not add an OPT filing window, N-400 earliest filing date, eligibility determination, case-status polling, or an overdue legal warning. `firstDayNextMonth()` changes the bulletin action key at a UTC month boundary: persist neither an assumed permanent bulletin date nor an independently calculated replacement. Rebuild before sending.

### Calendar export, storage and scheduler

The export is generated **in the browser**, by `exportCalendar` in `app/page.tsx` calling `calendarFile(plan)` in `lib/calendar.ts`, downloading `immigrant-os-dates.ics`. There is no calendar API route. It includes only open, dated actions as all-day events, with title, description and official-source URL; end date is exclusive on the following day. There is no `VALARM`, subscription feed, automatic sync, push, or email send in that implementation. Importing the snapshot does not promise a notification.

Application tables declared by the migrations, corroborated by `db/schema.ts` and the initialization SQL in `db/index.ts`:

| Migration | Tables and relevant contents |
| --- | --- |
| `drizzle/0000_new_maria_hill.sql` | `profiles` (owner PK and saved profile dates); `documents` (owner and R2 metadata); `tracked_cases` (owner, receipt, labels/status); `completed_actions` (owner/action key, unique pair) |
| `drizzle/0001_round_ted_forrester.sql` | `sessions` (ID, owner, expiry, creation time) |
| `drizzle/0002_agent_tokens.sql` | `agent_tokens` (owner, token hash, scopes and lifecycle timestamps) |

These are the six application tables; this is not a query of production D1 or its internal migration metadata. There is no reminder preference, consent, timezone, subscription, outbox, suppression or delivery-state table/column in these migrations or `db/schema.ts`. `lib/profile.ts` likewise has no timezone or locale field. `wrangler.jsonc` has no `triggers`/cron configuration; `worker/index.ts` exports a `fetch` handler and no `scheduled` handler. The inspected application has no outbound email client; `docs/cloudflare-hosting.md` also distinguishes Access PIN emails from an application mailer.

### Recipient identity already exists

`lib/access-jwt.ts` verifies signature/issuer/audience/time claims, normalizes the email with `trim().toLowerCase()`, and validates its shape. `lib/access-auth.ts` passes that email to `issueSession`; `lib/auth.ts` persists it as **`sessions.owner`**. Profile writes in `lib/workspace.ts` persist the authenticated owner as **`profiles.owner`**; other owner-scoped tables use the same value (`db/schema.ts`). There is no separate recipient/email column.

Thus an Access-backed saved profile already has a usable recipient address: no need to ask the user to type it again. **Known identity is not reminder consent.** Enrollment must require a current authenticated Access/session match, show the address, and obtain explicit opt-in; never bulk-enroll existing owner rows or assume all historical rows have Access provenance. V1 sends only to that verified current identity, with no alternate recipient field. A changed login email is a different owner; do not migrate subscriptions automatically. Session expiry alone should not cancel an explicitly enrolled subscription.

## 2. Product and compliance requirements

The ladder above is a product notification convention, not official immigration timing. For entered document/admission dates, 30/14 days provide time to review the saved entry and official instructions; 7/1 are near-date reminders. The existing six-month H1B planning action needs only 7/1 to avoid a second long preparation ladder. A monthly bulletin review needs one email per monthly action, not four repeated nudges. These choices derive from the action families in `lib/rules.ts`, not new legal rules.

- **Digest:** at most one reminder email per owner per local calendar day, also no more than one in any rolling 24 hours. Include only milestones eligible that day, ordered by existing due date. No empty daily mail, marketing, generic weekly status mail, or separate message for each action. Completed/undated items are excluded. No due-day or overdue sequence in v1.
- **Timezone:** require confirmation of an IANA timezone at enrollment (browser suggestion is acceptable); never silently infer it from IP, locale or UTC. Add an explicit `en`/`zh` language preference. Dates remain the exact `YYYY-MM-DD` values from the plan. Compute notification offsets as calendar-day differences in the chosen timezone, not multiples of 24 hours. Default delivery time is 09:00 local; UTC execution and DST are scheduler concerns only. Timezone changes do not reset event deduplication or the rolling cap.
- **Missed milestones:** enrollment/date edits do not replay past thresholds. At or after 09:00, send only milestones matching today's local date; allow a late run until that day's end. If an outage/quota block skips that day, record a missed occurrence and wait for the next milestone; do not compress several missed reminders into later mail. Display the limitation in settings and maintain the in-app checklist. A 31-day month must not be treated as having 30 days of provider capacity.
- **Consent and controls:** default off; show address, timezone, language, frequency and sensitive-content implications before opt-in. A login or profile save does not opt in. Settings supports pause/unsubscribe; every email has a working unsubscribe link and data-deletion note, including test emails.
- **Minimum PII:** body contains only current task title, saved/planning date, official source, short factual caveat and controls. Generic subject/preheader; no name, lifecycle stage summary, receipt number, priority date context, document filename/content, attachments, passport number, access token, or profile dump. One recipient per message; no CC/BCC groups. Disable open/click tracking. Use existing source URLs directly, with no tracking query strings. Escape all rendered values and allowlist the existing official source hosts; never fetch or embed documents.
- **Hard copy boundary:** present tasks and dates and link their official source only. No eligibility determinations, legal advice, new filing-date calculations, guarantee of status/work authorization, or claims that a planning date is a filing deadline. Use the exact existing English task title/date/source from `lib/rules.ts`; reviewed Chinese translations may express the same task but must add no rule. Do not copy the full rule description or `basis` into email. An app link and unsubscribe/deletion controls are functional links, not extra immigration sources. Existing source attachment is not proof of a newly verified legal assertion (see `docs/content-audit.md`).

## 3. Provider options and evidence

### Provider evidence

All rows below were accessed **2026-11-10** with local `curl` GET requests from this machine. Status is the final HTTP code after redirects. The exact reusable command was:

```sh
curl -L -sS --max-time 25 -o /tmp/reminders-evidence/PAGE.html \
  -w 'HTTP %{http_code}\nURL %{url_effective}\n' 'URL_FROM_TABLE'
```

The initial Resend pricing output was `/tmp/reminders-resend-pricing.html`. HTTP 200 alone was not counted as proof: the downloaded page text was inspected for the facts below. Source IDs elsewhere in this document incorporate the URL, HTTP status and date in this ledger. These are public-page observations, not account eligibility or a guarantee that terms will remain unchanged.

| ID | Official URL requested (redirect where applicable) | HTTP | Access date | Observed evidence / limit |
| --- | --- | --- | --- | --- |
| P1 | https://resend.com/pricing | 200 | 2026-11-10 | Transactional Free: $0/month, 3,000 emails/month, 100/day, 3 domains, 3 inboxes, ticket support, 30-day data retention. Tracking is available on Free; disable it for this design. |
| P2 | https://resend.com/docs/dashboard/domains/introduction | 200 | 2026-11-10 | Send using a domain you own; recommends subdomains to isolate sending reputation. |
| P3 | https://resend.com/docs/dashboard/domains/manage-domains | 200 | 2026-11-10 | Domain verification and generated DKIM/SPF DNS configuration; DMARC parameters are shown with records. |
| P4 | https://resend.com/docs/dashboard/emails/idempotency-keys | 200 | 2026-11-10 | Send and batch endpoints accept idempotency keys; retained 24 hours; same key/payload can be retried without a new send; changed payload produces conflict. |
| P5 | https://www.mailchannels.com/pricing/ | 200 | 2026-11-10 | Current Email API Free: $0/month, up to 3,000 emails/month, 100/day, no overages; REST/SMTP, up to 3 domains, 30-day transaction logs. |
| P6 | https://docs.mailchannels.com/email-api/billing/pricing | 200 | 2026-11-10 | 100/day, reset at 00:00 UTC; before adding a payment method, recipients must be verified users on the account. Arbitrary recipients require a payment method. Free API lacks open/click tracking. |
| P7 | https://docs.mailchannels.com/email-api/authentication | 200 | 2026-11-10 | Account API-key authentication for the current API. This is not an anonymous Workers relay. |
| P8 | https://docs.mailchannels.com/email-api/domain-lockdown | 200 | 2026-11-10 | DNS TXT at `_mailchannels.<domain>` authorizes account/sender identities. Worker-ID `cfid` authorization is no longer supported as of 2024-08-31. |
| P9 | https://docs.mailchannels.com/email-api/spf-dkim-dmarc | 200 | 2026-11-10 | SPF includes `relay.mailchannels.net`; DKIM public key goes in DNS; configure DMARC. Page says these are not explicitly checked during sending, but are needed for successful receipt. Do not confuse deliverability setup with an API acceptance check. |
| P10 | https://www.twilio.com/docs/sendgrid/ui/account-and-settings/upgrading-your-plan | 200 | 2026-11-10 | New-account trial: 60 days, Email API up to 100/day; upgrade required to continue afterward. No ongoing $0 tier established by this page. |
| P11 | https://developers.cloudflare.com/email-routing/ → https://developers.cloudflare.com/email-service/ | 200 | 2026-11-10 | Routing processes/forwards inbound mail on Free/Paid. New Email Sending supports arbitrary recipients on Workers Paid. Sending to verified destination addresses in the account is free on Workers Free/Paid, even with only Routing configured. |
| P12 | https://developers.cloudflare.com/email-service/ | 200 | 2026-11-10 | Same distinction as P11. No numeric verified-destination send allowance established: **UNVERIFIED**. |
| P13 | https://developers.cloudflare.com/email-routing/email-workers/send-email-workers/ → https://developers.cloudflare.com/email-service/api/send-emails/workers-api/ | 200 | 2026-11-10 | Current Workers send binding/API; documents sender-domain verification and recipient restriction errors. Does not establish an arbitrary-recipient free tier. |
| P14 | https://aws.amazon.com/ses/pricing/ | 200 | 2026-11-10 | À la carte outbound $0.10/1,000 emails plus applicable data/add-ons. New AWS customers may get up to $200 credits; free plan lasts 6 months, credits must be used within 12 months. No recurring 3,000/month SES allowance found on this page: that number is **UNVERIFIED**, not used here. |
| P15 | https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html | 200 | 2026-11-10 | Sandbox: verified recipients/domains or simulator, 200 messages/24h, 1 message/second. Production access requires a request; sending identities still need verification. |
| P16 | https://developers.google.com/workspace/gmail/api/guides/sending | 200 | 2026-11-10 | Gmail API sends MIME messages through authorized Gmail credentials. No commercial/free-tier pricing guarantee established: **UNVERIFIED**. |
| P17 | https://developers.google.com/workspace/gmail/api/auth/web-server | 200 | 2026-11-10 | Google API project, enabled Gmail API, OAuth client/consent, access and refresh tokens. |
| P18 | https://developers.google.com/workspace/gmail/api/auth/scopes | 200 | 2026-11-10 | `gmail.send` permits sending; avoid wider mailbox scopes. Verification requirements must be checked for the chosen OAuth app before rollout. |
| P19 | https://support.google.com/mail/answer/22839?hl=en | 200 | 2026-11-10 | Consumer Gmail warns about more than 500 emails/day or more than 500 recipients in one message; sending may resume in 1–24h. This is an abuse limit, not a transactional-service guarantee or a monthly quota. |
| P20 | https://developers.google.com/workspace/gmail/imap/imap-smtp | 200 | 2026-11-10 | SMTP supports OAuth 2.0; TLS/SSL connection requirements. Worker SMTP compatibility was not tested and is **UNVERIFIED**. |
| P21 | https://support.google.com/accounts/answer/185833?hl=en | 200 | 2026-11-10 | App passwords require 2-Step Verification; unavailable for some account configurations and revoked after password changes. Google discourages them when Google sign-in is available. |
| P22 | https://developers.cloudflare.com/workers/configuration/cron-triggers/ | 200 | 2026-11-10 | Cron runs in UTC, needs a `scheduled` handler, and supports Wrangler `triggers.crons`; configuration changes may take up to 15 minutes to propagate. |
| P23 | https://resend.com/docs/dashboard/webhooks/event-types → https://resend.com/docs/webhooks/event-types | 200 | 2026-11-10 | Sent, delivered, delivery-delayed, failed, bounced, complained and suppressed event types. Delivery means recipient server acceptance, not a read. |
| P24 | https://resend.com/docs/dashboard/webhooks/verify-webhooks-requests → https://resend.com/docs/webhooks/verify-webhooks-requests | 200 | 2026-11-10 | Signed webhook verification; verify the original request body before processing. |
| F1 | https://docs.mailchannels.net/email-api/getting-started/ → https://docs.mailchannels.com/email-api/getting-started | 404 | 2026-11-10 | Old setup URL unavailable; contents **UNVERIFIED**. Current P6–P9 supply the setup evidence instead. |
| F2 | https://support.mailchannels.com/hc/en-us/articles/26814255454093-End-of-Life-Notice-Cloudflare-Workers | 403 | 2026-11-10 | Legacy free Workers service EOL page blocked; exact EOL announcement contents **UNVERIFIED by local curl**. Do not rely on old unlimited/free anonymous Workers examples. P7/P8 verify the current authenticated path. |

Fetch limitation log: a Python `subprocess.run` batch invoking the same curl arguments failed with exit 6 and HTTP `000` (`curl: (6) Could not resolve host: HOST`) for `www.mailchannels.com`, `support.mailchannels.com`, `docs.mailchannels.net`, `resend.com`, `www.twilio.com`, `developers.cloudflare.com`, `aws.amazon.com`, `docs.aws.amazon.com`, `developers.google.com`, and `support.google.com`. `000` is no HTTP response, not a server status. Most failed batch fetches received one subsequent direct-shell attempt; P1 uses the successful initial direct request. Results are recorded above. The batch's guessed URL `https://support.mailchannels.com/hc/en-us/articles/26814255454093-End-of-Life-Notice-for-Cloudflare-Workers` also failed DNS/HTTP `000` on 2026-11-10 and remains **UNVERIFIED**; F2 is the official URL located afterward. Search snippets were not substituted for successful local fetches. No repeated retry loop was used.

### Decision and $0 feasibility

| Candidate | Decision, setup friction and privacy |
| --- | --- |
| **Resend — primary** | Advertised ongoing Free limits fit a small opt-in pilot (P1). Owner must register, verify a controlled sending domain/DNS and provision a sending-only secret (P2/P3; exact key permissions to be validated during setup). Documented 24h idempotency and signed event handling make failure recovery reviewable (P4/P23/P24). Provider receives recipient and minimal message body; disable tracking despite its availability. No comparative inbox-rate claim is made. |
| **MailChannels — fallback** | Current authenticated HTTP Email API can be called from a Worker; use P7/P8, not old anonymous Workers integration examples. Same advertised monthly/daily ceiling (P5); additional Domain Lockdown, SPF/DKIM/DMARC setup (P8/P9). **Without a payment method it is only a verified-account-user test fallback**, not a 100-beta-user sender (P6). Enabling arbitrary recipients needs separate owner approval to attach a payment method even if intended volume costs $0. Provider deduplication guarantee/window and webhook signing details were not verified: **UNVERIFIED**, so fallback sends use the conservative single-attempt policy below until reviewed. |
| SendGrid | A 60-day/100-per-day trial does not satisfy an ongoing $0 service requirement (P10). No recommendation to start a trial now. |
| Cloudflare Email Routing / Email Sending | “Routing is inbound-only, therefore Cloudflare cannot send” is now misleading. Routing remains inbound processing/forwarding, but verified-destination sends are free, and arbitrary-recipient sending is a separate Workers Paid capability (P11–P13). Could support owner-only experiments; not selected for arbitrary beta recipients at $0. Numeric allowance, owner's plan eligibility and incremental paid cost remain **UNVERIFIED**. |
| Amazon SES | Requires an AWS account and sender verification; sandbox cannot send to arbitrary unverified beta recipients (P15). Not established as a **$0-start option for this owner**: account ownership/credit eligibility are unverified, and public credits are conditional/time-limited (P14). At 900 sends/month, base outbound arithmetic is $0.09 before data/add-ons/credits, not a $0 guarantee. No account or production-access request is authorized. |
| Workers + Gmail API / SMTP | An existing eligible Gmail account may avoid buying a mail service, but a $0 commercial/API entitlement was not verified (P16). OAuth project/consent/refresh-token lifecycle is substantial friction (P17/P18); SMTP app passwords add account constraints (P20/P21). Consumer sending limits in P19 are not transactional delivery commitments. Couples app sending to a mailbox/account and credential lifecycle; reject for beta, prefer no mail until primary setup is approved. |

Cost model (design assumptions, not measured usage): zero enrolled users means zero sends; Resend/MailChannels Free have $0 email-plan cost (P1/P5). At 100 opted-in beta users, assume two dated actions per user reaching four milestones in a month plus one monthly review: `100 × (2 × 4 + 1) = 900` event-reminders, with digest grouping reducing message count. This fits 3,000/month **only under that assumption**; synchronized deadlines can still exceed daily capacity. A daily email to all 100 users would be 3,100 messages in a 31-day month and cannot be promised on either tier. MailChannels additionally needs its arbitrary-recipient prerequisite resolved (P6).

Propose hard application budgets of 90 attempted messages per UTC day and 2,700 per provider billing month, reserving 10/day and 300/month for owner-approved tests/control traffic. Count unknown outcomes against quota and never automatically upgrade. A 100-user same-day spike cannot all be served under this safety budget: record quota-missed reminders, show status in-app, and revisit admission/frequency with the owner before expanding. Free-tier ceilings do not imply free domain registration, free added infrastructure, or unlimited existing Workers/D1 usage; those incremental costs and the owner's remaining quotas are **UNVERIFIED**. Use an existing approved domain; buy nothing.

## 4. Proposed data and execution design

All names below are proposals, not existing tables/routes/files. Reuse profiles and completion keys through `lib/workspace.ts`; do not store a second immigration rule engine or turn action completion into a send ledger.

### D1 model

| Proposed table | Columns and constraints |
| --- | --- |
| `reminder_subscriptions` | `id` opaque PK; `owner` unique and matching `profiles.owner`; `state` (`active`, `paused`, `unsubscribed`, `suppressed`); `timezone` validated IANA value; `locale` (`en`, `zh`); `send_hour` default 9; `consented_at`; `consent_version`; `verified_identity_at`; `generation` for invalidating pending work/old control tokens; `last_attempt_at`; `suppression_reason`; `unsubscribed_at`; creation/update timestamps. No alternate recipient; use owner email. Index state/owner. |
| `reminder_occurrences` | `id` opaque PK; `subscription_id`; exact `action_key` (already includes due date); `threshold_days`; `target_local_date`; `state` (`pending`, `attached`, `sent`, `cancelled`, `missed`, `unknown`); nullable `delivery_id`; timestamps. Unique `(subscription_id, action_key, threshold_days)`; index pending/date. Stable subscription ID survives pause/re-enable; changing locale/timezone or code/template version must not recreate a sent occurrence. |
| `reminder_deliveries` | `id` opaque PK; `subscription_id`; `subscription_generation`; `local_send_date`; `provider`; `state` (`ready`, `sending`, `accepted`, `delivered`, `retry_wait`, `unknown`, `failed`, `cancelled`, `bounced`, `complained`); immutable minimal `payload_json` and `payload_hash`; unique `provider_idempotency_key`; nullable unique `(provider, provider_message_id)`; `attempt_count`; `first_attempt_at`; `retry_deadline_at`; `next_attempt_at`; `lease_token`; `lease_expires_at`; sanitized `last_error_code`; timestamps. Unique `(subscription_id, local_send_date)` plus rolling-24h guard on subscription. |
| `reminder_provider_events` | `(provider, event_id)` composite PK; `delivery_id`; event type; received timestamp. Store no raw webhook body. Deduplicates webhook retries and rejects conflicting owner/message association. |
| `reminder_send_budgets` | `(provider, period_kind, period_start)` composite PK; `reserved_attempts`; `hard_limit`; updated timestamp. Atomic conditional reservation of both daily and monthly budget before dispatch; retries conservatively consume budget too. |

Use explicit foreign-key/delete behavior and indexes in a future migration, with transactional/conditional D1 operations validated locally; do not rely on a read-then-write lock in Worker memory. Keep consent/reminder state separate because sessions expire, and profile normalization in `lib/profile.ts` currently has no notification fields. Subscription generations invalidate queued work, **not** sent-event dedup keys. A reopened action or reverting a date must not resend an already-sent threshold. No schema file is changed by Phase 0.

Retain minimal payload snapshots only while required for exact retries, purging them within 30 days; keep outcome/error metadata for 30 days. Keep compact occurrence dedup tombstones for the subscription lifetime so expiry of payload logs cannot cause duplicate old reminders. Purge all reminder records on account deletion; a later fresh enrollment starts prospectively with no backfill. Retain only the minimum unsubscribed state while the account exists so a background job cannot re-enroll it. Provider retention/deletion beyond the published 30-day entries (P1/P5), backups, regions and contractual terms are **UNVERIFIED** and require owner review; never promise erasure from a recipient's mailbox or instantaneous provider deletion.

### Cron and send flow

Proposed future configuration fragment, **not applied to `wrangler.jsonc`**:

```json
{ "triggers": { "crons": ["0 * * * *"] } }
```

One hourly UTC invocation checks local 09:00 eligibility, including half/quarter-hour timezones (delivery may be up to an hour after 09:00). Add a future `scheduled` handler alongside `fetch`; enable staging first and guard all execution with a default-off `REMINDERS_ENABLED` switch and environment-specific recipient allowlist. Cron syntax/UTC behavior: P22. Existing runtime bindings are injected during `fetch` in `worker/index.ts`; a scheduled invocation cannot assume that happened. Future work must initialize the D1 runtime context explicitly or refactor shared services to accept bindings, without leaking one invocation's owner/context into another (`db/index.ts`, `lib/runtime-env.ts`). No fake Access headers or sessions.

1. Return immediately when disabled. Page through active subscriptions with saved profiles, in bounded batches and deterministic/fair order; do not scan documents, R2 or case receipts. Compute each owner's local date/time from the confirmed timezone. If before 09:00, outside today's window, suppressed or within the rolling cap, skip.
2. Call the shared `loadPlan(owner)`. Keep only open, dated, allowlisted action families matching today's threshold. Insert occurrence records with the unique key; classify previously pending occurrences that disappeared, completed, changed date, or passed their target day as cancelled/missed. No old-threshold replay.
3. In a short atomic operation, create/claim the unique daily digest and attach its occurrences. Assemble a minimal payload from current plan fields and persist the immutable payload/hash and stable opaque key. A single concurrent winner reserves daily/monthly capacity and the subscription's rolling cap. If already sent/unknown, do not create a second digest.
4. Immediately before first dispatch, re-read subscription generation/state, profile and completion state. If stale, cancel; before any network attempt it is safe to rebuild the same unsent delivery under its lock. After an attempt, never change payload under the idempotency key. If an attempted payload becomes stale or unsubscribed, halt retries and mark unresolved outcome as unknown; the already handed-off email cannot be recalled.
5. Atomically claim a bounded lease with fencing token; persist `sending`, attempt count, first attempt time and retry deadline **before** the HTTP request. Post the immutable payload to the selected provider with its idempotency key where verified (P4). No email address, task title, URL token or body in application logs.
6. Record provider acceptance/message ID using the lease token; acceptance is not inbox delivery. Webhook events update outcome through the signed control endpoint. Workers that lose their lease cannot mutate the winning delivery. A lease expiry after a possible network send is ambiguous, not permission to create a new message.

The last preflight narrows but cannot eliminate the race where an action is completed/unsubscribed just after the email is handed to a provider. Settings and copy must acknowledge this; an accepted message cannot be recalled. Later jobs must honor the new state.

### Idempotency, retries and failures

**Invariant: the application never intentionally submits a second distinct send for the same occurrence.** D1 uniqueness covers cron overlap, DST, repeated manual triggers, completion toggles, date reversions and restarts. A fixed provider key covers the crash between network acceptance and D1 acknowledgment. Do not claim exactly-once inbox delivery: downstream mail transport is outside the app's control.

- Resend's verified idempotency retention is **24h** (P4). Set the app's retry deadline to **23h after the first attempt**, and also stop at the local day's end. Maximum four attempts total, with eligible delays of 1h, 3h and 6h after the previous attempt, modest jitter, and any longer `Retry-After`; skip retries that would cross either deadline. All attempts reuse the same provider, key, recipient and exact payload.
- Retry transient connection/timeout/5xx and rate-limit responses only under that verified protection and within quota. Provider errors proving permanent rejection (invalid recipient, sender/domain/auth configuration) stop; notify the operator in the app/log counters. A changed-payload conflict is a bug, not a reason to mint a new key. Honor concurrent-request conflicts using the same key (P4).
- An ambiguous request at/after the safe window becomes `unknown`; retain tombstones, count it against quota, reconcile by signed event/provider message lookup if supported, and **never automatically resend**. This deliberately prefers a missed message over a duplicate. Do not switch an unknown Resend message to MailChannels.
- MailChannels fallback idempotency is **UNVERIFIED**. Until an equivalent guarantee is established, permit one outbound attempt per delivery; timeout/crash after entering `sending` becomes `unknown`, with no automated replay, even if this loses a message before it actually left the process. Manual provider selection applies only to newly eligible, never-attempted deliveries. Reconcile existing unknowns without resetting their ledger.
- Verified hard-bounce or spam-complaint event immediately suppresses the subscription and cancels unsent work. Verify signature/raw body, reject replay/duplicate event IDs, correlate provider message ID to the stored delivery, and never trust a webhook-supplied owner alone (P23/P24). Out-of-order `sent`/`delivered` events cannot reactivate a suppression or overwrite a terminal complaint.
- Provider delivery-delay/soft-bounce events do not cause an application resend after acceptance; record them and let the provider handle its delivery attempt. Repeated delays/failures prompt operator review; v1 pauses after three consecutive unsuccessful reminder deliveries, requiring authenticated review before resumption. Track acceptance, delivery, bounce, complaint, unknown and quota-miss separately; never report “delivered” on API success alone (P23).

### Unsubscribe, deletion and protected hosting

Propose an unguessable, purpose-scoped signed unsubscribe token containing opaque subscription ID, generation and key version, never the email. Keep unsubscribe links valid for that subscription generation, including older messages; re-enrollment rotates generation only after explicit authenticated consent. GET shows a minimal confirmation page; POST unsubscribes atomically and idempotently. No login required, no profile data returned, no third-party assets, `no-store` and no-referrer handling. Provide one-click unsubscribe headers/POST handling as a product requirement; exact mailbox-provider header requirements must be verified during implementation.

The current `worker/index.ts` invokes `handleAccessAuth` before ordinary web APIs; an app route alone would not ensure anonymous unsubscribe or provider-webhook reachability. **Do not widen existing Access policy/audience.** Proposed solution: a separate, minimal control Worker/hostname exposing only token-authenticated unsubscribe and signature-authenticated delivery events, with the necessary narrowly used D1 binding and no R2/profile/download endpoints. This is future infrastructure requiring owner authorization and a reviewed threat model/cost check; Phase 0 creates nothing. Production mail is blocked until unsubscribe and bounce callbacks work without an app login. A protected settings link alone is insufficient.

Every email also gives the owner-approved, monitored deletion-request address. Full account deletion is not currently implemented by `app/api/profile/route.ts`; existing document deletion is per file in `app/api/documents/route.ts`. Before any real-user reminder, establish and test the operator deletion workflow: suppress sending immediately, remove pending snapshots/reminder state, and process requested account/profile/case/completion/token/session/R2 deletion with scope confirmation. Do not invent a working self-service deletion URL. Document backup/provider retention and its limits to the requester. Unsubscribe is not account deletion, and a bearer unsubscribe token must never authorize destructive account deletion.

## 5. Proposed email copy

Subject: **Immigrant OS — saved-date reminder** / **Immigrant OS — 已保存日期提醒**. No name, document type, date, status or urgency in subject/preheader. Use one language per user's preference. The repeated item block below is populated only from the current shared plan; Chinese titles must have reviewed, versioned translations of existing English titles. Missing translation falls back to the exact English title, never generated legal interpretation.

English:

```text
Your action plan has an open task:

Task: {{existing_task_title}}
Date shown in your plan: {{YYYY-MM-DD}}
Official source: {{existing_official_source_url}}

These are dates/tasks from your saved plan, not an eligibility decision
or legal advice. A planning date is not a filing deadline.
Your plan may have changed since this email was prepared.

View your plan: {{authenticated_app_url}}
Unsubscribe from email reminders: {{unsubscribe_url}}
To request deletion of your data, contact {{approved_deletion_address}}.
Unsubscribing stops reminders; it does not delete your account data.
```

中文：

```text
你的行动清单中有一项未完成任务：

任务：{{经审核的现有任务标题}}
清单显示的日期：{{YYYY-MM-DD}}
官方来源：{{现有官方来源链接}}

以上仅为已保存清单中的日期和任务，不是资格判定或法律建议。
规划日期不是申请截止日期。邮件生成后，清单可能已经更新。

查看清单：{{需登录的应用链接}}
退订邮件提醒：{{退订链接}}
如需申请删除你的数据，请联系 {{经批准的数据删除联系地址}}。
退订会停止提醒，但不会删除账户数据。
```

For a digest, repeat only the task/date/source block and use a plural opening. No extra interpretation of I-94, EAD, residence, work authorization, bulletin availability or filing eligibility. Official URLs are copied from `lib/rules.ts`; this document does not assert that their immigration guidance was revalidated today. No email is sent with unresolved template placeholders.

## 6. Validation and rollout gates

This change is documentation only: inspect links/paths, evidence, branch/base, whitespace and the file allowlist. Per the task brief, do **not** install dependencies or run application tests for Phase 0. No cloud command is part of this task.

Future implementation validation:

- **Local, fake transport only:** fixture all `lib/rules.ts` action families; verify exact parity with web/MCP title/date/source and completion filtering. Cover F1 D/S suppression, missing dates, month-end H1B clamp, UTC bulletin rollover, leap days, DST, half-hour/quarter-hour zones, timezone edits, enrollment after 09:00, no backfill, date reversion and reopening.
- **D1/concurrency:** use a disposable local database, apply future migrations, and race overlapping cron/manual runs. Simulate crashes before request, after provider acceptance and before DB acknowledgment; lease expiry, 24h key expiry, changed payload, quota reservation races, deletion, unsubscribe and repeated webhooks. Assert one distinct send identity per occurrence and no retry of unknowns outside the safe window. Cover signed event rejection, replay, wrong-message association and out-of-order suppression.
- **Copy/privacy:** inspect English/Chinese text and HTML, escaped fields, no PII beyond approved task/date/recipient, no tracking or documents; verify unsubscribe and deletion note on every message including tests. Test token tampering, link scanners, anonymous unsubscribe, current app Access isolation and data-deletion workflow.
- **Implementation checks later:** `npm ci`, `npm test`, and `npx tsc --noEmit` for TypeScript work, per `AGENTS.md`, in an environment that permits Miniflare listeners. An EPERM startup failure is a blocked environment check, not a passing suite or a reason to weaken tests. No such commands are needed for this document.

| Phase | Scope and exit condition |
| --- | --- |
| **0 — this document** | Local design/evidence review and documentation commit only. No sends, signup, keys, DNS or deployment. |
| **1 — manual-trigger test** | Separate implementation authorization first; fake transport/local fixtures before network. Owner completes approved provider/domain/key setup. A private operator-only manual trigger uses the same ledger/send service and an exact synthetic/owner-test recipient allowlist, never a publicly callable scheduler endpoint. Actual owner test emails require approval of addresses and copy; no real-user email. Verify unsubscribe/deletion handling and failure simulations. |
| **2 — cron on staging** | Owner-approved isolated staging D1/resources, default-off production flag, synthetic data and approved test inboxes only. Enable hourly staging trigger; exercise timezones, duplicate invocations, signed bounces/complaints, quota stops and recovery. No production profile export into staging. Review observed placement/delays rather than promising deliverability. |
| **3 — production opt-in pilot** | Owner approves production migration/deployment, control endpoint, sender/copy and first recipient cohort. Verify reachable unsubscribe/webhooks, suppression, deletion handling, quota monitoring, backup/restore and kill switch before enabling. Start with explicitly consenting users; expand toward ~100 only after actual peak/day and month usage fits caps. This is a future approval gate, not authorization granted by this design task. |

Rollback: disable the sending flag immediately; leave dedup records, unsubscribe and bounce ingestion operational. Do not reset occurrence state or requeue accepted/unknown deliveries. Re-enabling continues prospectively. The owner reviews aggregate counts and sanitized error codes; no PII-bearing logs or automatic alert-email loops.

## 7. What still needs the owner

1. Approve the implementation scope and primary provider; perform signup/login and accept provider terms personally. Review privacy/retention/processing regions and whether account verification or billing is requested. No silent paid-plan substitution.
2. Identify an already-controlled sending domain/subdomain, approve DNS records and sender/Reply-To identity, and provision a scoped secret through the runtime secret store later. Do not buy a domain, create a key, change DNS or attach a card in Phase 0. MailChannels arbitrary-recipient fallback specifically needs payment-method approval (P6); without it, fallback remains test-only.
3. Choose the monitored deletion/support address and approve the operator deletion process, retention disclosures, bilingual copy, opt-in wording, timezone UX and the consequence of missed quota-limited reminders.
4. Approve a narrowly scoped public control endpoint and staging infrastructure only after reviewing concrete implementation, costs and authentication. Preserve the app's Access audience/policy and existing production bindings; no deployment/policy change is performed by this document.
5. Approve exact test recipients before any real send, then separately approve staging cron and production rollout/cohort. Approve any future spending explicitly; hitting a free quota stops sends and surfaces a status, never purchases capacity.

Remaining uncertainties are gates, not assumptions: provider account eligibility; owner domain/DNS access; actual daily/monthly workload; provider retention/deletion details; MailChannels idempotency/webhook verification; Gmail cost/Worker SMTP compatibility; Cloudflare verified-destination limits; AWS ownership/credits; control-endpoint cost and reachable setup. Items without successfully loaded official evidence are marked **UNVERIFIED** above.
