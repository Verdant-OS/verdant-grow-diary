// Pure rule: every persistent public table must state its Data API access
// in a migration, as a table-level GRANT (for the roles that read or write it)
// or a full REVOKE ALL (when only SECURITY DEFINER code touches it). A partial
// REVOKE (say INSERT, UPDATE, DELETE) or a column-level GRANT/REVOKE does not
// count: it leaves the rest of the table on the inherited default, which a new
// hosted table no longer has. An unqualified table name counts as public (the
// default search_path); a name in any other schema is out of scope.
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
//
// The scan fails closed. CREATE is read from the SQL with only comments
// removed, so a table created anywhere, even in a function body, is tracked.
// Everything that can clear a table's requirement (a removal, a rename, a
// GRANT or REVOKE) counts only where it runs at migration time: top-level
// statements, DO blocks, and a literal string handed straight to EXECUTE.
// Text in comments, string literals, function or procedure bodies, and other
// dollar-quoted strings (COMMENT ... IS $c$...$c$) never clears it. A statement
// assembled at run time (EXECUTE format(...)) cannot be read, so the table is
// reported; give it a plain GRANT statement.
//
// Precondition: migrations run with public first on search_path, so an
// unqualified name is read as public. SET search_path is not modelled. Under
// SET search_path = other, an unqualified GRANT on a name that also exists in
// public would be credited to the public table. Schema-qualify names in any
// migration that changes search_path.

const IDENT = String.raw`(?:"(?:[^"]|"")+"|[a-zA-Z_][a-zA-Z0-9_$]*)`;
// Optional schema, then the name: group 1 is the schema, group 2 the table.
const QUALIFIED = String.raw`(?:(${IDENT})\s*\.\s*)?(${IDENT})`;
const CREATE_RE = new RegExp(
  String.raw`\bCREATE\s+(?:UNLOGGED\s+)?TABLE\s+(IF\s+NOT\s+EXISTS\s+)?${QUALIFIED}`,
  "gi",
);
// ALTER TABLE ... RENAME TO keeps the table and its grants under the new name.
// RENAME TO takes no schema; RENAME COLUMN and RENAME CONSTRAINT do not match.
const RENAME_RE = new RegExp(
  String.raw`\bALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?${QUALIFIED}\s+RENAME\s+TO\s+(${IDENT})`,
  "gi",
);
const DROP_RE = /\bDROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?([^;]*)/gi;
const ACL_RE =
  /\b(GRANT|REVOKE)\b([^;]*?)\bON\s+(?!(?:ALL\s+)?(?:TABLES|FUNCTIONS?|ROUTINES?|PROCEDURES?|SEQUENCES?|SCHEMAS?|TYPES?|DOMAINS?|LANGUAGE|FOREIGN|LARGE|DATABASE|TABLESPACE)\b)(?:TABLE\s+)?([^;]*?)\s+(?:TO|FROM)\b/gi;
const TARGET_RE = new RegExp(String.raw`^\s*${QUALIFIED}\s*$`);
const DROP_TARGET_RE = new RegExp(String.raw`^\s*${QUALIFIED}`);
const REVOKE_ALL_RE = /^\s*ALL(?:\s+PRIVILEGES)?\s*$/i;
const DOLLAR_TAG_RE = /\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/y;
// A statement prefix that ends by handing the next string to EXECUTE, after
// any block keywords (BEGIN, THEN, ELSE, LOOP) that open the statement.
const EXECUTES_RE = /^\s*(?:(?:BEGIN|THEN|ELSE|LOOP)\s+)*EXECUTE\s*$/i;
const RUNS_NOW_RE = /^\s*DO\b/i;

// True when every privilege in a GRANT list has a column list ("INSERT (id)").
// A mixed list ("INSERT, SELECT (id)") still grants a table-level privilege.
function columnLevelOnly(privileges) {
  return privileges.split(/,(?![^(]*\))/).every((item) => item.includes("("));
}

// The public table a (schema, name) match refers to, or null for another schema.
function publicTable(schema, name) {
  if (schema !== undefined && identName(schema) !== "public") return null;
  return identName(name);
}

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

// Blank SQL to spaces of the same length, so match indices line up with the
// raw SQL. Comments (nested block comments included) are always blanked.
// Single-quoted literals (standard and E'' escapes) are lexed so comment
// markers inside them are ignored. A dollar-quoted body that is scanned is
// lexed within its own bounds, so a quote it leaves open never reaches past
// its closing tag.
//
// executableOnly = false: only comments are blanked; literals and dollar
// bodies stay visible (CREATE/DROP tracking). executableOnly = true: literals
// are blanked too, a DO block's body is masked recursively, and every other
// dollar-quoted span (function bodies, prose) is blanked (GRANT/REVOKE).
function maskSql(sql, executableOnly) {
  const code = sql.split("");
  const blank = (from, to) => {
    for (let k = from; k < to; k++) if (code[k] !== "\n") code[k] = " ";
  };
  const mask = (start, end) => {
    let i = start;
    let stmtStart = start;
    while (i < end) {
      if (sql[i] === ";") {
        stmtStart = i + 1;
        i++;
      } else if (sql.startsWith("--", i)) {
        const eol = sql.indexOf("\n", i);
        const stop = eol === -1 || eol > end ? end : eol;
        blank(i, stop);
        i = stop;
      } else if (sql.startsWith("/*", i)) {
        let depth = 1;
        let j = i + 2;
        while (j < end && depth > 0) {
          if (sql.startsWith("/*", j)) (depth++, (j += 2));
          else if (sql.startsWith("*/", j)) (depth--, (j += 2));
          else j++;
        }
        blank(i, Math.min(j, end));
        i = j;
      } else if (sql[i] === '"') {
        // A quoted identifier stays visible, but an apostrophe inside it
        // ("grower's") must not open a string literal.
        let j = i + 1;
        while (j < end) {
          if (sql[j] === '"' && sql[j + 1] === '"') j += 2;
          else if (sql[j] === '"') break;
          else j++;
        }
        i = j < end ? j + 1 : i + 1;
      } else if (sql[i] === "'") {
        const escapes = i > 0 && /[eE]/.test(sql[i - 1]) && !/[a-zA-Z0-9_]/.test(sql[i - 2] ?? "");
        let j = i + 1;
        while (j < end) {
          if (escapes && sql[j] === "\\") j += 2;
          else if (sql[j] === "'" && sql[j + 1] === "'") j += 2;
          else if (sql[j] === "'") break;
          else j++;
        }
        if (j < end) {
          const executes = EXECUTES_RE.test(code.slice(stmtStart, i).join(""));
          if (executableOnly && !executes) blank(i, j + 1);
          i = j + 1;
        } else {
          i++; // unterminated within these bounds: prose, not a literal
        }
      } else if (sql[i] === "$" && !/[A-Za-z0-9_$]/.test(sql[i - 1] ?? "")) {
        DOLLAR_TAG_RE.lastIndex = i;
        const tag = DOLLAR_TAG_RE.exec(sql)?.[0];
        const close = tag ? sql.indexOf(tag, i + tag.length) : -1;
        if (tag && close !== -1 && close < end) {
          // A DO body runs now, and so does a string handed straight to EXECUTE
          // inside one (EXECUTE $ddl$ ... $ddl$).
          const prefix = code.slice(stmtStart, i).join("");
          const runsNow = RUNS_NOW_RE.test(prefix) || EXECUTES_RE.test(prefix);
          if (!executableOnly || runsNow) mask(i + tag.length, close);
          else blank(i, close + tag.length);
          i = close + tag.length;
        } else {
          i++;
        }
      } else {
        i++;
      }
    }
  };
  mask(0, sql.length);
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
    const ddl = maskSql(m.sql, false);
    const executed = maskSql(m.sql, true);
    const events = [];
    for (const match of ddl.matchAll(CREATE_RE)) {
      const table = publicTable(match[2], match[3]);
      if (table) {
        events.push({ kind: "create", conditional: Boolean(match[1]), table, index: match.index });
      }
    }
    for (const match of executed.matchAll(RENAME_RE)) {
      const table = publicTable(match[1], match[2]);
      if (table)
        events.push({ kind: "rename", table, to: identName(match[3]), index: match.index });
    }
    for (const match of executed.matchAll(DROP_RE)) {
      for (const target of match[1].split(",")) {
        const name = DROP_TARGET_RE.exec(target);
        const table = name && publicTable(name[1], name[2]);
        if (table) events.push({ kind: "drop", table, index: match.index });
      }
    }
    for (const match of executed.matchAll(ACL_RE)) {
      const isRevoke = match[1].toUpperCase() === "REVOKE";
      // Column-level ACLs (a privilege list with a column list) leave the rest
      // of the table on the default, so they are not a table-level decision.
      if (isRevoke ? !REVOKE_ALL_RE.test(match[2]) : columnLevelOnly(match[2])) continue;
      for (const target of match[3].split(",")) {
        const name = TARGET_RE.exec(target);
        const table = name && publicTable(name[1], name[2]);
        if (table) events.push({ kind: "acl", table, index: match.index });
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
      } else if (event.kind === "rename") {
        // The new name now holds the renamed table, tracked or not.
        const state = tables.get(event.table);
        tables.delete(event.table);
        tables.delete(event.to);
        if (state) tables.set(event.to, state);
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
