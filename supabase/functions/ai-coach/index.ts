import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

type Mode = "diagnose" | "next_steps";
interface Body {
  mode: Mode;
  growId?: string;
  photoUrl?: string;
  question?: string;
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
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableKey) return json({ error: "AI not configured" }, 500);

    let context = "";
    if (body.growId) {
      const { data: grow } = await supabase.from("grows").select("*").eq("id", body.growId).maybeSingle();
      const { data: entries } = await supabase
        .from("diary_entries").select("note,stage,details,entry_at,photo_url")
        .eq("grow_id", body.growId).order("entry_at", { ascending: false }).limit(8);
      if (grow) {
        context = `Current grow: "${grow.name}" (${grow.grow_type}, stage: ${grow.stage}, started ${grow.started_at}).\n\n`;
        if (entries?.length) {
          context += "Recent diary entries (newest first):\n" + entries.map((e: any, i: number) =>
            `${i + 1}. [${new Date(e.entry_at).toLocaleDateString()}${e.stage ? " · " + e.stage : ""}] ${e.note}${
              Object.keys(e.details || {}).length ? " · details: " + JSON.stringify(e.details) : ""
            }`).join("\n");
        }
      }
    }

    const system = body.mode === "next_steps"
      ? "You are a friendly, practical cannabis grow coach. Based on the grower's recent diary, give 3-5 short, actionable next steps for the next few days. Use plain layman's language. Be specific. No disclaimers, no medical advice."
      : "You are a friendly, practical cannabis plant doctor. Look at the photo and recent diary. Give: (1) what you see, (2) most likely cause, (3) 2-4 simple actions to take. Plain layman's language, no jargon. If unsure, say so.";

    const userContent: any[] = [];
    if (body.photoUrl) userContent.push({ type: "image_url", image_url: { url: body.photoUrl } });
    const text = (body.question ? `Question: ${body.question}\n\n` : "") +
      (context || "No grow context provided.");
    userContent.push({ type: "text", text });

    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${lovableKey}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
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
    const reply = data.choices?.[0]?.message?.content ?? "No response.";
    return json({ reply });
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
