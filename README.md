# Immigrant OS

Immigrant OS is a private pilot for immigrants organizing their own U.S. immigration case dates, checklist, receipts, and documents. Start with a nickname and the dates you know; add details later. It currently runs on ChatGPT Sites using vinext, a Cloudflare Worker, D1, R2, and Drizzle.

## What works today

- Save and edit a personal profile for F-1 / OPT, H-1B / H-4, the green card process, permanent residence, or citizenship. Each module is beta and covers a limited set of administrative checks.
- Build a lifecycle checklist from saved dates, inspect its inputs and official reference links, and mark actions complete or reopen them. Changing an action's date creates a new completion key.
- Save USCIS receipt numbers with form types and labels, update labels by adding the same receipt again, remove receipts, and open the official USCIS case-status website.
- Upload, download, and delete per-account PDF, JPEG, and PNG files, up to 10 MB per file. Uploads are optional; enter profile dates manually.
- Ask a rule-based assistant about the saved checklist and missing profile information.
- Export open, dated checklist actions as an all-day `.ics` snapshot, or print the action plan. Calendar imports do not sync later edits or include notification alarms.

Scheduled reminders, automatic USCIS status updates, AI/OCR, and MCP integrations are not implemented.

## Privacy

Your data is not sold. Profiles, receipts, checklist completion records, and files are scoped to your signed-in account. File listing, download, and deletion check account ownership; stored files use an account-specific object-key prefix. These controls depend on a trusted sign-in system and private storage configuration. They are not end-to-end encryption.

The current Site remains owner-private. Independent hosting needs the authentication integration and real two-account verification described in the hosting guide before pilot invitations. Local development uses a shared preview identity, so use synthetic data locally.

## Disclaimer

Immigrant OS is not a law firm and does not provide legal advice or determine eligibility to apply, file, work, travel, or remain in the United States. Dates and checklist planning cues are based on user-entered data and official sources linked in-product; they are not verified filing deadlines. No scheduled reminder service is provided.

Check the current official instructions and your records. For individual advice, consult a qualified immigration attorney, accredited representative, DSO, or employer counsel as appropriate. The [content audit](docs/content-audit.md) records source coverage and wording that still needs review.

## Run locally

Use Node.js **22.13.0 or later** and npm on macOS or Linux. From the repository root:

```sh
npm ci
npm run dev
```

Open the localhost URL printed by Vite. The development server emulates D1 and R2 locally and uses a preview account on localhost; it does not require a Cloudflare account login. The legacy `npm run install:ci` helper is Linux-only; use `npm ci` on either platform.

```sh
npm run build
npm test
npx tsc --noEmit
```

The build compiles the app and validates the Sites Worker artifact. `npm test` rebuilds before running the tests. `npm run start` starts the built vinext app; production authentication does not use the development preview identity. `npm run validate:artifact` rechecks an existing build, and `npm run db:generate` generates SQL migrations after schema edits (it does not apply them to a database).

## Self-hosting

The owner plans to move to independent Cloudflare hosting. Follow the ordered [Cloudflare hosting preparation guide](docs/cloudflare-hosting.md) for the missing configuration, Access email-PIN integration, D1 migrations, R2, and smoke tests. This repository is not ready for a direct public deploy: the session-verification primitives exist, but the login flow that issues sessions is still missing. A GitHub push does not deploy the current Site. See also [operations](docs/operations.md).

## Agent connections

The optional remote MCP endpoint is disabled by default. See [agent setup and operator activation](docs/agent-mcp.md), the public `/agents` guide, and the [starter prompt](docs/agent-prompt.md).
