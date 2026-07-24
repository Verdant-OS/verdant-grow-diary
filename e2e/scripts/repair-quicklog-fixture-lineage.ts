#!/usr/bin/env -S bun run
/**
 * Repair the dedicated Quick Log E2E fixture through a normal authenticated
 * Supabase client. This is fixture configuration, not application seeding:
 *
 * - RLS remains authoritative; no service-role/admin credential is accepted.
 * - exact E2E/Test names and the configured route plant must agree.
 * - existing non-null lineage is never overwritten.
 * - no row is deleted or renamed.
 * - the only inserts allowed are the canonical E2E grow and missing second
 *   E2E plant required by the smoke checklist.
 */
import { createClient } from "@supabase/supabase-js";
import { isLikelyRealPlantUrl, validateFixtureEnv } from "../lib/fixtureSafety";

const CANONICAL_GROW_NAME = "E2E Test Grow";
const DEFAULT_SECOND_PLANT_NAME = "E2E Test Plant 2";
const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;

type GrowRow = { id: string; name: string };
type TentRow = { id: string; name: string; grow_id: string | null };
type PlantRow = {
  id: string;
  name: string;
  tent_id: string | null;
  grow_id: string | null;
};

function fail(message: string): never {
  throw new Error(`[quicklog-fixture-lineage] ${message}`);
}

function requireSingle<T>(rows: T[] | null, label: string): T {
  if (!rows || rows.length !== 1) {
    fail(`${label} must resolve to exactly one row in the disposable account.`);
  }
  return rows[0];
}

function routePlantId(url: string): string {
  const pathname = new URL(url).pathname;
  const parts = pathname.split("/").filter(Boolean);
  const plantsIndex = parts.lastIndexOf("plants");
  const id = plantsIndex >= 0 ? parts[plantsIndex + 1] : "";
  if (!SAFE_ID.test(id)) fail("configured plant URL has no safe route target.");
  return id;
}

function requireE2EName(value: string, label: string): string {
  const name = value.trim();
  if (!name || !/e2e|test/i.test(name)) {
    fail(`${label} must be a non-empty E2E/Test fixture name.`);
  }
  return name;
}

const fixtureEnv = {
  E2E_FIXTURE_MODE: process.env.E2E_FIXTURE_MODE,
  E2E_GROW_1_PLANT_URL: process.env.E2E_GROW_1_PLANT_URL,
  E2E_FIXTURE_EXPECTED_GROW_NAME: process.env.E2E_FIXTURE_EXPECTED_GROW_NAME,
  E2E_FIXTURE_EXPECTED_TENT_NAME: process.env.E2E_FIXTURE_EXPECTED_TENT_NAME,
  E2E_FIXTURE_EXPECTED_PLANT_NAME: process.env.E2E_FIXTURE_EXPECTED_PLANT_NAME,
};
const envCheck = validateFixtureEnv(fixtureEnv);
if (!envCheck.ok) fail("fixture environment failed the existing safety contract.");

const plantUrl = fixtureEnv.E2E_GROW_1_PLANT_URL!;
if (isLikelyRealPlantUrl(plantUrl)) {
  fail("production plant URLs are never eligible for fixture repair.");
}

const baseUrl = process.env.E2E_BASE_URL?.trim() ?? "";
if (!baseUrl || isLikelyRealPlantUrl(baseUrl)) {
  fail("fixture repair requires a non-production E2E base URL.");
}

const email = process.env.E2E_TEST_EMAIL;
const password = process.env.E2E_TEST_PASSWORD;
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!email || !password || !supabaseUrl || !publishableKey) {
  fail("required E2E authentication or public Supabase configuration is missing.");
}

const expectedTent = requireE2EName(envCheck.expected.tent, "expected tent");
const expectedPlant = requireE2EName(envCheck.expected.plant, "expected plant");
const expectedGrow = requireE2EName(envCheck.expected.grow || CANONICAL_GROW_NAME, "expected grow");
const secondPlantName = requireE2EName(
  process.env.E2E_GROW_1_SECOND_PLANT_NAME || DEFAULT_SECOND_PLANT_NAME,
  "second plant",
);

const supabase = createClient(supabaseUrl, publishableKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
  email,
  password,
});
if (authError || !authData.user) fail("normal E2E account sign-in failed.");
const userId = authData.user.id;

try {
  const { data: tentRows, error: tentError } = await supabase
    .from("tents")
    .select("id,name,grow_id")
    .eq("name", expectedTent)
    .eq("is_archived", false);
  if (tentError) fail("could not read the expected tent through RLS.");
  const tent = requireSingle((tentRows ?? []) as TentRow[], "expected tent");

  const configuredPlantId = routePlantId(plantUrl);
  const { data: plantRows, error: plantError } = await supabase
    .from("plants")
    .select("id,name,tent_id,grow_id")
    .eq("id", configuredPlantId)
    .eq("name", expectedPlant)
    .eq("is_archived", false);
  if (plantError) fail("could not read the configured plant through RLS.");
  const plant = requireSingle((plantRows ?? []) as PlantRow[], "configured plant");
  if (plant.tent_id !== tent.id) {
    fail("configured plant is not assigned to the expected tent.");
  }

  let grow: GrowRow;
  if (tent.grow_id) {
    const { data: existingGrowRows, error: existingGrowError } = await supabase
      .from("grows")
      .select("id,name")
      .eq("id", tent.grow_id)
      .eq("is_archived", false);
    if (existingGrowError) fail("could not read the tent grow through RLS.");
    grow = requireSingle((existingGrowRows ?? []) as GrowRow[], "tent grow");
    requireE2EName(grow.name, "tent grow");
  } else {
    const { data: namedGrowRows, error: namedGrowError } = await supabase
      .from("grows")
      .select("id,name")
      .eq("name", expectedGrow)
      .eq("is_archived", false);
    if (namedGrowError) fail("could not read the canonical E2E grow through RLS.");

    if ((namedGrowRows ?? []).length > 1) {
      fail("canonical E2E grow name is duplicated; manual review is required.");
    }
    if ((namedGrowRows ?? []).length === 1) {
      grow = (namedGrowRows as GrowRow[])[0];
    } else {
      const { data: createdGrow, error: createGrowError } = await supabase
        .from("grows")
        .insert({ user_id: userId, name: expectedGrow })
        .select("id,name")
        .single();
      if (createGrowError || !createdGrow) {
        fail("could not create the canonical E2E grow through RLS.");
      }
      grow = createdGrow as GrowRow;
    }

    const { data: updatedTent, error: updateTentError } = await supabase
      .from("tents")
      .update({ grow_id: grow.id })
      .eq("id", tent.id)
      .is("grow_id", null)
      .select("id")
      .maybeSingle();
    if (updateTentError || !updatedTent) {
      fail("tent lineage changed concurrently or could not be repaired through RLS.");
    }
  }

  if (plant.grow_id && plant.grow_id !== grow.id) {
    fail("configured plant already belongs to a different grow; refusing to overwrite it.");
  }
  if (!plant.grow_id) {
    const { data: updatedPlant, error: updatePlantError } = await supabase
      .from("plants")
      .update({ grow_id: grow.id })
      .eq("id", plant.id)
      .is("grow_id", null)
      .select("id")
      .maybeSingle();
    if (updatePlantError || !updatedPlant) {
      fail("plant lineage changed concurrently or could not be repaired through RLS.");
    }
  }

  const { data: secondRows, error: secondError } = await supabase
    .from("plants")
    .select("id,name,tent_id,grow_id")
    .eq("name", secondPlantName)
    .eq("is_archived", false);
  if (secondError) fail("could not read the second E2E plant through RLS.");
  if ((secondRows ?? []).length > 1) {
    fail("second E2E plant name is duplicated; manual review is required.");
  }
  if ((secondRows ?? []).length === 0) {
    const { error: createSecondError } = await supabase.from("plants").insert({
      user_id: userId,
      name: secondPlantName,
      tent_id: tent.id,
      grow_id: grow.id,
      stage: "seedling",
      health: "healthy",
      plant_type: "unknown",
    });
    if (createSecondError) fail("could not create the second E2E plant through RLS.");
  } else {
    const second = (secondRows as PlantRow[])[0];
    if (second.tent_id !== tent.id) {
      fail("second E2E plant belongs to another tent; refusing to move it.");
    }
    if (second.grow_id && second.grow_id !== grow.id) {
      fail("second E2E plant belongs to another grow; refusing to overwrite it.");
    }
    if (!second.grow_id) {
      const { data: updatedSecond, error: updateSecondError } = await supabase
        .from("plants")
        .update({ grow_id: grow.id })
        .eq("id", second.id)
        .is("grow_id", null)
        .select("id")
        .maybeSingle();
      if (updateSecondError || !updatedSecond) {
        fail("second plant lineage changed concurrently or could not be repaired through RLS.");
      }
    }
  }

  console.log(
    "[quicklog-fixture-lineage] PASS — disposable E2E grow/tent/plant lineage is complete.",
  );
} finally {
  await supabase.auth.signOut();
}
