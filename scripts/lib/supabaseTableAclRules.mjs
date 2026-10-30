// Scans migration SQL for persistent public tables without an explicit table
// ACL. A qualifying GRANT must name a Data API role; this does not prove that
// every intended role or privilege is granted, or that RLS is correct.
// REVOKE ALL remains a separate explicit-denial path.
// Tracks ordinary, unlogged, foreign, CTAS and SELECT INTO table creation;
// supports quoted identifiers and rollback to savepoints. Runtime-built SQL
// and escaped DO bodies fail closed when they cannot be analyzed statically.
// SQL-standard BEGIN ATOMIC routine bodies are rejected as unsupported.
// Opaque diagnostics are never tracked as SQL table names and cannot be granted away.
// Twenty-five reviewed historical occurrences are pinned by file name, content
// hash and offset. Independent review of those pins is still required.
// CREATE inside a function is scanned conservatively. No DB access is made.
// Known limitation: DO control flow is not evaluated. Unqualified names are
// assumed public; a migration that changes search_path must qualify names.
import { createHash } from "node:crypto";

// Immutable migration SQL reviewed for dynamic commands that do not create
// tables: policy creation/removal, fixed literal ACLs, and function ACLs
// using pg_proc regprocedure identifiers. A matching filename, normalized
// content hash AND exact event offset are all required. New or edited SQL
// never inherits these exceptions.
const HISTORICAL_DYNAMIC_EXECUTE = Object.freeze({
  "20260709192453_507784b6-6a68-4a62-a5a4-ab2dc94598ea.sql": { sha256: "1630d6746fb66bed51dd03cb36e23b6cc8f5dd0f768dfd39ec941b1865582df8", offsets: [2412, 2518, 2624, 2731, 2944, 3223] },
  "20260722062644_8cdef271-abf0-4d82-9eca-970a91b6c547.sql": { sha256: "95e829d6a8a2efca6bf6323a1052c8eef24298a5f23dde5e1fb36077e3f2fb30", offsets: [1141] },
  "20260728090000_production_schema_reconciliation.sql": { sha256: "7e4912b4c58efcfe6bce208f94704b28c99a5a064fd93763ded905e232bf17ed", offsets: [51831, 51977, 52088, 52185, 61415, 61543] },
  "20260807150000_quicklog_save_manual_all_overloads.sql": { sha256: "fcb48a161ed4c232f30e284e5fa1dbb6b80fa5ba9475b9b2dd19a658b8387cff", offsets: [2033, 2112, 2189] },
  "20260815054645_revoke_public_and_anon_execute_on_definer_functions.sql": { sha256: "1048bfefe36c263c0522deb37ce767f8d6015eed9487818f7127ffa396ddb13b", offsets: [1895, 1974, 2051] },
  "20260825233000_pheno_hunts_ownership_check_restore.sql": { sha256: "01d1b9a041bccc29e13b6415887cb614aa12a671364c15edf48304a72d094199", offsets: [3391, 3497, 3603, 3710, 3923, 4202] },
});

// Unquoted identifiers: PostgreSQL reads every non-ASCII character as a letter.
const IDENT = String.raw`(?:"(?:[^"]|"")+"|[a-zA-Z_\u0080-\uFFFF][a-zA-Z0-9_$\u0080-\uFFFF]*)`;
// Optional schema, then the name: group 1 is the schema, group 2 the table.
const QUALIFIED = String.raw`(?:(${IDENT})\s*\.\s*)?(${IDENT})`;
const CREATE_HEAD_RE = new RegExp(
  String.raw`\bCREATE\s+(?:(?:UNLOGGED|FOREIGN)\s+)?TABLE\s+(IF\s+NOT\s+EXISTS\s+)?`,
  "gi",
);
const CREATE_TEMP_HEAD_RE = new RegExp(
  String.raw`\bCREATE\s+(?:(?:GLOBAL|LOCAL)\s+)?TEMP(?:ORARY)?\s+TABLE\s+(IF\s+NOT\s+EXISTS\s+)?`,
  "gi",
);
const QUALIFIED_AT_RE = new RegExp(String.raw`^${QUALIFIED}`);
// Complete CREATE TABLE names end at the column list, a typed/partitioned
// table, a CTAS, a statement end, or EOF. Anything else (%I, concatenation)
// cannot be named statically.
const CREATE_TARGET_END_RE = /^\s*(?:\(|AS\b|OF\b|PARTITION\b|USING\b|WITH\b|TABLESPACE\b|;|$)/i;
// SQL SELECT ... INTO [UNLOGGED] [TABLE] name creates a table. INTO TEMP /
// TEMPORARY is a session table and is tracked separately. INSERT/MERGE INTO
// after a WITH ... SELECT is skipped only when INTO comes directly after )
// INSERT or ) MERGE, so an alias named insert or merge does not suppress
// detection.
const SELECT_INTO_RE = new RegExp(
  String.raw`\bSELECT\b(?:"(?:[^"]|"")*"|[^;"])*?\bINTO\s+(?!TEMP(?:ORARY)?\b)(?:UNLOGGED\s+)?(?:TABLE\s+)?${QUALIFIED}`,
  "gi",
);
const SELECT_INTO_TEMP_RE = new RegExp(
  String.raw`\bSELECT\b(?:"(?:[^"]|"")*"|[^;"])*?\bINTO\s+TEMP(?:ORARY)?\s+(?:TABLE\s+)?${QUALIFIED}`,
  "gi",
);
const SELECT_INTO_CTE_DML_RE = /\)\s+(?:INSERT|MERGE)\s+INTO\b/i;
// Semicolons inside quoted identifiers would terminate [^;]* statement
// patterns. Carry them as this placeholder through every masked view;
// identName turns it back into a semicolon when a name is read.
const QUOTED_SEMICOLON = "\u0001";
// ALTER TABLE ... RENAME TO keeps the table and its grants under the new name.
// RENAME TO takes no schema; RENAME COLUMN and RENAME CONSTRAINT do not match.
const RENAME_RE = new RegExp(
  String.raw`\bALTER\s+(?:FOREIGN\s+)?TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?${QUALIFIED}\s+RENAME\s+TO\s+(${IDENT})`,
  "gi",
);
// ALTER TABLE ... SET SCHEMA moves a table, with its grants, between schemas.
// A table moved into public from elsewhere did not get public's default
// grants, so it needs its own ACL there; one moved out of public leaves scope.
const SET_SCHEMA_RE = new RegExp(
  String.raw`\bALTER\s+(?:FOREIGN\s+)?TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?${QUALIFIED}\s+SET\s+SCHEMA\s+(${IDENT})`,
  "gi",
);
const DROP_RE = /\bDROP\s+(?:FOREIGN\s+)?TABLE\s+(?:IF\s+EXISTS\s+)?([^;]*)/gi;
// Table GRANT/REVOKE. Skip only a complete non-table clause: ALL TABLES|
// SEQUENCES|FUNCTIONS|PROCEDURES|ROUTINES IN …, or FUNCTION|SEQUENCE|SCHEMA|
// TYPE|… followed by that object's name. A keyword followed by TO, FROM or
// a comma is a table name.
const ACL_RE = new RegExp(
  String.raw`\b(GRANT|REVOKE)\b([^;]*?)\bON\s+` +
    String.raw`(?!ALL\s+(?:TABLES|SEQUENCES|FUNCTIONS|PROCEDURES|ROUTINES)\s+IN\b)` +
    String.raw`(?!(?:FUNCTION|PROCEDURE|ROUTINE|SEQUENCE|SCHEMA|TYPE|DOMAIN|LANGUAGE|DATABASE|TABLESPACE)\b(?!\s*(?:TO|FROM|,)))` +
    String.raw`(?!FOREIGN\s+(?:DATA\s+WRAPPER|SERVER)\b)` +
    String.raw`(?!LARGE\s+OBJECT\b)` +
    String.raw`(?:TABLE\s+)?((?:"(?:[^"]|"")*"|[^;"])*?)\s+(?:TO|FROM)\b([^;]*)`,
  "gi",
);
const TARGET_RE = new RegExp(String.raw`^\s*${QUALIFIED}\s*$`);
const DROP_TARGET_RE = new RegExp(String.raw`^\s*${QUALIFIED}\s*(?:CASCADE|RESTRICT)?\s*$`, "i");
const REVOKE_ALL_RE = /^\s*ALL(?:\s+PRIVILEGES)?\s*$/i;
const DOLLAR_TAG_RE = /\$(?:[A-Za-z_\u0080-\uFFFF][A-Za-z0-9_\u0080-\uFFFF]*)?\$/y;
// A statement prefix that ends by handing the next string to EXECUTE, after
// any block keywords (BEGIN, THEN, ELSE, LOOP) that open the statement.
const EXECUTES_RE = /(?:^|\b(?:BEGIN|THEN|ELSE|LOOP)\b)\s*EXECUTE\s*$/i;
const RUNS_NOW_RE = /^\s*DO\b/i;
const DO_LANGUAGE = "(?:" + IDENT + "|'(?:[^']|'')*')";
const DO_BODY_PREFIX_RE = new RegExp("^\\s*DO(?:\\s+LANGUAGE\\s+" + DO_LANGUAGE + ")?\\s*$", "i");
const DO_ESCAPED_PREFIX_RE = new RegExp("^\\s*DO(?:\\s+LANGUAGE\\s+" + DO_LANGUAGE + ")?\\s+(?:E|U&)$", "i");
// What may follow a string handed to EXECUTE for that string to be the whole
// command. Anything else (EXECUTE 'DROP ...' || suffix) builds the command at
// run time, so the string is not read as the statement (fails closed).
const EXECUTE_ENDS_RE = /^\s*(?:;|$|USING\b|INTO\b)/i;
const EXECUTE_TRIGGER_TAIL_RE = /^(?:FUNCTION|PROCEDURE)\b/i;
function skipWsAndComments(sql, i, end) {
  while (i < end) {
    if (/\s/.test(sql[i])) {
      i++;
      continue;
    }
    if (sql.startsWith("--", i)) {
      const eol = sql.indexOf("\n", i);
      i = eol === -1 || eol > end ? end : eol;
      continue;
    }
    if (sql.startsWith("/*", i)) {
      let depth = 1;
      let j = i + 2;
      while (j < end && depth > 0) {
        if (sql.startsWith("/*", j)) (depth++, (j += 2));
        else if (sql.startsWith("*/", j)) (depth--, (j += 2));
        else j++;
      }
      i = Math.min(j, end);
      continue;
    }
    break;
  }
  return i;
}

function skipQuotedIdentifier(sql, i, end) {
  let j = i + 1;
  while (j < end) {
    if (sql[j] === '"' && sql[j + 1] === '"') j += 2;
    else if (sql[j] === '"') return j + 1;
    else j++;
  }
  return i + 1;
}

function readSingleQuoted(sql, i, end) {
  const escapes = i > 0 && /[eE]/.test(sql[i - 1]) && !/[a-zA-Z0-9_]/.test(sql[i - 2] ?? "");
  let j = i + 1;
  let value = "";
  while (j < end) {
    if (escapes && sql[j] === "\\") {
      value += sql[j + 1] ?? "";
      j += 2;
      continue;
    }
    if (sql[j] === "'" && sql[j + 1] === "'") {
      value += "'";
      j += 2;
      continue;
    }
    if (sql[j] === "'") return { value, after: j + 1 };
    value += sql[j];
    j++;
  }
  return null;
}

function readDollarQuoted(sql, i, end) {
  if (sql[i] !== "$" || /[A-Za-z0-9_$\u0080-\uFFFF]/.test(sql[i - 1] ?? "")) return null;
  DOLLAR_TAG_RE.lastIndex = i;
  const tag = DOLLAR_TAG_RE.exec(sql)?.[0];
  if (!tag) return null;
  const close = sql.indexOf(tag, i + tag.length);
  if (close === -1 || close >= end) return null;
  return { value: sql.slice(i + tag.length, close), after: close + tag.length, tag };
}

function readExecuteArgument(sql, start, end) {
  let i = start;
  let depth = 0;
  const pieces = [];
  let sawString = false;
  let sawCallOrConcat = false;
  while (i < end) {
    i = skipWsAndComments(sql, i, end);
    if (i >= end) break;
    if (depth === 0 && EXECUTE_ENDS_RE.test(sql.slice(i))) break;
    if (sql[i] === "(") {
      depth++;
      sawCallOrConcat = true;
      i++;
      continue;
    }
    if (sql[i] === ")") {
      depth = Math.max(0, depth - 1);
      i++;
      continue;
    }
    if (sql[i] === "'") {
      const lit = readSingleQuoted(sql, i, end);
      if (!lit) {
        i++;
        continue;
      }
      pieces.push(lit.value);
      sawString = true;
      i = lit.after;
      continue;
    }
    const dol = readDollarQuoted(sql, i, end);
    if (dol) {
      pieces.push(dol.value);
      sawString = true;
      i = dol.after;
      continue;
    }
    if (sql.startsWith("||", i)) {
      sawCallOrConcat = true;
      i += 2;
      continue;
    }
    if (sql[i] === '"') {
      i = skipQuotedIdentifier(sql, i, end);
      continue;
    }
    i++;
  }
  return {
    pieces,
    kind: !sawString && !sawCallOrConcat ? "variable" : "expression",
    after: i,
  };
}

function collectDynamicExecuteEvents(sql, procedural = false) {
  const events = [];
  const noComments = maskSql(sql, false);
  function walk(start, end, isProcedural = procedural) {
    let i=start, statementStart=start;
    let inStatements = !isProcedural;
    while (i<end) {
      i=skipWsAndComments(sql,i,end);
      if(i>=end) break;
      if(sql[i]===";"){statementStart=++i;continue;}
      if(sql[i]==='"'){i=skipQuotedIdentifier(sql,i,end);continue;}
      if(sql[i]==="'"){
        const lit=readSingleQuoted(sql,i,end);
        const prefix = noComments.slice(statementStart,i);
        const languageLiteral = /^\s*DO\s+LANGUAGE\s*(?:E|U&|N)?$/i.test(prefix);
        if (lit && /^\s*DO\b/i.test(prefix) && !languageLiteral && !DO_BODY_PREFIX_RE.test(prefix) && !DO_ESCAPED_PREFIX_RE.test(prefix)) {
          events.push({kind:"diagnostic",conditional:false,table:"(unreadable DO body prefix at offset "+i+")",index:i});
        }
        if (lit && /^\s*CREATE\s+(?:OR\s+REPLACE\s+)?(?:FUNCTION|PROCEDURE)\b[\s\S]*\bAS\s*(?:E|U&)?$/i.test(noComments.slice(statementStart,i))) {
          events.push({kind:"diagnostic",conditional:false,table:"(unreadable quoted routine body at offset "+i+")",index:i});
        }
        if (lit && DO_ESCAPED_PREFIX_RE.test(noComments.slice(statementStart,i))) {
          events.push({kind:"diagnostic",conditional:false,table:"(unreadable escaped DO body at offset "+i+")",index:i});
        }
        if(lit && DO_BODY_PREFIX_RE.test(noComments.slice(statementStart,i))){
          for(const nested of collectDynamicExecuteEvents(lit.value, true)){
            const at=i+1+nested.index;
            events.push({...nested,index:at,table:"(unreadable dynamic EXECUTE at offset "+at+")"});
          }
        }
        i=lit?lit.after:i+1;continue;
      }
      const dol=readDollarQuoted(sql,i,end);
      if(dol){
        const prefix=noComments.slice(statementStart,i);
        if (/^\s*DO\b/i.test(prefix) && !DO_BODY_PREFIX_RE.test(prefix)) {
          events.push({kind:"diagnostic",conditional:false,table:"(unreadable DO body prefix at offset "+i+")",index:i});
        }
        if (DO_BODY_PREFIX_RE.test(prefix) || /^\s*CREATE\s+(?:OR\s+REPLACE\s+)?(?:FUNCTION|PROCEDURE)\b[\s\S]*\bAS\s*$/i.test(prefix)) {
          walk(i+dol.tag.length,dol.after-dol.tag.length,true);
        }
        i=dol.after; continue;
      }
      if (isProcedural && /^BEGIN\b/i.test(sql.slice(i)) && !(i > start && /[A-Za-z0-9_\u0080-\uFFFF]/.test(sql[i - 1]))) inStatements = true;
      if((i>start && /[A-Za-z0-9_\u0080-\uFFFF]/.test(sql[i-1])) || !/^EXECUTE\b/i.test(sql.slice(i))){i++;continue;}
      if (!inStatements || !EXECUTES_RE.test(noComments.slice(statementStart,i) + "EXECUTE")) { i+=7; continue; }
      const executeAt=i;
      const afterKw=skipWsAndComments(sql,i+7,end);
      if(EXECUTE_TRIGGER_TAIL_RE.test(sql.slice(afterKw))){i=afterKw;continue;}
      if(sql[afterKw]==="'" || sql[afterKw]==="$"){
        const lit=sql[afterKw]==="'"?readSingleQuoted(sql,afterKw,end):readDollarQuoted(sql,afterKw,end);
        const afterLit=lit?skipWsAndComments(sql,lit.after,end):afterKw;
        if(lit && EXECUTE_ENDS_RE.test(sql.slice(afterLit))){
          for (const nested of collectDynamicExecuteEvents(lit.value)) {
            const at = afterKw + 1 + nested.index;
            events.push({...nested, index: at, table: "(unreadable nested EXECUTE at offset " + at + ")"});
          }
          i=lit.after;continue;
        }
      }
      const arg=readExecuteArgument(sql,afterKw,end);
      // Runtime SQL cannot be proven not to create a table; reject it.
      events.push({kind:"diagnostic",conditional:false,table:"(unreadable dynamic EXECUTE at offset "+executeAt+")",index:executeAt});
      i=Math.max(arg.after,i+7);
    }
  }
  walk(0,sql.length);
  return events;
}

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
  const items = [];
  let start = 0;
  let depth = 0;
  let quoted = false;
  for (let i = 0; i < privileges.length; i++) {
    const ch = privileges[i];
    if (ch === '"') {
      if (quoted && privileges[i + 1] === '"') i++;
      else quoted = !quoted;
    } else if (!quoted) {
      if (ch === "(") depth++;
      else if (ch === ")") depth--;
      else if (ch === "," && depth === 0) {
        items.push(privileges.slice(start, i));
        start = i + 1;
      }
      if (depth < 0) return true; // unreadable ACL never satisfies the rule
    }
  }
  if (quoted || depth !== 0) return true;
  items.push(privileges.slice(start));
  return items.every((item) => /^\s*(?:SELECT|INSERT|UPDATE|REFERENCES|ALL(?:\s+PRIVILEGES)?)\s*\(/i.test(item));
}

// Positions of sql that sit inside a double-quoted identifier, so a keyword
// in a name (CREATE POLICY "CREATE TABLE public.leaky (" / "Admins grant
// access") never starts a CREATE, GRANT, DROP, RENAME, or SET SCHEMA match.
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

// Folded schema, or null when the name is unqualified.
function schemaName(schema) {
  return schema === undefined ? null : identName(schema);
}

// Unqualified names search pg_temp first. A pg_temp-qualified name always
// names the session table, even after it has already been dropped.
function actsOnTemp(temps, schema, table) {
  return schema === "pg_temp" || (schema === null && temps.has(table));
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
  const name = raw.startsWith('"') ? raw.slice(1, -1).replace(/""/g, '"') : raw.replace(/[A-Z]/g, (c) => c.toLowerCase());
  return name.replaceAll(QUOTED_SEMICOLON, ";");
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
// are blanked too, a DO block's body (dollar-quoted or single-quoted) is
// masked recursively, and every other dollar-quoted span (function bodies,
// prose) is blanked (GRANT/REVOKE). An E'' DO body is blanked whole because
// its escapes are not decoded (fails closed).
// scanDoBodies = false (with executableOnly true): DO and function bodies stay
// blank so a PL/pgSQL SELECT ... INTO n is not read as a table create.
// Whole-command EXECUTE payloads recorded during the executable pass are
// copied back onto that view so they are scanned as SQL.
function maskSql(sql, executableOnly, scanDoBodies = true, executeSpans = null, creationOnly = false) {
  const code = sql.split("");
  const blank = (from, to) => {
    for (let k = from; k < to; k++) if (code[k] !== "\n") code[k] = " ";
  };
  // A literal handed straight to EXECUTE, or a single-quoted DO body, runs as
  // SQL. Decode it ('' -> '), mask that SQL the same way, and blank the raw
  // characters behind every masked one, so a literal or comment nested in the
  // payload never counts. An E'' payload is blanked whole: its escapes are not
  // decoded (fails closed).
  const maskExecutedLiteral = (open, close, escapes) => {
    if (escapes) {
      blank(open, close + 1);
      return;
    }
    const literal = readSingleQuoted(sql, open, close + 1);
    if (!literal) {
      blank(open, close + 1);
      return;
    }
    const nestedSpans = [];
    const masked = maskSql(literal.value, true, scanDoBodies, nestedSpans);
    if (executeSpans) for (const span of nestedSpans) executeSpans.push({...span,start:open+1+span.start,end:open+1+span.end});
    // Normalize tokens before scanning: retaining raw doubled apostrophes
    // would identify a different quoted table. Compact within the original
    // span and pad its tail so outer statement ordering remains stable.
    blank(open, close + 1);
    for (let k = 0; k < masked.length; k++) code[open + 1 + k] = masked[k];
    // SQL SELECT INTO creates tables; procedural SELECT INTO assigns variables.
    // Blank DO bodies in this payload's SQL view, retaining trailing statements.
    return executeSpans ? maskSql(literal.value, true, false) : undefined;
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
        // ("grower's") must not open a string literal. A semicolon inside
        // it is replaced with QUOTED_SEMICOLON so statement patterns that
        // stop at ';' still see the rest of the statement.
        let j = i + 1;
        while (j < end) {
          if (sql[j] === '"' && sql[j + 1] === '"') j += 2;
          else if (sql[j] === '"') break;
          else {
            if (sql[j] === ";") code[j] = QUOTED_SEMICOLON;
            j++;
          }
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
          const prefix = code.slice(stmtStart, i).join("");
          const executes = EXECUTES_RE.test(prefix) && EXECUTE_ENDS_RE.test(sql.slice(skipWsAndComments(sql, j + 1, end), end));
          // A single-quoted DO body runs now, matching dollar-quoted DO.
          const doBody = scanDoBodies && RUNS_NOW_RE.test(prefix);
          if ((executableOnly || creationOnly) && !executes && !doBody) blank(i, j + 1);
          else if (executableOnly || creationOnly) {
            const sqlView = maskExecutedLiteral(i, j, escapes);
            if (executeSpans && executes && !escapes) executeSpans.push({ start: i + 1, end: j, sqlView });
          }
          i = j + 1;
        } else {
          i++; // unterminated within these bounds: prose, not a literal
        }
      } else if (sql[i] === "$" && !/[A-Za-z0-9_$\u0080-\uFFFF]/.test(sql[i - 1] ?? "")) {
        DOLLAR_TAG_RE.lastIndex = i;
        const tag = DOLLAR_TAG_RE.exec(sql)?.[0];
        const close = tag ? sql.indexOf(tag, i + tag.length) : -1;
        if (tag && close !== -1 && close < end) {
          // A DO body runs now, and so does a string handed straight to EXECUTE
          // inside one (EXECUTE $ddl$ ... $ddl$).
          const prefix = code.slice(stmtStart, i).join("");
          const isExecute =
            EXECUTES_RE.test(prefix) && EXECUTE_ENDS_RE.test(sql.slice(skipWsAndComments(sql, close + tag.length, end), end));
          const runsNow = (scanDoBodies && RUNS_NOW_RE.test(prefix)) || isExecute;
          const routineBody = /^\s*CREATE\s+(?:OR\s+REPLACE\s+)?(?:FUNCTION|PROCEDURE)\b[\s\S]*\bAS\s*$/i.test(prefix);
          if ((!executableOnly && (!creationOnly || runsNow || routineBody)) || runsNow) {
            mask(i + tag.length, close);
            // Tags delimit the body; they are not part of it. Blank them so an
            // identifier sitting against the closing tag (leaky$ddl$) does not
            // pick up the tag as part of the name, matching the quotes on a
            // single-quoted EXECUTE payload.
            blank(i, i + tag.length);
            blank(close, close + tag.length);
            if (executeSpans && executableOnly && isExecute) {
              executeSpans.push({ start: i + tag.length, end: close, sqlView:maskSql(sql.slice(i + tag.length, close), true, false) });
            }
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

function overlayExecutePayloads(topLevel, executed, spans) {
  if (spans.length === 0) return topLevel;
  const out = topLevel.split("");
  // Overlay containing commands first, then their nested EXECUTE commands.
  for (const { start, end, sqlView } of spans.sort((a,b)=>a.start-b.start || b.end-a.end)) {
    for (let k = start; k < end && k < executed.length; k++) out[k] = sqlView === undefined ? executed[k] : (sqlView[k-start] ?? " ");
  }
  return out.join("");
}

/**
 * @param {{ name: string, sql: string }[]} migrations in apply order
 * @returns {{ table: string, migration: string }[]} persistent public tables
 *   with no table-level GRANT/REVOKE after their latest CREATE, sorted by table
 */
export function findTablesWithoutExplicitAcl(migrations) {
  const tables = new Map(); // table -> { migration, acl }
  // A schema move preserves the object and its ACL. Keep other schemas keyed
  // independently, including their drops/recreates, so stale grants cannot return.
  const outsideTables = new Map();
  const stateKey = (schema, table) => JSON.stringify([schema, table]);
  const stateLocation = (schema, table) => schema === null || schema === "public"
    ? [tables, table] : [outsideTables, stateKey(schema, table)];
  const diagnostics = []; // opaque failures: SQL identifiers/ACLs cannot clear them
  // Session temp names outlive a single migration file: if two migrations share
  // a session, the shadow still holds (fails closed).
  const temps = new Map();
  for (const m of migrations) {
    const sql = m.sql.replace(/\r\n/g, "\n");
    const legacyDynamic = HISTORICAL_DYNAMIC_EXECUTE[m.name];
    const legacyValid = legacyDynamic && createHash("sha256").update(sql).digest("hex") === legacyDynamic.sha256;
    const creation = maskSql(sql, false, true, null, true);
    const executeSpans = [];
    const executed = maskSql(sql, true, true, executeSpans);
    const topLevel = maskSql(sql, true, false);
    const selectIntoSql = overlayExecutePayloads(topLevel, executed, executeSpans);
    const quoted = quotedIdentifierPositions(executed);
    const quotedCreation = quotedIdentifierPositions(creation);
    const keywordSql = executed.split("").map((ch, index) => quoted[index] ? " " : ch).join("");
    const quotedSelectInto = quotedIdentifierPositions(selectIntoSql);
    const events = [];
    // Schema deletion/renaming can invalidate many tracked names at once.
    // Until modeled, reject these commands rather than reusing stale ACLs.
    for (const match of keywordSql.matchAll(/\b(?:DROP\s+SCHEMA\b|ALTER\s+SCHEMA\b[^;]*?\bRENAME\s+TO\b)/gi)) {
      events.push({kind:"diagnostic", table:"(unsupported schema lifecycle at offset "+match.index+")", index:match.index});
    }
    // SQL-standard routine bodies are deferred. Reject the unsupported body
    // form rather than crediting its unexecuted ACL/removal statements.
    const atomicRoutineRe = /\bCREATE\s+(?:OR\s+REPLACE\s+)?(?:FUNCTION|PROCEDURE)\b[^;]*?\bBEGIN\s+ATOMIC\b/gi;
    for (const match of keywordSql.matchAll(atomicRoutineRe)) {
      events.push({kind:"diagnostic", table:"(unreadable SQL-standard routine body at offset "+match.index+")", index:match.index});
    }
    const transactionRe = /(?:^|;)\s*(SAVEPOINT|RELEASE(?:\s+SAVEPOINT)?|ROLLBACK\s+(?:(?:WORK|TRANSACTION)\s+)?TO(?:\s+SAVEPOINT)?|START\s+TRANSACTION|BEGIN|COMMIT|END|ROLLBACK|ABORT)\b(?:\s+("(?:[^"]|"")*"|[a-zA-Z_][a-zA-Z0-9_$]*))?/gi;
    for (const match of topLevel.matchAll(transactionRe)) {
      if (quotedIdentifierPositions(topLevel)[match.index]) continue;
      events.push({kind:"transaction", action:match[1].toUpperCase().replace(/\s+/g," ").replace(/^ROLLBACK (?:WORK|TRANSACTION) TO/, "ROLLBACK TO").replace(/^RELEASE$/, "RELEASE SAVEPOINT").replace(/^END$/, "COMMIT").replace(/^ABORT$/, "ROLLBACK").replace(/^START TRANSACTION$/, "BEGIN"), name:match[2] ? identName(match[2]) : null, index:match.index});
    }
    let transactionStart = null;
    let savepoints = [];
    const snapshot = () => ({tables: new Map([...tables].map(([k,v])=>[k,{...v}])), outsideTables: new Map([...outsideTables].map(([k,v])=>[k,{...v}])), temps:new Map(temps)});
    const restore = (snap) => { tables.clear(); for (const [k,v] of snap.tables) tables.set(k,{...v}); outsideTables.clear(); for (const [k,v] of snap.outsideTables) outsideTables.set(k,{...v}); temps.clear(); for (const [k,v] of snap.temps) temps.set(k,v); };
    for (const match of creation.matchAll(CREATE_HEAD_RE)) {
      if (quotedCreation[match.index]) continue;
      const after = creation.slice(match.index + match[0].length);
      const name = QUALIFIED_AT_RE.exec(after);
      const complete = name !== null && CREATE_TARGET_END_RE.test(after.slice(name[0].length));
      if (!complete) {
        events.push({
          kind: "diagnostic",
          conditional: false,
          table: `(unreadable CREATE TABLE target at offset ${match.index})`,
          index: match.index,
        });
        continue;
      }
      if (schemaName(name[1]) === "pg_temp") {
        events.push({kind:"temp-create", conditional:Boolean(match[1]), table:identName(name[2]),
          onCommitDrop:/\bON\s+COMMIT\s+DROP\b/i.test(keywordSql.slice(match.index, keywordSql.indexOf(";",match.index)<0?keywordSql.length:keywordSql.indexOf(";",match.index))),
          index:match.index});
      } else {
        events.push({ kind: "create", conditional: Boolean(match[1]), table:identName(name[2]), schema:schemaName(name[1]), index: match.index });
      }
    }
    for (const match of creation.matchAll(CREATE_TEMP_HEAD_RE)) {
      if (quotedCreation[match.index]) continue;
      const after = creation.slice(match.index + match[0].length);
      const name = QUALIFIED_AT_RE.exec(after);
      const complete = name !== null && CREATE_TARGET_END_RE.test(after.slice(name[0].length));
      if (!complete) continue;
      events.push({
        kind: "temp-create",
        conditional: Boolean(match[1]),
        table: identName(name[2]),
        onCommitDrop: /\bON\s+COMMIT\s+DROP\b/i.test(keywordSql.slice(match.index, keywordSql.indexOf(";",match.index)<0?keywordSql.length:keywordSql.indexOf(";",match.index))),
        index: match.index,
      });
    }
    for (const match of selectIntoSql.matchAll(SELECT_INTO_RE)) {
      if (quotedSelectInto[match.index]) continue;
      if (SELECT_INTO_CTE_DML_RE.test(match[0])) continue;
      if (schemaName(match[1]) === "pg_temp") events.push({kind:"temp-create", conditional:false, table:identName(match[2]), index:match.index});
      else events.push({ kind: "create", conditional: false, table:identName(match[2]), schema:schemaName(match[1]), index: match.index });
    }
    for (const match of selectIntoSql.matchAll(SELECT_INTO_TEMP_RE)) {
      if (quotedSelectInto[match.index]) continue;
      if (SELECT_INTO_CTE_DML_RE.test(match[0])) continue;
      events.push({
        kind: "temp-create",
        conditional: false,
        table: identName(match[2]),
        index: match.index,
      });
    }
    for (const event of collectDynamicExecuteEvents(sql).filter((event) => !(legacyValid && legacyDynamic.offsets.includes(event.index)))) events.push(event);
    for (const match of executed.matchAll(RENAME_RE)) {
      if (quoted[match.index]) continue;
      const schema = schemaName(match[1]);
      events.push({
        kind: "rename",
        table: identName(match[2]),
        to: identName(match[3]),
        schema,
        index: match.index,
      });
    }
    for (const match of executed.matchAll(SET_SCHEMA_RE)) {
      if (quoted[match.index]) continue;
      const schema = schemaName(match[1]);
      const name = identName(match[2]);
      const toSchema = identName(match[3]);
      if ((schema ?? "public") !== toSchema) {
        events.push({
          kind: "move",
          table: name,
          schema,
          toSchema,
          index: match.index,
        });
      }
    }
    for (const match of executed.matchAll(DROP_RE)) {
      if (quoted[match.index]) continue;
      for (const target of splitTargets(match[1])) {
        const name = DROP_TARGET_RE.exec(target);
        if (!name) continue;
        const schema = schemaName(name[1]);
        events.push({ kind: "drop", table: identName(name[2]), schema, index: match.index });
      }
    }
    for (const match of executed.matchAll(ACL_RE)) {
      if (quoted[match.index]) continue;
      const isRevoke = match[1].toUpperCase() === "REVOKE";
      // Column-level ACLs (a privilege list with a column list) leave the rest
      // of the table on the default, so they are not a table-level decision.
      if (isRevoke ? !REVOKE_ALL_RE.test(match[2]) : columnLevelOnly(match[2])) continue;
      // An unrelated role is not a decision about Data API access.
      if (!splitTargets(match[4]).some((role) => {
        const name=/^\s*(?:GROUP\s+)?("(?:[^"]|"")+"|[A-Za-z_][A-Za-z0-9_$]*)(?:\s|$)/i.exec(role)?.[1];
        return name && ["public","anon","authenticated","service_role"].includes(identName(name));
      })) continue;
      for (const target of splitTargets(match[3])) {
        const name = TARGET_RE.exec(target);
        if (!name) continue;
        const schema = schemaName(name[1]);
        events.push({ kind: "acl", table: identName(name[2]), schema, index: match.index });
      }
    }
    events.sort((a, b) => a.index - b.index);
    for (const event of events) {
      if (event.kind === "diagnostic") { diagnostics.push({table:event.table,migration:m.name}); continue; }
      if (event.kind === "transaction") {
        if (event.action === "BEGIN") { transactionStart=snapshot(); savepoints=[]; }
        else if (event.action === "SAVEPOINT" && event.name) savepoints.push({name:event.name,state:snapshot()});
        else if (event.action.startsWith("ROLLBACK TO")) {
          const at=savepoints.findLastIndex((point)=>point.name===event.name);
          if (at<0) diagnostics.push({table:'(unresolved rollback at offset ' + event.index + ')',migration:m.name});
          else { restore(savepoints[at].state); savepoints=savepoints.slice(0,at+1); }
        } else if (event.action === "RELEASE SAVEPOINT") {
          const at=savepoints.findLastIndex((point)=>point.name===event.name);
          if (at>=0) savepoints=savepoints.slice(0,at);
        } else if (event.action === "ROLLBACK") {
          if (transactionStart) restore(transactionStart);
          else tables.set('(unresolved rollback at offset ' + event.index + ')',{migration:m.name,acl:false});
          transactionStart=null; savepoints=[];
        } else if (event.action === "COMMIT") {
          for (const [name,onCommitDrop] of temps) if (onCommitDrop) temps.delete(name);
          transactionStart=null; savepoints=[];
        }
        continue;
      }
      if (event.kind === "temp-create") {
        if (event.conditional && temps.has(event.table)) continue;
        temps.set(event.table,Boolean(event.onCommitDrop));
        continue;
      }
      if (event.kind !== "create" && actsOnTemp(temps, event.schema, event.table)) {
        if (event.kind === "drop") temps.delete(event.table);
        else if (event.kind === "rename") {
          if (temps.has(event.to) && event.to !== event.table) continue;
          const onCommitDrop = temps.get(event.table);
          temps.delete(event.table);
          temps.set(event.to, onCommitDrop);
        }
        continue;
      }
      const [states, key] = stateLocation(event.schema, event.table);
      if (event.kind === "create") {
        // CREATE TABLE IF NOT EXISTS on a table that already exists is a no-op
        // and keeps that table's grants.
        if (event.conditional && states.has(key)) continue;
        states.set(key, { migration: m.name, acl: false });
      } else if (event.kind === "move") {
        const [destination, toKey] = stateLocation(event.toSchema, event.table);
        if (destination.has(toKey)) continue;
        const state = states.get(key) ?? { migration: m.name, acl: false };
        states.delete(key);
        destination.set(toKey, state);
      } else if (event.kind === "drop") {
        states.delete(key);
      } else if (event.kind === "rename") {
        // A rename onto a still-tracked name does not run: PostgreSQL
        // rejects it, or IF EXISTS with a missing source is a no-op.
        const [, toKey] = stateLocation(event.schema, event.to);
        if (states.has(toKey)) continue;
        const state = states.get(key);
        states.delete(key);
        if (state) states.set(toKey, state);
      } else {
        const state = states.get(key);
        if (state) state.acl = true;
      }
    }
  }
  const missing = [...tables]
    .filter(([, info]) => !info.acl)
    .map(([table, info]) => ({ table, migration: info.migration }));
  return [...diagnostics, ...missing]
    .sort((a, b) => a.table < b.table ? -1 : a.table > b.table ? 1 : a.migration < b.migration ? -1 : a.migration > b.migration ? 1 : 0);
}
