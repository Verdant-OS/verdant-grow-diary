/**
 * Stateful in-memory PostgREST stand-in for the phenohunt drive.
 * Records writes so later reads (and reloads) see them — required because
 * PhenoHuntWorkspace prefers the server comparison summary over local state.
 */

export const IDS = {
  USER: "e2e00000-0000-4000-8000-000000000001",
  GROW: "22222222-2222-4222-8222-222222222221",
  TENT: "33333333-3333-4333-8333-333333333331",
  HUNT: "11111111-1111-4111-8111-111111111111",
  PLANT_A: "44444444-4444-4444-8444-444444444441",
  PLANT_B: "44444444-4444-4444-8444-444444444442",
  PLANT_C: "44444444-4444-4444-8444-444444444443",
  KEEPER: "55555555-5555-4555-8555-555555555551",
  CLONE: "66666666-6666-4666-8666-666666666661",
  CROSS: "77777777-7777-4777-8777-777777777771",
  STRESS: "88888888-8888-4888-8888-888888888881",
};

const NOW = "2026-07-31T00:00:00.000Z";

export function makeDb() {
  const sub = (environment) => ({
    id: `sub_${environment}`,
    user_id: IDS.USER,
    paddle_subscription_id: `lifetime_e2e_${environment}`,
    paddle_customer_id: `customer_e2e_${environment}`,
    product_id: "founder_lifetime",
    price_id: "founder_lifetime",
    plan_id: "founder_lifetime",
    status: "active",
    current_period_start: "2026-07-01T00:00:00.000Z",
    current_period_end: null,
    cancel_at_period_end: false,
    environment,
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
  });

  const plant = (id, name, strain) => ({
    id,
    user_id: IDS.USER,
    name,
    strain,
    stage: "flower",
    plant_type: "photoperiod",
    grow_id: IDS.GROW,
    tent_id: IDS.TENT,
    photo_url: null,
    is_archived: false,
    pheno_hunt_id: null,
    candidate_label: null,
    candidate_number: null,
    created_at: NOW,
    updated_at: NOW,
  });

  return {
    grows: [
      {
        id: IDS.GROW,
        user_id: IDS.USER,
        name: "Summer Grow",
        stage: "flower",
        grow_type: "photoperiod",
        is_archived: false,
        started_at: NOW,
        created_at: NOW,
        updated_at: NOW,
      },
    ],
    tents: [{ id: IDS.TENT, user_id: IDS.USER, name: "Flower Tent", grow_id: IDS.GROW }],
    plants: [
      plant(IDS.PLANT_A, "Runtz A", "Runtz F2"),
      plant(IDS.PLANT_B, "Runtz B", "Runtz F2"),
      plant(IDS.PLANT_C, "Runtz C", "Runtz F2"),
    ],
    pheno_hunts: [],
    pheno_candidate_scores: [],
    pheno_keeper_decisions: [],
    pheno_keeper_decisions_log: [],
    pheno_sex_observations: [],
    pheno_smoke_tests: [],
    pheno_lab_results: [],
    pheno_score_rounds: [],
    pheno_keepers: [],
    pheno_keeper_clones: [],
    pheno_reversals: [],
    pheno_crosses: [],
    pheno_stress_observations: [],
    pheno_male_evaluations: [],
    action_queue: [],
    diary_entries: [],
    alerts: [],
    alert_events: [],
    subscriptions: [sub("live"), sub("sandbox")],
    user_roles: [],
    profiles: [{ id: IDS.USER, user_id: IDS.USER, display_name: "Pheno Tester" }],
    user_agreement_acceptances: [
      { user_id: IDS.USER, agreement_type: "terms", version: "2026-07-13", accepted_at: NOW },
      { user_id: IDS.USER, agreement_type: "privacy", version: "2026-07-13", accepted_at: NOW },
    ],
    sensor_readings: [],
  };
}

/** PostgREST like/ilike: `*` and `%` are multi-char wildcards, `_` single-char. */
function likeToRegExp(pattern, flags) {
  let out = "^";
  for (const ch of pattern) {
    if (ch === "%" || ch === "*") out += ".*";
    else if (ch === "_") out += ".";
    else out += ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(out + "$", flags);
}

/** Parse a PostgREST filter value like "eq.abc" / "in.(a,b)" / "is.null" / "not.eq.x". */
function matchesFilter(rowValue, raw) {
  const dot = raw.indexOf(".");
  if (dot < 0) return true;
  const op = raw.slice(0, dot);
  const val = raw.slice(dot + 1);
  switch (op) {
    case "not":
      return !matchesFilter(rowValue, val);
    case "eq":
      return String(rowValue) === val;
    case "neq":
      return String(rowValue) !== val;
    case "is":
      if (val === "null") return rowValue === null || rowValue === undefined;
      if (val === "true") return rowValue === true;
      if (val === "false") return rowValue === false;
      return true;
    case "in": {
      const inner = val.replace(/^\(/, "").replace(/\)$/, "");
      if (inner.trim() === "") return false;
      const list = inner.split(",").map((s) => s.trim().replace(/^"(.*)"$/, "$1"));
      return list.includes(String(rowValue));
    }
    case "ilike":
    case "like":
      return likeToRegExp(val, op === "ilike" ? "i" : "").test(String(rowValue ?? ""));
    case "gte":
      return Number(rowValue) >= Number(val);
    case "lte":
      return Number(rowValue) <= Number(val);
    case "gt":
      return Number(rowValue) > Number(val);
    case "lt":
      return Number(rowValue) < Number(val);
    default:
      return true;
  }
}

const NON_FILTER_PARAMS = new Set([
  "select",
  "order",
  "limit",
  "offset",
  "on_conflict",
  "columns",
  "apikey",
]);

/**
 * PostgREST embedded-resource filters ("plants.is_archived=eq.false") constrain
 * the EMBEDDED rows only. The parent row is still returned even when no child
 * matches; only an `!inner` embed propagates emptiness to the parent. So a key
 * containing a dot must never be matched against a parent column.
 */
function isEmbeddedFilterKey(key) {
  return key.includes(".");
}

/** Predicate over embedded rows for one embed path, from `<path>.<col>=<op>.<val>` params. */
export function embeddedRowFilter(url, path) {
  const prefix = `${path}.`;
  const clauses = [];
  for (const [key, raw] of url.searchParams.entries()) {
    if (NON_FILTER_PARAMS.has(key) || key === "or") continue;
    if (!key.startsWith(prefix)) continue;
    clauses.push([key.slice(prefix.length), raw]);
  }
  return (row) => clauses.every(([col, raw]) => matchesFilter(row[col], raw));
}

/** Apply query-string column filters (and `or=(...)`) to a row set. */
export function applyFilters(rows, url) {
  let out = rows;
  for (const [key, raw] of url.searchParams.entries()) {
    if (NON_FILTER_PARAMS.has(key)) continue;
    if (key === "or") {
      // or=(grow_id.eq.X,tent_id.in.(a,b))
      const inner = raw.replace(/^\(/, "").replace(/\)$/, "");
      const clauses = splitTopLevel(inner);
      out = out.filter((r) =>
        clauses.some((c) => {
          const i = c.indexOf(".");
          const col = c.slice(0, i);
          return matchesFilter(r[col], c.slice(i + 1));
        }),
      );
      continue;
    }
    if (isEmbeddedFilterKey(key)) continue; // embedded filter — applied to the embed, not the parent
    out = out.filter((r) => matchesFilter(r[key], raw));
  }
  const order = url.searchParams.get("order");
  if (order) {
    const terms = order.split(",").map((t) => {
      const seg = t.split(".");
      return { col: seg[0], asc: !seg.includes("desc"), nullsFirst: seg.includes("nullsfirst") };
    });
    out = [...out].sort((a, b) => {
      for (const { col, asc, nullsFirst } of terms) {
        const av = a[col];
        const bv = b[col];
        const an = av === null || av === undefined;
        const bn = bv === null || bv === undefined;
        if (an && bn) continue;
        if (an) return nullsFirst ? -1 : 1;
        if (bn) return nullsFirst ? 1 : -1;
        if (av === bv) continue;
        return (av > bv ? 1 : -1) * (asc ? 1 : -1);
      }
      return 0;
    });
  }
  return out;
}

/** DB-default columns PostgREST would fill server-side on INSERT. */
export function insertDefaults(table) {
  const now = new Date().toISOString();
  const base = { created_at: now, updated_at: now };
  switch (table) {
    case "pheno_sex_observations":
      return { ...base, observed_at: now };
    case "pheno_keeper_decisions":
    case "pheno_keeper_decisions_log":
      return { ...base, decided_at: now };
    case "pheno_crosses":
      return { ...base, crossed_at: now };
    case "pheno_keeper_clones":
      return { ...base, taken_at: now };
    default:
      return base;
  }
}

/** Split "a.eq.1,b.in.(x,y)" on top-level commas only. */
function splitTopLevel(s) {
  const parts = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      parts.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur) parts.push(cur);
  return parts;
}

/** Derive latest-per-plant rows for the pheno_sex_observations_latest view. */
export function latestSexRows(db) {
  const byPlant = new Map();
  for (const r of db.pheno_sex_observations) {
    const prev = byPlant.get(r.plant_id);
    if (!prev || String(r.observed_at) >= String(prev.observed_at)) byPlant.set(r.plant_id, r);
  }
  return [...byPlant.values()];
}
