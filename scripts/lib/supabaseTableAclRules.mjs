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

const CREATE_RE = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?public\.([a-zA-Z0-9_]+)/gi;
const DROP_RE = /DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?public\.([a-zA-Z0-9_]+)/gi;
const ACL_RE =
  /\b(GRANT|REVOKE)\b([^;]*?)\bON\s+(?!(?:ALL\s+)?(?:TABLES|FUNCTIONS?|ROUTINES?|PROCEDURES?|SEQUENCES?|SCHEMAS?|TYPES?|DOMAINS?|LANGUAGE|FOREIGN|LARGE|DATABASE|TABLESPACE)\b)(?:TABLE\s+)?([^;]*?)\s+(?:TO|FROM)\b/gi;
const TARGET_RE = /^\s*(?:public\s*\.\s*)?"?([a-zA-Z0-9_]+)"?\s*$/;
const REVOKE_ALL_RE = /^\s*ALL(?:\s+PRIVILEGES)?\s*$/i;

/**
 * Tables created before this rule existed that still inherit the hosted
 * project's legacy default privileges. They exist in production, where
 * existing tables keep their grants after 2026-10-30, and seed.sql restores
 * them on local replay. This list may only shrink: give a table an explicit
 * GRANT/REVOKE in a new migration and remove it here.
 */
export const LEGACY_DEFAULT_PRIVILEGE_TABLES = Object.freeze([
  "alert_events",
  "alerts",
  "diary_entries",
  "environment_events",
  "feeding_events",
  "grow_events",
  "grow_targets",
  "grows",
  "harvests",
  "nug_events",
  "observation_events",
  "photo_events",
  "pi_ingest_bridge_credentials",
  "pi_ingest_idempotency_keys",
  "plants",
  "profiles",
  "sensor_readings",
  "tents",
  "training_events",
  "unlocks",
  "user_quests",
  "watering_events",
]);

// Blank comments to spaces of the same length so match indices still line up
// with the raw SQL and a commented-out GRANT is not counted.
function blankComments(sql) {
  const blank = (s) => s.replace(/[^\n]/g, " ");
  return sql.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/--[^\n]*/g, blank);
}

/**
 * @param {{ name: string, sql: string }[]} migrations in apply order
 * @returns {{ table: string, migration: string }[]} persistent public tables
 *   with no table-level GRANT/REVOKE after their latest CREATE, sorted by table
 */
export function findTablesWithoutExplicitAcl(migrations) {
  const tables = new Map(); // table -> { migration, acl }
  for (const m of migrations) {
    const code = blankComments(m.sql);
    const events = [];
    for (const match of code.matchAll(CREATE_RE)) {
      events.push({ kind: "create", table: match[1].toLowerCase(), index: match.index });
    }
    for (const match of code.matchAll(DROP_RE)) {
      events.push({ kind: "drop", table: match[1].toLowerCase(), index: match.index });
    }
    for (const match of code.matchAll(ACL_RE)) {
      if (match[1].toUpperCase() === "REVOKE" && !REVOKE_ALL_RE.test(match[2])) continue;
      for (const target of match[3].split(",")) {
        const name = TARGET_RE.exec(target);
        if (name) events.push({ kind: "acl", table: name[1].toLowerCase(), index: match.index });
      }
    }
    events.sort((a, b) => a.index - b.index);
    for (const event of events) {
      if (event.kind === "create") {
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
