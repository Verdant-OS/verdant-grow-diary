// Pure rule: every persistent public table must state its Data API access
// in a migration, as a table-level GRANT (for the roles that read or write it)
// or a full REVOKE ALL (when only SECURITY DEFINER code touches it). A partial
// REVOKE (say INSERT, UPDATE, DELETE) does not count: it leaves reads on the
// inherited default, which a new hosted table no longer has.
//
// Why: from 2026-10-30 Supabase stops granting new public tables, functions
// and sequences to anon/authenticated/service_role by default
// (https://supabase.com/docs/guides/api/securing-your-api). A hosted table
// created after that date with no GRANT returns 42501 to the app. Locally,
// supabase/seed.sql grants every table after replay, so no local DB lane can
// see the gap; this static rule is the only check that does.
//
// Schema-wide statements (GRANT ... ON ALL TABLES IN SCHEMA, ALTER DEFAULT
// PRIVILEGES ... ON TABLES) are not a decision about one table and do not count.
// ACL text inside a comment or a single-quoted string literal does not count.
// Dollar-quoted bodies are scanned as SQL, so dynamic DDL in a DO block still
// counts. Known ceiling: a GRANT written as prose inside a dollar-quoted
// literal (COMMENT ... IS $c$...$c$) would be counted.

const IDENT = String.raw`(?:"(?:[^"]|"")+"|[a-zA-Z_][a-zA-Z0-9_$]*)`;
const PUBLIC_NAME = String.raw`(?:public|"public")\s*\.\s*(${IDENT})`;
const CREATE_RE = new RegExp(
  String.raw`\bCREATE\s+(?:UNLOGGED\s+)?TABLE\s+(IF\s+NOT\s+EXISTS\s+)?${PUBLIC_NAME}`,
  "gi",
);
const DROP_RE = /\bDROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?([^;]*)/gi;
const ACL_RE =
  /\b(GRANT|REVOKE)\b([^;]*?)\bON\s+(?!(?:ALL\s+)?(?:TABLES|FUNCTIONS?|ROUTINES?|PROCEDURES?|SEQUENCES?|SCHEMAS?|TYPES?|DOMAINS?|LANGUAGE|FOREIGN|LARGE|DATABASE|TABLESPACE)\b)(?:TABLE\s+)?([^;]*?)\s+(?:TO|FROM)\b/gi;
const TARGET_RE = new RegExp(String.raw`^\s*(?:(?:public|"public")\s*\.\s*)?(${IDENT})\s*$`, "i");
const PUBLIC_TARGET_RE = new RegExp(String.raw`^\s*${PUBLIC_NAME}`, "i");
const REVOKE_ALL_RE = /^\s*ALL(?:\s+PRIVILEGES)?\s*$/i;

/**
 * Tables created before this rule existed that still inherit the hosted
 * project's legacy default privileges, each bound to the migration that
 * created it. They exist in production, where existing tables keep their
 * grants after 2026-10-30, and seed.sql restores them on local replay. A
 * table dropped and recreated later is a new table and needs its own ACL.
 * This list may only shrink: give a table an explicit GRANT/REVOKE in a new
 * migration and remove it here.
 */
export const LEGACY_DEFAULT_PRIVILEGE_TABLES = Object.freeze(
  [
    ["alert_events", "20260520234331_06b08698-1358-48b4-9c91-335d8913458a.sql"],
    ["alerts", "20260520233437_40d368dc-f696-42ac-bd37-7efcb94eccb1.sql"],
    ["diary_entries", "20260515173341_0c573a48-5b45-4310-897b-4a65f8a4ecdb.sql"],
    ["environment_events", "20260518152526_4236167d-2942-4166-91f3-09be993ca92d.sql"],
    ["feeding_events", "20260518152526_4236167d-2942-4166-91f3-09be993ca92d.sql"],
    ["grow_events", "20260518152526_4236167d-2942-4166-91f3-09be993ca92d.sql"],
    ["grow_targets", "20260520225333_57f23225-fcb9-4173-9715-1d52904d9487.sql"],
    ["grows", "20260515173341_0c573a48-5b45-4310-897b-4a65f8a4ecdb.sql"],
    ["harvests", "20260515205725_3c724eb0-98de-4c17-a571-59e7b8b1a584.sql"],
    ["nug_events", "20260515204616_dba9604f-080f-4b98-a10f-5bd0f73dbae7.sql"],
    ["observation_events", "20260518152526_4236167d-2942-4166-91f3-09be993ca92d.sql"],
    ["photo_events", "20260518152526_4236167d-2942-4166-91f3-09be993ca92d.sql"],
    ["pi_ingest_bridge_credentials", "20260523062559_300cfcfa-46b2-45f7-84f4-0df1db6bd605.sql"],
    ["pi_ingest_idempotency_keys", "20260523060642_98031981-ea3e-49d2-a147-f9fcddb4c7e7.sql"],
    ["plants", "20260516204601_eb069c76-870d-4f19-8d23-800be7bbfe01.sql"],
    ["profiles", "20260515204616_dba9604f-080f-4b98-a10f-5bd0f73dbae7.sql"],
    ["sensor_readings", "20260516204601_eb069c76-870d-4f19-8d23-800be7bbfe01.sql"],
    ["tents", "20260516204601_eb069c76-870d-4f19-8d23-800be7bbfe01.sql"],
    ["training_events", "20260518152526_4236167d-2942-4166-91f3-09be993ca92d.sql"],
    ["unlocks", "20260515204616_dba9604f-080f-4b98-a10f-5bd0f73dbae7.sql"],
    ["user_quests", "20260515204616_dba9604f-080f-4b98-a10f-5bd0f73dbae7.sql"],
    ["watering_events", "20260518152526_4236167d-2942-4166-91f3-09be993ca92d.sql"],
  ].map(([table, migration]) => Object.freeze({ table, migration })),
);

// Unquoted identifiers fold to lower case; quoted ones keep their case.
function identName(raw) {
  return raw.startsWith('"') ? raw.slice(1, -1).replace(/""/g, '"') : raw.toLowerCase();
}

// Blank comments (nested block comments included) and, separately, single-
// quoted literals (standard and E'' escapes) to spaces of the same length, so
// match indices line up with the raw SQL. Dollar quotes are left as SQL.
function maskSql(sql) {
  const code = sql.split("");
  const blank = (from, to) => {
    for (let k = from; k < to; k++) if (code[k] !== "\n") code[k] = " ";
  };
  let i = 0;
  while (i < sql.length) {
    if (sql.startsWith("--", i)) {
      const end = sql.indexOf("\n", i);
      const stop = end === -1 ? sql.length : end;
      blank(i, stop);
      i = stop;
    } else if (sql.startsWith("/*", i)) {
      let depth = 1;
      let j = i + 2;
      while (j < sql.length && depth > 0) {
        if (sql.startsWith("/*", j)) (depth++, (j += 2));
        else if (sql.startsWith("*/", j)) (depth--, (j += 2));
        else j++;
      }
      blank(i, j);
      i = j;
    } else if (sql[i] === "'") {
      const escapes = i > 0 && /[eE]/.test(sql[i - 1]) && !/[a-zA-Z0-9_]/.test(sql[i - 2] ?? "");
      let j = i + 1;
      while (j < sql.length) {
        if (escapes && sql[j] === "\\") j += 2;
        else if (sql[j] === "'" && sql[j + 1] === "'") j += 2;
        else if (sql[j] === "'") break;
        else j++;
      }
      blank(i, j + 1);
      i = j + 1;
    } else {
      i++;
    }
  }
  return code.join("");
}

/**
 * @param {{ name: string, sql: string }[]} migrations in apply order
 * @returns {{ table: string, migration: string }[]} persistent public tables
 *   with no table-level GRANT/REVOKE after their latest CREATE, sorted by table
 */
export function findTablesWithoutExplicitAcl(migrations) {
  const tables = new Map(); // table -> { migration, acl }
  for (const m of migrations) {
    const code = maskSql(m.sql);
    const events = [];
    for (const match of code.matchAll(CREATE_RE)) {
      events.push({
        kind: "create",
        conditional: Boolean(match[1]),
        table: identName(match[2]),
        index: match.index,
      });
    }
    for (const match of code.matchAll(DROP_RE)) {
      for (const target of match[1].split(",")) {
        const name = PUBLIC_TARGET_RE.exec(target);
        if (name) events.push({ kind: "drop", table: identName(name[1]), index: match.index });
      }
    }
    for (const match of code.matchAll(ACL_RE)) {
      if (match[1].toUpperCase() === "REVOKE" && !REVOKE_ALL_RE.test(match[2])) continue;
      for (const target of match[3].split(",")) {
        const name = TARGET_RE.exec(target);
        if (name) events.push({ kind: "acl", table: identName(name[1]), index: match.index });
      }
    }
    events.sort((a, b) => a.index - b.index);
    for (const event of events) {
      if (event.kind === "create") {
        // CREATE TABLE IF NOT EXISTS on a table that already exists is a no-op
        // and keeps that table's grants.
        if (event.conditional && tables.has(event.table)) continue;
        tables.set(event.table, { migration: m.name, acl: false });
      } else if (event.kind === "drop") {
        tables.delete(event.table);
      } else {
        const state = tables.get(event.table);
        if (state) state.acl = true;
      }
    }
  }
  return [...tables]
    .filter(([, info]) => !info.acl)
    .map(([table, info]) => ({ table, migration: info.migration }))
    .sort((a, b) => (a.table < b.table ? -1 : a.table > b.table ? 1 : 0));
}
