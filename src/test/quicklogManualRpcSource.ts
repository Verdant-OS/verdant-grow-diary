import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const migrationsDirectory = resolve(__dirname, "../../supabase/migrations");

type FunctionDefinition = { path: string; sql: string; body: string };

function latestFunctionDefinition(name: string): FunctionDefinition | null {
  if (!existsSync(migrationsDirectory)) return null;

  const definition = new RegExp(
    `CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+public\\.\\"?${name}\\"?\\s*\\([\\s\\S]*?AS\\s+(\\$[a-z_]*\\$)([\\s\\S]*?)\\1`,
    "i",
  );

  for (const filename of readdirSync(migrationsDirectory).sort().reverse()) {
    if (!filename.endsWith(".sql")) continue;
    const path = join(migrationsDirectory, filename);
    const sql = readFileSync(path, "utf8");
    const match = definition.exec(sql);
    if (match) return { path, sql, body: match[2] };
  }
  return null;
}

/** Resolve the public entrypoint and the current delegate it invokes. */
export function currentQuicklogManualRpcSource(): {
  path: string;
  sql: string;
  body: string;
} | null {
  const wrapper = latestFunctionDefinition("quicklog_save_manual");
  if (!wrapper) return null;

  if (!/public\.quicklog_save_manual_pre_logged_at\s*\(/i.test(wrapper.body)) {
    return wrapper;
  }

  const delegate = latestFunctionDefinition("quicklog_save_manual_pre_logged_at");
  if (!delegate) {
    throw new Error("Quick Log manual wrapper calls a delegate with no SQL definition");
  }

  return {
    path: wrapper.path,
    sql: `${delegate.sql}\n${wrapper.sql}`,
    body: `${delegate.body}\n${wrapper.body}`,
  };
}
