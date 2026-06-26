import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { buildBreedingActionQueuePayloads } from "../_shared/genetics/breedingActionQueue.ts";
import type { BreedingEvent } from "../_shared/genetics/breedingTypes.ts";

interface Body {
  event_id?: string;
  breeding_event_type?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );

    const { data: u } = await supabase.auth.getUser();
    if (!u?.user) return json({ error: "unauthorized" }, 401);

    const body = (await req.json()) as Body;
    if (!body.event_id) {
      return json({ error: "missing event_id" }, 400);
    }

    // 1. Fetch the event
    const { data: eventRow, error: fetchErr } = await supabase
      .from("grow_events")
      .select("id, event_type, occurred_at, grow_id, plant_id, tent_id")
      .eq("id", body.event_id)
      .maybeSingle();

    if (fetchErr) {
      console.error("fetchErr", fetchErr);
      return json({ error: "database error fetching event" }, 500);
    }

    if (!eventRow) {
      return json({ error: "event not found" }, 404);
    }

    // 2. Map row to BreedingEvent
    // Prefer breeding_event_type from the request body (the grow_events.event_type may be
    // stored as "observation" to satisfy the DB constraint; the true breeding subtype is
    // passed explicitly by the client).
    const breedingEvent: BreedingEvent = {
      id: eventRow.id,
      type: body.breeding_event_type ?? eventRow.event_type,
      occurred_at: eventRow.occurred_at,
      plant_id: eventRow.plant_id ?? undefined,
      tent_id: eventRow.tent_id ?? undefined,
    };

    // 3. Generate suggestions
    const payloads = buildBreedingActionQueuePayloads(
      breedingEvent,
      eventRow.grow_id,
      eventRow.plant_id,
      eventRow.tent_id,
    );

    if (payloads.length === 0) {
      return json({ ok: true, inserted: 0 });
    }

    // 4. Insert into action_queue, returning IDs for per-row audit events
    const { data: insertedRows, error: insertErr } = await supabase
      .from("action_queue")
      .insert(payloads)
      .select("id, plant_id");

    if (insertErr) {
      console.error("insertErr", insertErr);
      return json({ error: "database error inserting suggestions" }, 500);
    }

    const rows = insertedRows ?? [];
    return json({
      ok: true,
      inserted: rows.length,
      actionIds: rows.map((r: { id: string; plant_id: string | null }) => ({
        id: r.id,
        plantId: r.plant_id,
      })),
    });
  } catch (e) {
    console.error("create-breeding-suggestions unhandled_error", e);
    return json({ error: "server_error" }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
