import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const profiles = sqliteTable("profiles", {
  owner: text("owner").primaryKey(),
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
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const documents = sqliteTable(
  "documents",
  {
    id: text("id").primaryKey(),
    owner: text("owner").notNull(),
    kind: text("kind").notNull().default("Other"),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    objectKey: text("object_key").notNull(),
    uploadedAt: text("uploaded_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("documents_owner_idx").on(table.owner)],
);

export const trackedCases = sqliteTable(
  "tracked_cases",
  {
    id: text("id").primaryKey(),
    owner: text("owner").notNull(),
    receiptNumber: text("receipt_number").notNull(),
    formType: text("form_type").notNull().default(""),
    nickname: text("nickname").notNull().default(""),
    statusText: text("status_text").notNull().default("Not checked"),
    lastCheckedAt: text("last_checked_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("tracked_cases_owner_receipt_idx").on(table.owner, table.receiptNumber),
  ],
);

export const completedActions = sqliteTable(
  "completed_actions",
  {
    id: text("id").primaryKey(),
    owner: text("owner").notNull(),
    actionKey: text("action_key").notNull(),
    completedAt: text("completed_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("completed_actions_owner_key_idx").on(table.owner, table.actionKey),
  ],
);
