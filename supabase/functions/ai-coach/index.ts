import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

type Mode = "diagnose" | "next_steps";
interface Body {
  mode: Mode;
  growId?: string;
  photoUrl?: string;
  question?: string;
}

interface DiaryRow {
  id: string;
  note: string | null;
  stage: string | null;
  entry_at: string;
  photo_url: string | null;
  plant_id: string | null;
  tent_id: string | null;
  details: Record<string, unknown> | null;
}

const EMPTY_ANALYSIS = {
  summary: "No diary entries yet — log a note, photo, or sensor snapshot to get a real diagnosis.",
  likely_issue: null,
  confidence: "low",
  risk_level: "unknown",
  evidence: [],
  possible_causes: [],
  recommended_actions: [
    "Open Quick Log and add today's observation (note + photo if possible).",
    "Attach a sensor snapshot so the coach can see environment trends.",
  ],
  do_not_do: [],
  follow_up_24h: "Log at least one entry in the next 24 hours.",
  follow_up_3_day: "Aim for 3 entries across the next 3 days to establish a baseline.",
};

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
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableKey) return json({ error: "AI not configured" }, 500);

    // --- gather real context ---
    let grow: Record<string, unknown> | null = null;
    let entries: DiaryRow[] = [];
    const plantsById = new Map<string, Record<string, unknown>>();
    const tentsById = new Map<string, Record<string, unknown>>();
    let latestSnapshot: Record<string, unknown> | null = null;

    if (body.growId) {
      const { data: g } = await supabase.from("grows").select("*").eq("id", body.growId).maybeSingle();
      grow = g;

      const { data: e } = await supabase
        .from("diary_entries")
        .select("id,note,stage,entry_at,photo_url,plant_id,tent_id,details")
        .eq("grow_id", body.growId)
        .order("entry_at", { ascending: false })
        .limit(12);
      entries = (e ?? []) as DiaryRow[];

      const plantIds = [...new Set(entries.map((x) => x.plant_id).filter(Boolean) as string[])];
      const tentIds = [...new Set(entries.map((x) => x.tent_id).filter(Boolean) as string[])];

      if (plantIds.length) {
        const { data: p } = await supabase
          .from("plants").select("id,name,strain,stage,health").in("id", plantIds);
        (p ?? []).forEach((row: Record<string, unknown>) => plantsById.set(row.id as string, row));
      }
      if (tentIds.length) {
        const { data: t } = await supabase
          .from("tents").select("id,name,stage,size").in("id", tentIds);
        (t ?? []).forEach((row: Record<string, unknown>) => tentsById.set(row.id as string, row));
      }

      for (const row of entries) {
        const snap = (row.details as Record<string, unknown> | null)?.sensor_snapshot;
        if (snap && typeof snap === "object") { latestSnapshot = snap as Record<string, unknown>; break; }
      }
    }

    const sparse = entries.length < 2;
    const empty = !grow || entries.length === 0;

    if (empty && !body.photoUrl) {
      return json({ analysis: EMPTY_ANALYSIS, sparse: true, empty: true });
    }

    // --- build structured context block ---
    const ctxLines: string[] = [];
    if (grow) {
      ctxLines.push(`GROW: ${grow.name} | type=${grow.grow_type} | stage=${grow.stage} | started=${grow.started_at}`);
    }
    if (latestSnapshot) {
      ctxLines.push(`LATEST_SENSOR_SNAPSHOT: ${JSON.stringify(latestSnapshot)}`);
    } else {
      ctxLines.push("LATEST_SENSOR_SNAPSHOT: none");
    }
    ctxLines.push(`ENTRY_COUNT: ${entries.length}${sparse ? " (sparse)" : ""}`);
    ctxLines.push("");
    ctxLines.push("RECENT_ENTRIES (newest first):");
    for (const [i, row] of entries.entries()) {
      const plant = row.plant_id ? plantsById.get(row.plant_id) : null;
      const tent = row.tent_id ? tentsById.get(row.tent_id) : null;
      const parts = [
        `#${i + 1}`,
        new Date(row.entry_at).toISOString(),
        row.stage ? `stage=${row.stage}` : null,
        plant ? `plant=${plant.name}/${plant.strain ?? "?"} stage=${plant.stage} health=${plant.health}` : null,
        tent ? `tent=${tent.name} stage=${tent.stage} size=${tent.size ?? "?"}` : null,
        row.photo_url ? "photo=yes" : null,
        row.note ? `note="${String(row.note).slice(0, 240)}"` : null,
      ].filter(Boolean);
      ctxLines.push(parts.join(" | "));
    }

    const context = ctxLines.join("\n");

    const system = `You are Verdant's AI Grow Doctor for cannabis cultivation. Use ONLY the provided context. Do not invent sensor values, plants, or history. If data is sparse or a single photo/reading is the only signal, lower confidence and say so.

Return STRICT JSON ONLY (no prose, no markdown) matching this exact shape:
{
  "summary": string,
  "likely_issue": string | null,
  "confidence": "low" | "medium" | "high",
  "risk_level": "low" | "medium" | "high" | "unknown",
  "evidence": string[],
  "possible_causes": string[],
  "recommended_actions": string[],
  "do_not_do": string[],
  "follow_up_24h": string,
  "follow_up_3_day": string
}

Rules:
- summary: 1-2 sentences in plain language.
- likely_issue: short label (e.g. "Nitrogen deficiency", "VPD too high"), or null if unclear.
- confidence: "low" if only one photo OR one sensor reading OR <2 diary entries.
- evidence: bullet facts pulled DIRECTLY from context (cite entry numbers/dates or snapshot metrics).
- If context is sparse, say so explicitly in summary and keep recommended_actions to safe, reversible steps.
- do_not_do: warn against destructive actions a grower might be tempted to take.
- ${body.mode === "next_steps" ? "Bias toward forward-looking next steps in recommended_actions." : "Bias toward diagnosis in summary + likely_issue."}
`;

    const userContent: Array<Record<string, unknown>> = [];
    if (body.photoUrl) userContent.push({ type: "image_url", image_url: { url: body.photoUrl } });
    const text = (body.question ? `QUESTION: ${body.question}\n\n` : "") + context;
    userContent.push({ type: "text", text });

    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${lovableKey}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: userContent },
        ],
      }),
    });

    if (r.status === 429) return json({ error: "Rate limit hit, try again soon." }, 429);
    if (r.status === 402) return json({ error: "AI credits exhausted. Add credits in workspace settings." }, 402);
    if (!r.ok) return json({ error: `AI error ${r.status}` }, 500);
    const data = await r.json();
    const raw = data.choices?.[0]?.message?.content ?? "{}";
    let analysis: Record<string, unknown>;
    try { analysis = JSON.parse(raw); }
    catch { analysis = { ...EMPTY_ANALYSIS, summary: "AI returned unparseable output.", confidence: "low" }; }

    return json({ analysis, sparse, empty: false });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
