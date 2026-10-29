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
// A CREATE TABLE target counts only as a complete name followed by (, AS, OF,
// PARTITION, ; or the end. Any other CREATE TABLE keyword is reported as
// (unreadable CREATE TABLE target at offset N) for that migration.
// A top-level SELECT ... INTO [UNLOGGED] [TABLE] name is also a create. It is
// read from a third masked view in which DO and function bodies stay blank, so
// a PL/pgSQL SELECT ... INTO n is not a table. INTO TEMP / TEMPORARY is
// skipped, and INSERT INTO / MERGE INTO after a WITH ... SELECT is not a match.
// Everything that can clear a table's requirement (a removal, a rename, a
// GRANT or REVOKE) counts only where it runs at migration time: top-level
// statements, DO blocks, and a literal string handed straight to EXECUTE.
// Text in comments, string literals, function or procedure bodies, and other
// dollar-quoted strings (COMMENT ... IS $c$...$c$) never clears it. A statement
// assembled at run time (EXECUTE format(...)) cannot be read, so the table is
// reported; give it a plain GRANT statement. A literal handed to EXECUTE is
// decoded and masked the same way, so prose nested inside it never counts.
// ALTER TABLE ... SET SCHEMA public brings a table into scope that needs an ACL.
// Known limit: control flow inside a DO block is not evaluated. A statement
// in an IF branch counts as if it ran, so a guarded GRANT or removal that is
// never reached is still counted. Keep a table's GRANT unconditional.
//
// Precondition: migrations run with public first on search_path, so an
// unqualified name is read as public. SET search_path is not modelled. Under
// SET search_path = other, an unqualified GRANT on a name that also exists in
// public would be credited to the public table. Schema-qualify names in any
// migration that changes search_path.

// Unquoted identifiers: PostgreSQL reads every non-ASCII character as a letter.
const IDENT = String.raw`(?:"(?:[^"]|"")+"|[a-zA-Z_\u0080-\uFFFF][a-zA-Z0-9_$\u0080-\uFFFF]*)`;
// Optional schema, then the name: group 1 is the schema, group 2 the table.
const QUALIFIED = String.raw`(?:(${IDENT})\s*\.\s*)?(${IDENT})`;
const CREATE_HEAD_RE = new RegExp(
  String.raw`\bCREATE\s+(?:UNLOGGED\s+)?TABLE\s+(IF\s+NOT\s+EXISTS\s+)?`,
  "gi",
);
const QUALIFIED_AT_RE = new RegExp(String.raw`^${QUALIFIED}`);
// Complete CREATE TABLE names end at the column list, a typed/partitioned
// table, a CTAS, a statement end, or EOF. Anything else (%I, concatenation)
// cannot be named statically.
const CREATE_TARGET_END_RE = /^\s*(?:\(|AS\b|OF\b|PARTITION\b|;|$)/i;
// SQL SELECT ... INTO [UNLOGGED] [TABLE] name creates a table. INTO TEMP /
// TEMPORARY is a session table and is skipped. INSERT/MERGE INTO after a
// SELECT (including WITH ... SELECT) is not this form.
const SELECT_INTO_RE = new RegExp(
  String.raw`\bSELECT\b(?:(?!\b(?:INSERT|MERGE)\b)[^;])*?\bINTO\s+(?!TEMP(?:ORARY)?\b)(?:UNLOGGED\s+)?(?:TABLE\s+)?${QUALIFIED}`,
  "gi",
);
// ALTER TABLE ... RENAME TO keeps the table and its grants under the new name.
// RENAME TO takes no schema; RENAME COLUMN and RENAME CONSTRAINT do not match.
const RENAME_RE = new RegExp(
  String.raw`\bALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?${QUALIFIED}\s+RENAME\s+TO\s+(${IDENT})`,
  "gi",
);
// ALTER TABLE ... SET SCHEMA moves a table, with its grants, between schemas.
// A table moved into public from elsewhere did not get public's default
// grants, so it needs its own ACL there; one moved out of public leaves scope.
const SET_SCHEMA_RE = new RegExp(
  String.raw`\bALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?${QUALIFIED}\s+SET\s+SCHEMA\s+(${IDENT})`,
  "gi",
);
const DROP_RE = /\bDROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?([^;]*)/gi;
const ACL_RE =
  /\b(GRANT|REVOKE)\b([^;]*?)\bON\s+(?!(?:ALL\s+)?(?:TABLES|FUNCTIONS?|ROUTINES?|PROCEDURES?|SEQUENCES?|SCHEMAS?|TYPES?|DOMAINS?|LANGUAGE|FOREIGN|LARGE|DATABASE|TABLESPACE)\b)(?:TABLE\s+)?([^;]*?)\s+(?:TO|FROM)\b/gi;
const TARGET_RE = new RegExp(String.raw`^\s*${QUALIFIED}\s*$`);
const DROP_TARGET_RE = new RegExp(String.raw`^\s*${QUALIFIED}\s*(?:CASCADE|RESTRICT)?\s*$`, "i");
const REVOKE_ALL_RE = /^\s*ALL(?:\s+PRIVILEGES)?\s*$/i;
const DOLLAR_TAG_RE = /\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/y;
// A statement prefix that ends by handing the next string to EXECUTE, after
// any block keywords (BEGIN, THEN, ELSE, LOOP) that open the statement.
const EXECUTES_RE = /^\s*(?:(?:BEGIN|THEN|ELSE|LOOP)\s+)*EXECUTE\s*$/i;
const RUNS_NOW_RE = /^\s*DO\b/i;
// What may follow a string handed to EXECUTE for that string to be the whole
// command. Anything else (EXECUTE 'DROP ...' || suffix) builds the command at
// run time, so the string is not read as the statement (fails closed).
const EXECUTE_ENDS_RE = /^\s*(?:;|$|USING\b|INTO\b)/i;

// Split a target list on the commas outside quoted identifiers, so
// public."a,b" stays one name.
function splitTargets(list) {
  const targets = [];
  let start = 0;
  let quoted = false;
  for (let i = 0; i < list.length; i++) {
    if (list[i] === '"') quoted = !quoted;
    else if (list[i] === "," && !quoted) {
      targets.push(list.slice(start, i));
      start = i + 1;
    }
  }
  targets.push(list.slice(start));
  return targets;
}

// True when every privilege in a GRANT list has a column list ("INSERT (id)").
// A mixed list ("INSERT, SELECT (id)") still grants a table-level privilege.
function columnLevelOnly(privileges) {
  return privileges.split(/,(?![^(]*\))/).every((item) => item.includes("("));
}

// Positions of sql that sit inside a double-quoted identifier, so a keyword
// in a name (CREATE POLICY "Admins grant access" ...) never starts a match.
// Run on masked SQL, where comments and literals are already blank.
function quotedIdentifierPositions(sql) {
  const inside = new Uint8Array(sql.length);
  for (let i = 0; i < sql.length; i++) {
    if (sql[i] !== '"') continue;
    let j = i + 1;
    while (j < sql.length && !(sql[j] === '"' && sql[j + 1] !== '"')) j += sql[j] === '"' ? 2 : 1;
    inside.fill(1, i + 1, j);
    i = j;
  }
  return inside;
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
// its closing tag. Opening and closing tags on an exposed body (a DO body,
// or an EXECUTE payload that is the whole command) are blanked, matching
// the quotes on a single-quoted EXECUTE path.
//
// executableOnly = false: only comments are blanked; literals and dollar
// bodies stay visible (CREATE/DROP tracking). executableOnly = true: literals
// are blanked too, a DO block's body is masked recursively, and every other
// dollar-quoted span (function bodies, prose) is blanked (GRANT/REVOKE).
// scanDoBodies = false (with executableOnly true): DO and function bodies stay
// blank so a PL/pgSQL SELECT ... INTO n is not read as a table create.
function maskSql(sql, executableOnly, scanDoBodies = true) {
  const code = sql.split("");
  const blank = (from, to) => {
    for (let k = from; k < to; k++) if (code[k] !== "\n") code[k] = " ";
  };
  // A literal handed straight to EXECUTE runs as SQL. Decode it ('' -> '),
  // mask that SQL the same way, and blank the raw characters behind every
  // masked one, so a literal or comment nested in the payload never counts.
  // An E'' payload is blanked whole: its escapes are not decoded (fails closed).
  const maskExecutedLiteral = (open, close, escapes) => {
    if (escapes) {
      blank(open, close + 1);
      return;
    }
    let decoded = "";
    const origin = []; // decoded index -> raw indices
    for (let k = open + 1; k < close; k++) {
      if (sql[k] === "'" && sql[k + 1] === "'") {
        origin.push([k, k + 1]);
        k++;
      } else origin.push([k]);
      decoded += sql[k];
    }
    const masked = maskSql(decoded, true, scanDoBodies);
    for (let d = 0; d < decoded.length; d++) {
      if (masked[d] !== decoded[d]) for (const k of origin[d]) blank(k, k + 1);
    }
    // The quotes delimit the command; they are not part of it.
    blank(open, open + 1);
    blank(close, close + 1);
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
          const executes =
            EXECUTES_RE.test(code.slice(stmtStart, i).join("")) &&
            EXECUTE_ENDS_RE.test(sql.slice(j + 1, end));
          if (executableOnly && !executes) blank(i, j + 1);
          else if (executableOnly) maskExecutedLiteral(i, j, escapes);
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
          const runsNow =
            (scanDoBodies && RUNS_NOW_RE.test(prefix)) ||
            (EXECUTES_RE.test(prefix) && EXECUTE_ENDS_RE.test(sql.slice(close + tag.length, end)));
          if (!executableOnly || runsNow) {
            mask(i + tag.length, close);
            // Tags delimit the body; they are not part of it. Blank them so an
            // identifier sitting against the closing tag (leaky$ddl$) does not
            // pick up the tag as part of the name, matching the quotes on a
            // single-quoted EXECUTE payload.
            blank(i, i + tag.length);
            blank(close, close + tag.length);
          } else blank(i, close + tag.length);
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
    const topLevel = maskSql(m.sql, true, false);
    const quoted = quotedIdentifierPositions(executed);
    const quotedTopLevel = quotedIdentifierPositions(topLevel);
    const events = [];
    for (const match of ddl.matchAll(CREATE_HEAD_RE)) {
      const after = ddl.slice(match.index + match[0].length);
      const name = QUALIFIED_AT_RE.exec(after);
      const complete = name !== null && CREATE_TARGET_END_RE.test(after.slice(name[0].length));
      if (!complete) {
        events.push({
          kind: "create",
          conditional: false,
          table: `(unreadable CREATE TABLE target at offset ${match.index})`,
          index: match.index,
        });
        continue;
      }
      const table = publicTable(name[1], name[2]);
      if (table) {
        events.push({ kind: "create", conditional: Boolean(match[1]), table, index: match.index });
      }
    }
    for (const match of topLevel.matchAll(SELECT_INTO_RE)) {
      if (quotedTopLevel[match.index]) continue;
      const table = publicTable(match[1], match[2]);
      if (table) events.push({ kind: "create", conditional: false, table, index: match.index });
    }
    for (const match of executed.matchAll(RENAME_RE)) {
      if (quoted[match.index]) continue;
      const table = publicTable(match[1], match[2]);
      if (table)
        events.push({ kind: "rename", table, to: identName(match[3]), index: match.index });
    }
    for (const match of executed.matchAll(SET_SCHEMA_RE)) {
      if (quoted[match.index]) continue;
      const name = identName(match[2]);
      const fromPublic = publicTable(match[1], match[2]) !== null;
      const toPublic = identName(match[3]) === "public";
      if (fromPublic !== toPublic) {
        events.push({ kind: toPublic ? "move-in" : "drop", table: name, index: match.index });
      }
    }
    for (const match of executed.matchAll(DROP_RE)) {
      if (quoted[match.index]) continue;
      for (const target of splitTargets(match[1])) {
        const name = DROP_TARGET_RE.exec(target);
        const table = name && publicTable(name[1], name[2]);
        if (table) events.push({ kind: "drop", table, index: match.index });
      }
    }
    for (const match of executed.matchAll(ACL_RE)) {
      if (quoted[match.index]) continue;
      const isRevoke = match[1].toUpperCase() === "REVOKE";
      // Column-level ACLs (a privilege list with a column list) leave the rest
      // of the table on the default, so they are not a table-level decision.
      if (isRevoke ? !REVOKE_ALL_RE.test(match[2]) : columnLevelOnly(match[2])) continue;
      for (const target of splitTargets(match[3])) {
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
      } else if (event.kind === "move-in") {
        // A move into public onto a still-tracked name does not run:
        // PostgreSQL rejects it, or IF EXISTS with a missing source is a no-op.
        if (tables.has(event.table)) continue;
        tables.set(event.table, { migration: m.name, acl: false });
      } else if (event.kind === "drop") {
        tables.delete(event.table);
      } else if (event.kind === "rename") {
        // A rename onto a still-tracked name does not run: PostgreSQL
        // rejects it, or IF EXISTS with a missing source is a no-op.
        if (tables.has(event.to)) continue;
        const state = tables.get(event.table);
        tables.delete(event.table);
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
