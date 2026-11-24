import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const profiles = sqliteTable(
  "profiles",
  {
    id: text("id").primaryKey(),
    owner: text("owner").notNull(),
    isPrimary: integer("is_primary", { mode: "boolean" }).notNull().default(false),
    displayName: text("display_name").notNull().default(""),
    lifecycleStage: text("lifecycle_stage").notNull(),
    statusSubtype: text("status_subtype").notNull().default(""),
    admissionBasis: text("admission_basis").notNull().default(""),
    programEndDate: text("program_end_date"),
    eadEndDate: text("ead_end_date"),
    i94ExpirationDate: text("i94_expiration_date"),
    passportExpirationDate: text("passport_expiration_date"),
    visaExpirationDate: text("visa_expiration_date"),
    priorityDate: text("priority_date"),
    greenCardSince: text("green_card_since"),
    greenCardExpirationDate: text("green_card_expiration_date"),
    naturalizationBasis: text("naturalization_basis").notNull().default("five_year"),
    extensionRequestedUntil: text("extension_requested_until"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("profiles_owner_id_idx").on(table.owner, table.id),
    uniqueIndex("profiles_owner_primary_idx")
      .on(table.owner)
      .where(sql`${table.isPrimary} = 1`),
    index("profiles_owner_idx").on(table.owner),
  ],
);

export const documents = sqliteTable(
  "documents",
  {
    id: text("id").primaryKey(),
    owner: text("owner").notNull(),
    profileId: text("profile_id").notNull().default(""),
    kind: text("kind").notNull().default("Other"),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    objectKey: text("object_key").notNull(),
    uploadedAt: text("uploaded_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("documents_owner_idx").on(table.owner),
    index("documents_owner_profile_idx").on(table.owner, table.profileId),
  ],
);

export const trackedCases = sqliteTable(
  "tracked_cases",
  {
    id: text("id").primaryKey(),
    owner: text("owner").notNull(),
    profileId: text("profile_id").notNull().default(""),
    receiptNumber: text("receipt_number").notNull(),
    formType: text("form_type").notNull().default(""),
    nickname: text("nickname").notNull().default(""),
    statusText: text("status_text").notNull().default("Not checked"),
    lastCheckedAt: text("last_checked_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("tracked_cases_owner_profile_receipt_idx").on(
      table.owner,
      table.profileId,
      table.receiptNumber,
    ),
    index("tracked_cases_owner_profile_idx").on(table.owner, table.profileId),
  ],
);

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    owner: text("owner").notNull(),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("sessions_owner_idx").on(table.owner)],
);

export const completedActions = sqliteTable(
  "completed_actions",
  {
    id: text("id").primaryKey(),
    owner: text("owner").notNull(),
    profileId: text("profile_id").notNull().default(""),
    actionKey: text("action_key").notNull(),
    completedAt: text("completed_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("completed_actions_owner_profile_key_idx").on(
      table.owner,
      table.profileId,
      table.actionKey,
    ),
  ],
);

export const agentTokens = sqliteTable("agent_tokens", {
  id: text("id").primaryKey(),
  owner: text("owner").notNull(),
  tokenHash: text("token_hash").notNull(),
  label: text("label").notNull(),
  scopes: text("scopes", { enum: ["read", "write"] }).notNull(),
  createdAt: text("created_at").notNull(),
  expiresAt: text("expires_at").notNull(),
  lastUsedAt: text("last_used_at"),
  revokedAt: text("revoked_at"),
}, (table) => [
  check("agent_tokens_scopes_check", sql`${table.scopes} IN ('read', 'write')`),
  uniqueIndex("agent_tokens_hash_idx").on(table.tokenHash),
  index("agent_tokens_owner_idx").on(table.owner),
]);

export const loginCodes = sqliteTable(
  "login_codes",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    codeHash: text("code_hash").notNull(),
    expiresAt: text("expires_at").notNull(),
    attempts: integer("attempts").notNull().default(0),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("login_codes_email_idx").on(table.email),
    index("login_codes_expires_at_idx").on(table.expiresAt),
  ],
);
