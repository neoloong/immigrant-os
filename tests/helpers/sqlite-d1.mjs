import { DatabaseSync } from "node:sqlite";

// Real SQLite SQL execution for tests that must also run without local sockets.
// This only adapts the D1 binding shape; Miniflare tests remain required as well.
export function sqliteD1() {
  const database = new DatabaseSync(":memory:");
  function prepare(sql, args = []) {
    return {
      bind: (...values) => prepare(sql, values),
      async run() { return { success: true, meta: database.prepare(sql).run(...args) }; },
      async all() { return { success: true, results: database.prepare(sql).all(...args) }; },
      async raw() { return database.prepare(sql).all(...args).map((row) => Object.values(row)); },
      async first() { return database.prepare(sql).get(...args) ?? null; },
    };
  }
  return { prepare, async batch(statements) {
    database.exec("BEGIN");
    try { const results = []; for (const statement of statements) results.push(await statement.run()); database.exec("COMMIT"); return results; }
    catch (error) { database.exec("ROLLBACK"); throw error; }
  }, exec: (sql) => database.exec(sql), close: () => database.close() };
}
