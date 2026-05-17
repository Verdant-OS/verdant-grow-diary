#!/usr/bin/env -S npx tsx
/**
 * Seed data verifier.
 *
 * Confirms that tent, plant, and sensor_readings rows exist for a given user
 * and prints the IDs so they can be cross-referenced against the UI.
 *
 * Usage:
 *   SUPABASE_URL=... \
 *   SUPABASE_SERVICE_ROLE_KEY=... \
 *   USER_ID=<auth user uuid> \
 *   npx tsx scripts/verify-seed.ts
 *
 * Optional:
 *   TENT_ID=<uuid>   restrict plant/sensor checks to a specific tent
 *   LIMIT=20         max rows per table to display (default 10)
 *
 * Exit codes:
 *   0  all three tables have at least one matching row
 *   1  missing rows or configuration error
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const userId = process.env.USER_ID;
const tentFilter = process.env.TENT_ID;
const limit = Number(process.env.LIMIT ?? 10);

function die(msg: string): never {
  console.error(`[verify-seed] ${msg}`);
  process.exit(1);
}

if (!url) die("SUPABASE_URL is required");
if (!key) die("SUPABASE_SERVICE_ROLE_KEY is required");
if (!userId) die("USER_ID is required");

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type Row = Record<string, unknown>;

async function fetchRows(
  table: "tents" | "plants" | "sensor_readings",
  columns: string,
  extra?: (q: ReturnType<typeof supabase.from>) => unknown,
) {
  let q = supabase
    .from(table)
    .select(columns, { count: "exact" })
    .eq("user_id", userId)
    .limit(limit);
  if (extra) q = extra(q as never) as typeof q;
  const { data, count, error } = await q;
  if (error) die(`query ${table} failed: ${error.message}`);
  return { rows: (data ?? []) as Row[], count: count ?? 0 };
}

function header(label: string) {
  console.log(`\n=== ${label} ===`);
}

function pad(n: number) {
  return String(n).padStart(3, " ");
}

async function main() {
  console.log(`[verify-seed] user_id=${userId}${tentFilter ? ` tent_id=${tentFilter}` : ""}`);

  const tents = await fetchRows("tents", "id,name,stage,is_archived,created_at", (q) =>
    tentFilter ? (q as any).eq("id", tentFilter) : q,
  );
  header(`tents (${tents.count} total, showing ${tents.rows.length})`);
  for (const r of tents.rows) {
    console.log(`  ${pad(1)} ${r.id}  ${r.name}  stage=${r.stage}  archived=${r.is_archived}`);
  }

  const plants = await fetchRows(
    "plants",
    "id,name,tent_id,stage,health,is_archived,created_at",
    (q) => (tentFilter ? (q as any).eq("tent_id", tentFilter) : q),
  );
  header(`plants (${plants.count} total, showing ${plants.rows.length})`);
  for (const r of plants.rows) {
    console.log(
      `  ${pad(1)} ${r.id}  ${r.name}  tent=${r.tent_id ?? "-"}  stage=${r.stage}  health=${r.health}`,
    );
  }

  const sensors = await fetchRows(
    "sensor_readings",
    "id,tent_id,metric,value,quality,source,ts",
    (q) => {
      let next = (q as any).order("ts", { ascending: false });
      if (tentFilter) next = next.eq("tent_id", tentFilter);
      return next;
    },
  );
  header(`sensor_readings (${sensors.count} total, showing ${sensors.rows.length})`);
  for (const r of sensors.rows) {
    console.log(
      `  ${pad(1)} ${r.id}  tent=${r.tent_id}  ${r.metric}=${r.value}  q=${r.quality}  src=${r.source}  ts=${r.ts}`,
    );
  }

  header("summary");
  const summary = {
    tents: tents.count,
    plants: plants.count,
    sensor_readings: sensors.count,
  };
  console.table(summary);

  const missing = Object.entries(summary)
    .filter(([, n]) => n === 0)
    .map(([k]) => k);
  if (missing.length) {
    console.error(`[verify-seed] FAIL: no rows in ${missing.join(", ")}`);
    process.exit(1);
  }
  console.log("[verify-seed] OK: tent, plant, and sensor rows all present.");
}

main().catch((e) => die(e?.message ?? String(e)));
