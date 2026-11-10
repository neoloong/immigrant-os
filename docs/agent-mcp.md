# Agent connections: implementation and operator activation

The `agent-mcp` branch adds personal agent tokens, six remote MCP tools, signed-in **Settings → Connect your agent**, the public `/agents` guide and `/llms.txt` discovery. It starts from `independent-hosting` at `83ac8c5`. No deployment, push, merge, Access-policy change or production binding change is part of this work.

## Protocol and account boundaries

The Worker handles **only `/mcp`** with bearer authentication before the existing web Access bridge. The public `/agents` and `/llms.txt` routes serve standalone content and disclose no account data. `/api/agent-tokens` passes through the existing Access/session or dispatch authentication. Bearer credentials cannot manage tokens or access existing web APIs. Every data operation uses the owner resolved from the token hash; tools accept no owner, object key, file ID or arbitrary URL.

The implementation is a small, dependency-free JSON-RPC handler using the JSON-response option of [MCP Streamable HTTP](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports). It supports `initialize`, `notifications/initialized`, `ping`, `tools/list`, and `tools/call`. Negotiation supports `2025-03-26`, `2025-06-18` and `2025-11-25`, preferring `2025-11-25`. Later protocol revisions require a separate compatibility review; they are not advertised. No server-initiated messages, SSE stream, resumability, session ID, OAuth discovery, or batch calls. Authenticated GET/DELETE return 405; accepted notifications return empty 202 and never execute tools.

POST clients send `Content-Type: application/json` and `Accept: application/json, text/event-stream`. After initialization, send `MCP-Protocol-Version` with the negotiated revision. Each call authenticates again. Missing/unknown/expired/revoked bearer tokens return 401 with a Bearer challenge. A request Origin, if supplied, must match the endpoint origin; cross-site fetches fail. Server-to-server clients normally omit Origin. There is no cross-origin browser CORS interface. Responses are `private, no-store`; RPC bodies are limited to 32 KiB. Errors do not include database details or credentials.

A hand-written handler keeps the six-tool audit surface small and adds no dependencies. Scope/schema checks, date validation and account isolation are enforced server-side; model instructions and tool annotations are not authorization controls.

## Tokens and data

Tokens contain a prefix plus 32 random bytes, encoded as hexadecimal. Only the SHA-256 digest is persisted in D1; raw tokens appear only in the create response and component memory until dismissed or unmounted. Listing returns metadata, never a token or digest. Every token expires after **90 days**; re-create to rotate. Read scope exposes four read tools; write includes read and the two write tools. Revocation is soft deletion so metadata remains visible, and the next request fails. Already-authorized in-flight requests may finish.

Migration `drizzle/0002_agent_tokens.sql` adds the token table, owner/hash indexes, scope constraint and `expires_at` in addition to the fields requested in the brief. `db/index.ts` also includes the table for the app's existing fresh-database bootstrap path. Apply the migration before serving traffic, as with existing migrations.

| Tool | Scope | Data returned / changed |
| --- | --- | --- |
| `get_profile` | read | Saved profile fields; no owner or internal timestamps |
| `get_action_plan` | read | Open web tasks: ID, title, due date, open status, official source |
| `list_documents` | read | Type, filename, upload date only; no content, IDs or storage keys |
| `list_cases` | read | Receipt numbers and official USCIS status links; no live status fetch |
| `update_profile_dates` | write | Partial update to existing profile's date/status fields; returns saved fields and open actions |
| `add_case` | write | Web receipt normalization/upsert, optional form/nickname; returns receipt and official link |

Profile and case writes share `lib/workspace.ts` with web routes. Profile validation remains `normalizeProfile`; both web and MCP plans use `loadPlan` → `buildPlan`. Date changes naturally get new completion keys, reopening the affected task just as in the web flow. This preserves the existing behavior if a user later reverts to a previously completed date. No new eligibility engine, date formula, legal analysis or source text is introduced. A task title may already ask the user to review naturalization eligibility with official guidance; it is not a determination. Arbitrary user-entered profile text and filenames remain user data, not verified assertions or instructions.

## Onboarding

`/agents` shows the current origin's MCP URL, Claude/Cowork custom-connector steps, a generic HTTP config and the same starter prompt as [agent-prompt.md](agent-prompt.md). [Claude's official custom-connector guide](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp) documents fixed credentials in Request headers. Choose a personal connector and set `Authorization: Bearer <token>`; never paste the token into a conversation. Organization-shared fixed headers can expose that account to other members. A client without custom bearer-header support cannot use this integration; OAuth-only clients are not supported by this change.

The guide and discovery remain readable when MCP is off, and clearly state it is disabled. Weekly checks require a separate schedule in the user's agent; this server does not schedule or send notifications.

## Operator steps (not performed)

1. Review the local `agent-mcp` commit. Run `npm ci`, `npm test`, and `npx tsc --noEmit` in a listener-capable environment. Existing Miniflare D1/R2 tests must pass before activation. Run the connector smoke test below and inspect Settings on desktop/mobile, including copy, dismissal and revoke.
2. Back up D1 using the existing operations procedure, then apply pending D1 migrations, including `0002_agent_tokens.sql`, to the existing database. Use the existing Worker, D1 and R2 bindings; no new external service is needed.
3. Deploy through the operator's approved process with **`AGENT_MCP_ENABLED="false"`** (the committed default). An absent flag or any other value remains off. Confirm `/mcp` returns 404 and no tokens can be created. The Access bridge, policy, bindings and audience were not changed here.
4. Verify that remote agent requests can reach the exact `/mcp` Worker route. An upstream Cloudflare Access login challenge cannot be satisfied by the app's personal token. If the current policy intercepts this route, keep MCP off until the owner authorizes a narrowly scoped routing/policy solution for `/mcp`; preserve Access protection on all web/auth/token-management routes and the existing Site audience. The public guide/discovery may likewise be intercepted upstream despite being public within the Worker. Do not bypass the entire app.
5. After validation and authorized reachability are in place, set the Worker environment variable **`AGENT_MCP_ENABLED="true"`** via the operator's deployment process. Create a read token in Settings. Initialize with the payload below, list tools and read the action plan. Add a write token to verify a confirmed profile correction and test receipt, and compare the plan in the web app. Verify two separate accounts cannot see/change each other's profile, cases, documents or tokens. Confirm revoke and expiry both produce 401. Remove test records/tokens afterward.
6. Roll back access immediately by setting the flag to `"false"`; this disables the endpoint and token management. To invalidate credentials as well, revoke tokens while enabled or use an authorized database operation. Existing tokens remain stored and can work again after re-enabling until revoked/expired. Do not drop account data or the migration during rollback.

Example request body (send the bearer header using your client's secret facility, not a saved command or committed file):

```json
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"operator-check","version":"1.0"}}}
```

Then send `notifications/initialized` without an ID, followed by `tools/list` and `tools/call` with IDs. No token belongs in the URL, prompt, logs, Git, screenshots or support transcripts.

## Local test coverage

`tests/agent-mcp.test.mjs` invokes the built Worker with real in-memory SQLite through a minimal D1-shaped adapter. It applies all SQL migrations and tests token hash-only storage, creation/list/revoke/expiry, session ownership, auth failures, protocol validation, read/write scopes, two-account reads/writes, metadata-only documents, receipt upserts, profile validation/completion reopening and exact parity with web action dates/sources across all five stages. It also verifies the guide and prompt stay consistent. This listener-free SQL coverage supplements, rather than replaces, the unchanged Miniflare integration suites.
