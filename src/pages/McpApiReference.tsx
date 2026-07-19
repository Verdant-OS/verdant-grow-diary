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
import { useState } from "react";
import { Link } from "react-router-dom";
import { Check, Copy } from "lucide-react";
import BrandLogo from "@/components/BrandLogo";
import { usePageSeo } from "@/hooks/usePageSeo";
import McpToolExplorer from "@/components/mcp/McpToolExplorer";

const ENDPOINT = "https://knkwiiywfkbqznbxwqfh.supabase.co/functions/v1/mcp";

function Code({ children, copyLabel }: { children: string; copyLabel?: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(children);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard unavailable (e.g. insecure context) — silently no-op.
    }
  };
  return (
    <div className="relative group">
      <pre className="bg-muted text-foreground text-xs rounded-md p-4 pr-12 overflow-x-auto border border-border">
        <code>{children}</code>
      </pre>
      <button
        type="button"
        onClick={onCopy}
        aria-label={copied ? "Copied" : (copyLabel ?? "Copy to clipboard")}
        data-testid="mcp-api-copy-button"
        className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-md border border-border bg-background/80 px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-background focus:outline-none focus:ring-2 focus:ring-ring"
      >
        {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
        <span>{copied ? "Copied" : "Copy"}</span>
      </button>
    </div>
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

        <Section id="explorer" title="Interactive tool explorer">
          <p className="text-sm text-muted-foreground">
            Call each tool live as your signed-in account. Connect this browser
            once from{" "}
            <Link to="/settings/agent-integrations" className="underline">
              Settings → Agent integrations
            </Link>{" "}
            and the explorer will reuse that OAuth session.
          </p>
          <McpToolExplorer />
        </Section>

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
            The server distinguishes two error surfaces. <strong>Transport-level</strong>{" "}
            failures (missing or invalid OAuth token) come back as a JSON-RPC{" "}
            <code>error</code> object with an HTTP <code>401</code>.{" "}
            <strong>Tool-level</strong> failures (bad parameters, unknown grow,
            unknown tent) come back as a normal <code>tools/call</code>{" "}
            <code>result</code> with <code>isError: true</code> and a
            human-readable text message — the JSON-RPC envelope itself is a
            success.
          </p>

          <h3 className="text-sm font-semibold" id="error-unauthorized">
            401 Unauthorized
          </h3>
          <p className="text-sm text-muted-foreground">
            The bearer token is missing, expired, revoked, or was not issued by
            this app's OAuth server (for example, a copied Supabase session
            JWT). The response includes a{" "}
            <code>WWW-Authenticate</code> header pointing at the OAuth
            protected-resource metadata.
          </p>
          <Code copyLabel="Copy unauthorized response">{`HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer resource_metadata="https://knkwiiywfkbqznbxwqfh.supabase.co/functions/v1/mcp/.well-known/oauth-protected-resource"
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32001,
    "message": "Unauthorized"
  }
}`}</Code>
          <p className="text-sm text-muted-foreground">
            <strong>How to recover:</strong> do not retry with the same token.
            Run the OAuth 2.1 authorization-code + PKCE flow again against the
            issuer above, or — in this browser — click{" "}
            <em>Disconnect</em> then <em>Connect this browser</em> from{" "}
            <Link to="/settings/agent-integrations" className="underline">
              Settings → Agent integrations
            </Link>
            . Never paste an app session token as a workaround; the server
            requires an <code>oauth_client</code> claim and will keep rejecting
            it.
          </p>

          <h3 className="text-sm font-semibold" id="error-invalid-params">
            Invalid parameters
          </h3>
          <p className="text-sm text-muted-foreground">
            The bearer token was accepted, but the tool's Zod input schema
            rejected the arguments — for example a missing{" "}
            <code>growId</code>, a malformed UUID, or a <code>limit</code> out
            of range. The JSON-RPC call succeeds; the tool result carries the
            failure.
          </p>
          <Code copyLabel="Copy invalid-parameters response">{`{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "isError": true,
    "content": [
      {
        "type": "text",
        "text": "Invalid parameters for tool \\"list_recent_diary_entries\\": growId: Required; limit: Number must be less than or equal to 50"
      }
    ]
  }
}`}</Code>
          <p className="text-sm text-muted-foreground">
            <strong>How to recover:</strong> read the field list in the message,
            correct the arguments against the parameter tables above, and retry
            the same JSON-RPC call. Do not fall back to a wider tool or invent
            an id — an unknown <code>growId</code>/<code>tentId</code> that
            parses as a UUID surfaces as the ownership errors below, not this
            one.
          </p>

          <h3 className="text-sm font-semibold" id="error-not-found">
            Not found for the signed-in grower
          </h3>
          <p className="text-sm text-muted-foreground">
            The id parses correctly but is either unknown or belongs to another
            grower. RLS returns the same "not found" either way so ownership is
            never leaked through the error.
          </p>
          <Code copyLabel="Copy not-found response">{`{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "isError": true,
    "content": [
      { "type": "text", "text": "Grow not found for the signed-in grower." }
    ]
  }
}`}</Code>
          <p className="text-sm text-muted-foreground">
            <strong>How to recover:</strong> call <code>list_grows</code> (or,
            for tents, look them up inside a known grow in the app) to
            re-discover a valid id owned by the current user, then retry.
            Retrying the same id will keep returning this error.
          </p>
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
