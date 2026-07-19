/**
 * McpApiReference — public API reference for the Verdant Grow OS MCP server.
 *
 * Presenter only. No Supabase, no AI, no writes. Describes the three
 * currently advertised MCP tools (list_grows, list_recent_diary_entries,
 * get_latest_sensor_snapshot), their parameters, response shapes, and the
 * safety invariants baked into the server itself. Copy is derived from
 * the tool source of truth in src/lib/mcp/tools/* — keep in sync when
 * tool contracts change.
 */
import { Link } from "react-router-dom";
import BrandLogo from "@/components/BrandLogo";
import { usePageSeo } from "@/hooks/usePageSeo";

const ENDPOINT = "https://knkwiiywfkbqznbxwqfh.supabase.co/functions/v1/mcp";

function Code({ children }: { children: React.ReactNode }) {
  return (
    <pre className="bg-muted text-foreground text-xs rounded-md p-4 overflow-x-auto border border-border">
      <code>{children}</code>
    </pre>
  );
}

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 space-y-4">
      <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}

export default function McpApiReference() {
  usePageSeo({
    title: "Verdant Grow OS MCP API Reference | Tools, Parameters, Safety",
    description:
      "Reference for the Verdant Grow OS MCP server: list_grows, list_recent_diary_entries, and get_latest_sensor_snapshot — parameters, response examples, and safety invariants.",
    path: "/docs/mcp-api",
  });

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="px-6 py-5 flex items-center justify-between max-w-5xl mx-auto">
        <Link to="/welcome" aria-label="Verdant Grow Diary home">
          <BrandLogo size="md" showText />
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link to="/settings/agent-integrations" className="text-muted-foreground hover:text-foreground">
            Agent integrations
          </Link>
          <Link to="/guides" className="text-muted-foreground hover:text-foreground">
            Guides
          </Link>
        </nav>
      </header>

      <article className="max-w-4xl mx-auto px-6 pb-24 space-y-10">
        <div className="space-y-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">API reference</p>
          <h1 className="text-4xl font-bold tracking-tight">Verdant Grow OS MCP</h1>
          <p className="text-muted-foreground text-lg">
            A read-only Model Context Protocol server that lets an OAuth-signed-in
            grower's assistant read their own grows, diary entries, and latest
            sensor snapshot. No writes. No AI. No device control.
          </p>
        </div>

        <Section id="endpoint" title="Endpoint & auth">
          <p className="text-sm text-muted-foreground">
            Streamable HTTP transport (MCP spec 2025-06-18). Callers authenticate
            with an OAuth 2.1 bearer token issued by this app's authorization
            server — end users complete a consent screen at{" "}
            <code>/.lovable/oauth/consent</code>. Session JWTs pasted from other
            flows are rejected.
          </p>
          <Code>{`POST ${ENDPOINT}
Authorization: Bearer <oauth_access_token>
Content-Type: application/json`}</Code>
          <ul className="text-sm text-muted-foreground list-disc pl-6 space-y-1">
            <li>Issuer: <code>https://knkwiiywfkbqznbxwqfh.supabase.co/auth/v1</code></li>
            <li>Accepted audience: <code>authenticated</code></li>
            <li>Dynamic client registration is enabled — Claude, ChatGPT, Cursor, and Codex can self-register.</li>
          </ul>
        </Section>

        <Section id="safety" title="Safety invariants">
          <p className="text-sm text-muted-foreground">
            These properties hold for every tool below and are enforced in the
            server, not by convention:
          </p>
          <ul className="text-sm list-disc pl-6 space-y-2">
            <li>
              <strong>Read-only.</strong> Every tool is annotated{" "}
              <code>readOnlyHint: true</code>, <code>idempotentHint: true</code>,{" "}
              <code>openWorldHint: false</code>. There is no write, no AI call,
              and no device command surface.
            </li>
            <li>
              <strong>Own data only.</strong> All database reads go through the
              caller's OAuth token, so Supabase RLS runs as that user. The
              service-role key is never referenced in tool code.
            </li>
            <li>
              <strong>Ownership guard on nested reads.</strong>{" "}
              <code>list_recent_diary_entries</code> verifies the grow is
              visible to the caller before returning entries, so an
              operator-role account cannot use this server to read another
              grower's diary through the wider <code>diary_entries</code>{" "}
              policy.
            </li>
            <li>
              <strong>Sensor truth preserved.</strong>{" "}
              <code>source</code> and <code>quality</code> labels are returned
              verbatim. A reading is only current live telemetry when{" "}
              <code>current_live: true</code> (quality <code>ok</code> + source{" "}
              <code>live</code> + freshness <code>fresh</code>). Manual, csv,
              demo, sim, stale, and invalid rows keep their labels and are
              never re-labeled as live.
            </li>
            <li>
              <strong>No raw provenance leakage.</strong>{" "}
              <code>raw_payload</code> is selected long enough to exclude
              diagnostic Windows testbench rows, then stripped before the
              response is assembled.
            </li>
            <li>
              <strong>Deterministic snapshots.</strong> The latest-per-metric
              selection breaks ties by <code>ts DESC</code>,{" "}
              <code>created_at DESC</code>, then <code>id DESC</code>, so
              identical inputs never flip the snapshot between calls.
            </li>
          </ul>
        </Section>

        <Section id="list_grows" title="list_grows">
          <p className="text-sm text-muted-foreground">
            List the signed-in grower's own grows.
          </p>
          <h3 className="text-sm font-semibold">Parameters</h3>
          <ul className="text-sm list-disc pl-6 space-y-1">
            <li><code>includeArchived</code> — boolean, optional. Include archived grows. Defaults to <code>false</code>.</li>
            <li><code>limit</code> — integer 1–100, optional. Defaults to <code>25</code>.</li>
          </ul>
          <h3 className="text-sm font-semibold">Request</h3>
          <Code>{`{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "list_grows",
    "arguments": { "limit": 5 }
  }
}`}</Code>
          <h3 className="text-sm font-semibold">Response (structuredContent)</h3>
          <Code>{`{
  "grows": [
    {
      "id": "3f9a…",
      "name": "Tent A — Winter Run",
      "stage": "flower",
      "grow_type": "photoperiod",
      "is_archived": false,
      "started_at": "2026-05-14T00:00:00Z",
      "created_at": "2026-05-14T14:22:11Z",
      "updated_at": "2026-07-18T09:03:44Z"
    }
  ]
}`}</Code>
        </Section>

        <Section id="list_recent_diary_entries" title="list_recent_diary_entries">
          <p className="text-sm text-muted-foreground">
            List recent diary entries for one of the caller's own grows.
          </p>
          <h3 className="text-sm font-semibold">Parameters</h3>
          <ul className="text-sm list-disc pl-6 space-y-1">
            <li><code>growId</code> — uuid, required. Must belong to the caller.</li>
            <li><code>limit</code> — integer 1–50, optional. Defaults to <code>10</code>.</li>
          </ul>
          <h3 className="text-sm font-semibold">Request</h3>
          <Code>{`{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "list_recent_diary_entries",
    "arguments": {
      "growId": "3f9a1f7c-…",
      "limit": 5
    }
  }
}`}</Code>
          <h3 className="text-sm font-semibold">Response (structuredContent)</h3>
          <Code>{`{
  "entries": [
    {
      "id": "…",
      "grow_id": "3f9a1f7c-…",
      "plant_id": "…",
      "tent_id": "…",
      "stage": "flower",
      "note": "Watered 1.2L, runoff EC 1.8, pH 6.2.",
      "entry_at": "2026-07-18T08:44:00Z",
      "created_at": "2026-07-18T08:44:12Z"
    }
  ]
}`}</Code>
          <p className="text-xs text-muted-foreground">
            Presenter-safe fields only. Raw payloads, private image URLs, and
            internal detail JSON are never returned.
          </p>
        </Section>

        <Section id="get_latest_sensor_snapshot" title="get_latest_sensor_snapshot">
          <p className="text-sm text-muted-foreground">
            Latest reading per metric for one of the caller's own tents.
            Metrics: <code>temperature_c</code>, <code>humidity_pct</code>,{" "}
            <code>vpd_kpa</code>, <code>co2_ppm</code>,{" "}
            <code>soil_moisture_pct</code>, <code>soil_temp_c</code>,{" "}
            <code>ph</code>, <code>ec</code>, <code>ppfd</code>.
          </p>
          <h3 className="text-sm font-semibold">Parameters</h3>
          <ul className="text-sm list-disc pl-6 space-y-1">
            <li><code>tentId</code> — uuid, required. Must belong to the caller.</li>
          </ul>
          <h3 className="text-sm font-semibold">Request</h3>
          <Code>{`{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "get_latest_sensor_snapshot",
    "arguments": { "tentId": "b7ce…" }
  }
}`}</Code>
          <h3 className="text-sm font-semibold">Response (structuredContent)</h3>
          <Code>{`{
  "snapshot": {
    "tentId": "b7ce…",
    "readings": {
      "temperature_c": {
        "id": "…",
        "tent_id": "b7ce…",
        "metric": "temperature_c",
        "value": 24.6,
        "quality": "ok",
        "source": "live",
        "ts": "2026-07-19T09:12:00Z",
        "captured_at": "2026-07-19T09:11:58Z",
        "freshness": "fresh",
        "current_live": true
      },
      "vpd_kpa": {
        "metric": "vpd_kpa",
        "value": 1.12,
        "quality": "ok",
        "source": "manual",
        "ts": "2026-07-19T08:55:00Z",
        "captured_at": null,
        "freshness": "fresh",
        "current_live": false
      }
    }
  }
}`}</Code>
          <p className="text-xs text-muted-foreground">
            Only readings with <code>current_live: true</code> should be
            treated as current live telemetry. Every other combination —
            including <code>source: "manual"</code> at fresh quality — keeps
            its label and must not be presented as live.
          </p>
          <p className="text-xs text-muted-foreground">
            When a tent has no non-diagnostic readings, the response is{" "}
            <code>{`{ "snapshot": null }`}</code>.
          </p>
        </Section>

        <Section id="errors" title="Errors">
          <p className="text-sm text-muted-foreground">
            Tool-level failures return a normal MCP tool response with{" "}
            <code>isError: true</code> and a human-readable text message.
            Common cases:
          </p>
          <ul className="text-sm list-disc pl-6 space-y-1">
            <li><em>Unauthenticated</em> — no valid OAuth token was presented.</li>
            <li><em>Grow not found for the signed-in grower</em> — grow id is unknown or not visible to the caller.</li>
            <li><em>Tent not found for the signed-in grower</em> — tent id is unknown or not visible to the caller.</li>
          </ul>
        </Section>

        <Section id="connect" title="Connect a client">
          <p className="text-sm text-muted-foreground">
            The signed-in grower can verify tool access from the browser at{" "}
            <Link to="/settings/agent-integrations" className="underline">
              Settings → Agent integrations
            </Link>
            . Third-party clients (Claude, ChatGPT, Cursor, Codex) point at the
            endpoint above and complete the OAuth consent flow — no manual
            token pasting.
          </p>
        </Section>
      </article>
    </main>
  );
}
