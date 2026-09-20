import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";
import { getRuntimeBindings } from "../lib/runtime-env";

export function getDb() {
  return drizzle(getRuntimeBindings().DB as Parameters<typeof drizzle>[0], { schema });
}

let initialization: Promise<void> | null = null;

export function ensureDatabase() {
  const d1 = getRuntimeBindings().DB;
  if (!initialization) {
    initialization = d1.batch([
      d1.prepare(`CREATE TABLE IF NOT EXISTS profiles (
        owner text PRIMARY KEY NOT NULL,
        display_name text DEFAULT '' NOT NULL,
        lifecycle_stage text NOT NULL,
        status_subtype text DEFAULT '' NOT NULL,
        admission_basis text DEFAULT '' NOT NULL,
        program_end_date text,
        ead_end_date text,
        i94_expiration_date text,
        passport_expiration_date text,
        visa_expiration_date text,
        priority_date text,
        green_card_since text,
        green_card_expiration_date text,
        naturalization_basis text DEFAULT 'five_year' NOT NULL,
        created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL
      )`),
      d1.prepare(`CREATE TABLE IF NOT EXISTS documents (
        id text PRIMARY KEY NOT NULL,
        owner text NOT NULL,
        kind text DEFAULT 'Other' NOT NULL,
        filename text NOT NULL,
        mime_type text NOT NULL,
        size_bytes integer NOT NULL,
        object_key text NOT NULL,
        uploaded_at text DEFAULT CURRENT_TIMESTAMP NOT NULL
      )`),
      d1.prepare("CREATE INDEX IF NOT EXISTS documents_owner_idx ON documents (owner)"),
      d1.prepare(`CREATE TABLE IF NOT EXISTS tracked_cases (
        id text PRIMARY KEY NOT NULL,
        owner text NOT NULL,
        receipt_number text NOT NULL,
        form_type text DEFAULT '' NOT NULL,
        nickname text DEFAULT '' NOT NULL,
        status_text text DEFAULT 'Not checked' NOT NULL,
        last_checked_at text,
        created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL
      )`),
      d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS tracked_cases_owner_receipt_idx ON tracked_cases (owner, receipt_number)"),
      d1.prepare(`CREATE TABLE IF NOT EXISTS completed_actions (
        id text PRIMARY KEY NOT NULL,
        owner text NOT NULL,
        action_key text NOT NULL,
        completed_at text DEFAULT CURRENT_TIMESTAMP NOT NULL
      )`),
      d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS completed_actions_owner_key_idx ON completed_actions (owner, action_key)"),
    ]).then(() => undefined).catch((error: unknown) => {
      initialization = null;
      throw error;
    });
  }
  return initialization;
}
