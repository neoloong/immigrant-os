import { desc, eq } from "drizzle-orm";
import { ensureDatabase, getDb } from "../db";
import { documents, trackedCases } from "../db/schema";
import { authenticateAgent, PRIVATE_HEADERS } from "./agent-tokens";
import { normalizeProfile, LIFECYCLE_STAGES } from "./profile";
import { loadPlan, loadProfile, saveCase, saveProfile } from "./workspace";

const VERSIONS = ["2025-03-26", "2025-06-18", "2025-11-25"];
const LIMITATION = "Saved records, dates, tasks and official sources only. No eligibility determinations, legal advice, or filing-date calculations beyond the web app.";
const dateSchema = { type: ["string", "null"], pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "Date from your records (YYYY-MM-DD); null clears it." };
const dateFields = ["programEndDate", "eadEndDate", "i94ExpirationDate", "passportExpirationDate", "visaExpirationDate", "priorityDate", "greenCardSince", "greenCardExpirationDate"];
const statusFields = ["lifecycleStage", "statusSubtype", "admissionBasis", "naturalizationBasis"];
const updateProperties = {
  ...Object.fromEntries(dateFields.map((field) => [field, dateSchema])),
  lifecycleStage: { type: "string", enum: LIFECYCLE_STAGES },
  statusSubtype: { type: "string", maxLength: 40 },
  admissionBasis: { type: "string", maxLength: 30 },
  naturalizationBasis: { type: "string", maxLength: 20 },
};
function tool(name: string, description: string, write = false, properties = {}, required: string[] = []) {
  return { name, description: `${description} ${LIMITATION}`,
    inputSchema: { type: "object", properties, required, additionalProperties: false },
    annotations: { readOnlyHint: !write, destructiveHint: write, idempotentHint: true, openWorldHint: false } };
}
export const AGENT_TOOLS = [
  tool("get_profile", "Read your saved profile fields; these are user-entered records, not verified findings."),
  tool("get_action_plan", "Read open tasks, dates, status and official rule sources from your web action plan. Planning reminders are not legal filing deadlines."),
  tool("list_documents", "List document type, name and upload date only. Does not read file contents."),
  tool("list_cases", "List your saved USCIS receipts and official status-page links. Does not fetch live statuses."),
  tool("update_profile_dates", "Update only your saved date/status fields using web validation and task recalculation. Requires write scope; changed task dates reopen completion. Requires an existing profile.", true, updateProperties),
  tool("add_case", "Save a USCIS receipt to your account; optional labels follow the web flow. Requires write scope.", true,
    { receiptNumber: { type: "string", description: "USCIS receipt: 3 letters and 10 digits (spaces/hyphens accepted)." }, formType: { type: "string", maxLength: 30 }, nickname: { type: "string", maxLength: 80 } }, ["receiptNumber"]),
];

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
const caseRecord = (row: { receiptNumber: string }) => ({ receiptNumber: row.receiptNumber,
  statusUrl: `https://egov.uscis.gov/casestatus/mycasestatus.do?appReceiptNum=${encodeURIComponent(row.receiptNumber)}` });
async function openActions(owner: string) {
  const plan = await loadPlan(owner);
  return plan?.items.filter((item) => !item.completed).map((item) => ({
    id: item.id, title: item.title, dueDate: item.dueDate, status: "open", source: item.source,
  })) ?? [];
}

class ToolInputError extends Error {}
async function executeTool(name: string, owner: string, args: Record<string, unknown>) {
  if (name === "get_profile") {
    const profile = await loadProfile(owner);
    return { profile: profile ? normalizeProfile(profile) : null };
  }
  if (name === "get_action_plan") return { actions: await openActions(owner) };
  if (name === "list_documents") {
    await ensureDatabase();
    return { documents: await getDb().select({ type: documents.kind, name: documents.filename, date: documents.uploadedAt })
      .from(documents).where(eq(documents.owner, owner)).orderBy(desc(documents.uploadedAt)) };
  }
  if (name === "list_cases") {
    await ensureDatabase();
    const rows = await getDb().select({ receiptNumber: trackedCases.receiptNumber }).from(trackedCases)
      .where(eq(trackedCases.owner, owner)).orderBy(desc(trackedCases.createdAt));
    return { cases: rows.map(caseRecord) };
  }
  if (name === "update_profile_dates") {
    if (!Object.keys(args).length) throw new ToolInputError("Provide at least one date or status field.");
    for (const [key, value] of Object.entries(args)) {
      if (dateFields.includes(key) && value !== null && (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))) throw new ToolInputError("Use YYYY-MM-DD dates or null.");
      if (statusFields.includes(key) && typeof value !== "string") throw new ToolInputError("Status fields must be strings.");
    }
    const current = await loadProfile(owner);
    if (!current) throw new ToolInputError("Create your profile in the web app first.");
    let normalized;
    try { normalized = normalizeProfile({ ...current, ...args }); }
    catch { throw new ToolInputError("Invalid profile date or status. Check the web profile fields."); }
    // saveProfile performs the same normalization again at the persistence boundary.
    await saveProfile(owner, normalized);
    return { profile: normalized, actions: await openActions(owner) };
  }
  if (typeof args.receiptNumber !== "string" || !/^[A-Z]{3}\d{10}$/.test(args.receiptNumber.replace(/[^a-zA-Z0-9]/g, "").toUpperCase()) ||
    ["formType", "nickname"].some((key) => key in args && typeof args[key] !== "string")) throw new ToolInputError("Enter a USCIS receipt (3 letters and 10 digits) and optional text labels.");
  return { case: caseRecord(await saveCase(owner, args)) };
}

// Stateless Streamable HTTP, pinned to the initialize-based MCP revisions.
// JSON responses are permitted by the transport; no SSE/session store is needed.
export async function handleMcp(request: Request, enabled: boolean): Promise<Response> {
  const json = (body: unknown, status = 200, extra = {}) => Response.json(body, { status, headers: { ...PRIVATE_HEADERS, ...extra } });
  const rpcError = (id: unknown, code: number, message: string, status = 200) => json({ jsonrpc: "2.0", id, error: { code, message } }, status);
  if (!enabled) return json({ error: "Not found." }, 404);
  const origin = request.headers.get("origin");
  if ((origin && origin !== new URL(request.url).origin) || request.headers.get("sec-fetch-site") === "cross-site") return json({ error: "Invalid request origin." }, 403);
  let auth;
  try { auth = await authenticateAgent(request); }
  catch { return json({ error: "Agent service unavailable." }, 503); }
  if (!auth) return json({ error: "A valid agent bearer token is required." }, 401, { "www-authenticate": 'Bearer realm="immigrant-os"' });
  if (request.method !== "POST") return new Response(null, { status: 405, headers: { ...PRIVATE_HEADERS, allow: "POST" } });
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") return rpcError(null, -32600, "Use application/json.", 415);
  const accept = request.headers.get("accept") ?? "";
  if (!["application/json", "text/event-stream"].every((type) => accept.split(",").some((part) => part.trim().split(";")[0] === type))) return rpcError(null, -32600, "Accept application/json and text/event-stream.", 406);
  const version = request.headers.get("mcp-protocol-version");
  if (version && !VERSIONS.includes(version)) return rpcError(null, -32600, "Unsupported MCP protocol version.", 400);
  let message: unknown;
  try {
    // Bound the streamed body too, rather than trusting Content-Length.
    const reader = request.body?.getReader();
    if (!reader) return rpcError(null, -32700, "Invalid JSON.", 400);
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 32_768) { await reader.cancel(); return rpcError(null, -32600, "Request too large.", 413); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    message = JSON.parse(new TextDecoder().decode(bytes));
  } catch { return rpcError(null, -32700, "Invalid JSON.", 400); }
  if (!record(message) || message.jsonrpc !== "2.0" || typeof message.method !== "string" ||
    ("id" in message && typeof message.id !== "string" && !(typeof message.id === "number" && Number.isFinite(message.id))) ||
    ("params" in message && !record(message.params))) return rpcError(null, -32600, "Invalid JSON-RPC request.", 400);
  if (!("id" in message)) {
    // Notifications never execute tools, including write tools.
    if (["notifications/initialized", "notifications/cancelled"].includes(message.method)) return new Response(null, { status: 202, headers: PRIVATE_HEADERS });
    return rpcError(null, -32600, "Unsupported notification.", 400);
  }
  const id = message.id, params = (message.params ?? {}) as Record<string, unknown>;
  const result = (value: unknown) => json({ jsonrpc: "2.0", id, result: value });
  if (message.method === "initialize") {
    if (typeof params.protocolVersion !== "string" || !record(params.capabilities) || !record(params.clientInfo) || typeof params.clientInfo.name !== "string" || typeof params.clientInfo.version !== "string") return rpcError(id, -32602, "Invalid initialize parameters.");
    return result({ protocolVersion: VERSIONS.includes(params.protocolVersion) ? params.protocolVersion : "2025-11-25",
      capabilities: { tools: { listChanged: false } }, serverInfo: { name: "immigrant-os", version: "1.0.0" }, instructions: LIMITATION });
  }
  if (message.method === "ping") return result({});
  if (message.method === "tools/list") return result({ tools: AGENT_TOOLS.filter((tool) => auth.scopes === "write" || tool.annotations.readOnlyHint) });
  if (message.method !== "tools/call") return rpcError(id, -32601, "Method not found.");
  const definition = AGENT_TOOLS.find((tool) => tool.name === params.name);
  if (!definition) return rpcError(id, -32602, "Unknown tool.");
  if (!definition.annotations.readOnlyHint && auth.scopes !== "write") return rpcError(id, -32003, "Write scope is required.");
  const args = params.arguments === undefined ? {} : params.arguments;
  if (!record(args) || Object.keys(args).some((key) => !Object.hasOwn(definition.inputSchema.properties, key)) ||
    definition.inputSchema.required.some((key) => !Object.hasOwn(args, key))) return rpcError(id, -32602, "Invalid tool arguments. Only declared fields are accepted.");
  try {
    const output = await executeTool(definition.name, auth.owner, args);
    return result({ content: [{ type: "text", text: JSON.stringify(output) }], structuredContent: output, isError: false });
  } catch (error) {
    return result({ content: [{ type: "text", text: error instanceof ToolInputError ? error.message : "Unable to load or save your workspace. Please try again." }], isError: true });
  }
}
