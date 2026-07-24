/**
 * Browser OAuth 2.1 test-client for the Verdant MCP server.
 *
 * SAFETY:
 * - PKCE + Dynamic Client Registration (DCR) against the Supabase issuer.
 * - Access token lives only in sessionStorage under a namespaced key, is
 *   never rendered in the UI, and never logged. The Agent Integrations
 *   page only exposes derived booleans ("connected: yes/no"), the last
 *   probe status, and the tools list (public metadata).
 * - Same-origin redirect_uri only; validated before use.
 * - Errors are collapsed to a coarse message; raw error bodies (which
 *   can echo tokens) are never returned to the caller.
 */

const SS_KEYS = {
  client: "verdant.mcp.oauth.clientRegistration.v1",
  pkce: "verdant.mcp.oauth.pkce.v1",
  token: "verdant.mcp.oauth.token.v1",
} as const;

const SCOPE = "openid email profile";

export type OAuthDiscovery = {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint?: string;
};

export type ProbeStatus =
  | "not_connected"
  | "connected"
  | "unauthorized"
  | "failed";

export type ProbeResult = {
  status: ProbeStatus;
  toolCount?: number;
  toolNames?: string[];
  growCount?: number;
  message: string;
  checkedAt: string;
};

function base64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256(input: string): Promise<Uint8Array> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return new Uint8Array(digest);
}

function randomString(bytes = 32): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return base64url(arr);
}

let discoveryCache: OAuthDiscovery | null = null;
export async function fetchDiscovery(issuer: string): Promise<OAuthDiscovery> {
  if (discoveryCache && discoveryCache.issuer === issuer) return discoveryCache;
  // Supabase publishes oauth-authorization-server; fall back to openid.
  const urls = [
    `${issuer}/.well-known/oauth-authorization-server`,
    `${issuer}/.well-known/openid-configuration`,
  ];
  let lastErr: unknown = null;
  for (const u of urls) {
    try {
      const res = await fetch(u, { headers: { accept: "application/json" } });
      if (!res.ok) continue;
      const json = (await res.json()) as OAuthDiscovery;
      if (json.authorization_endpoint && json.token_endpoint) {
        discoveryCache = json;
        return json;
      }
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error("Could not fetch OAuth discovery metadata");
}

type RegisteredClient = { client_id: string; redirect_uri: string };

async function getOrRegisterClient(
  discovery: OAuthDiscovery,
  redirectUri: string,
): Promise<RegisteredClient> {
  const raw = sessionStorage.getItem(SS_KEYS.client);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as RegisteredClient;
      if (parsed.client_id && parsed.redirect_uri === redirectUri) return parsed;
    } catch {
      /* ignore, re-register */
    }
  }
  if (!discovery.registration_endpoint) {
    throw new Error("Authorization server does not support dynamic client registration");
  }
  const res = await fetch(discovery.registration_endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      client_name: "Verdant browser test client",
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      scope: SCOPE,
    }),
  });
  if (!res.ok) throw new Error(`Client registration failed (${res.status})`);
  const body = (await res.json()) as { client_id?: string };
  if (!body.client_id) throw new Error("Client registration did not return a client_id");
  const rec: RegisteredClient = { client_id: body.client_id, redirect_uri: redirectUri };
  sessionStorage.setItem(SS_KEYS.client, JSON.stringify(rec));
  return rec;
}

export function sameOriginRedirect(path: string): string {
  const url = new URL(path, window.location.origin);
  if (url.origin !== window.location.origin) {
    throw new Error("redirect_uri must be same-origin");
  }
  return url.toString();
}

export async function startAuthorization(
  issuer: string,
  redirectPath: string,
): Promise<void> {
  const discovery = await fetchDiscovery(issuer);
  const redirectUri = sameOriginRedirect(redirectPath);
  const client = await getOrRegisterClient(discovery, redirectUri);
  const verifier = randomString(32);
  const challenge = base64url(await sha256(verifier));
  const state = randomString(16);
  sessionStorage.setItem(
    SS_KEYS.pkce,
    JSON.stringify({ verifier, state, redirect_uri: redirectUri, client_id: client.client_id }),
  );
  const url = new URL(discovery.authorization_endpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", client.client_id);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", SCOPE);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  window.location.href = url.toString();
}

export type CallbackParams = { code: string; state: string };

export function readCallbackParams(search: string): CallbackParams | null {
  const sp = new URLSearchParams(search);
  const code = sp.get("code");
  const state = sp.get("state");
  if (!code || !state) return null;
  return { code, state };
}

export async function completeAuthorization(
  issuer: string,
  params: CallbackParams,
): Promise<void> {
  const raw = sessionStorage.getItem(SS_KEYS.pkce);
  if (!raw) throw new Error("No pending authorization in this browser");
  const pending = JSON.parse(raw) as {
    verifier: string;
    state: string;
    redirect_uri: string;
    client_id: string;
  };
  if (pending.state !== params.state) throw new Error("OAuth state mismatch");
  const discovery = await fetchDiscovery(issuer);
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: params.code,
    redirect_uri: pending.redirect_uri,
    client_id: pending.client_id,
    code_verifier: pending.verifier,
  });
  const res = await fetch(discovery.token_endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
    },
    body: body.toString(),
  });
  if (!res.ok) {
    sessionStorage.removeItem(SS_KEYS.pkce);
    throw new Error(`Token exchange failed (${res.status})`);
  }
  const tok = (await res.json()) as {
    access_token?: string;
    token_type?: string;
    expires_in?: number;
  };
  if (!tok.access_token) throw new Error("Token endpoint returned no access_token");
  sessionStorage.removeItem(SS_KEYS.pkce);
  sessionStorage.setItem(
    SS_KEYS.token,
    JSON.stringify({
      access_token: tok.access_token,
      obtained_at: Date.now(),
      expires_in: tok.expires_in ?? 3600,
    }),
  );
}

export function hasStoredToken(): boolean {
  const raw = sessionStorage.getItem(SS_KEYS.token);
  if (!raw) return false;
  try {
    const t = JSON.parse(raw) as { obtained_at: number; expires_in: number };
    const ageSec = (Date.now() - t.obtained_at) / 1000;
    return ageSec < t.expires_in - 30;
  } catch {
    return false;
  }
}

export function disconnect(): void {
  sessionStorage.removeItem(SS_KEYS.token);
  sessionStorage.removeItem(SS_KEYS.pkce);
  sessionStorage.removeItem(SS_KEYS.client);
}

function readToken(): string | null {
  const raw = sessionStorage.getItem(SS_KEYS.token);
  if (!raw) return null;
  try {
    return (JSON.parse(raw) as { access_token: string }).access_token ?? null;
  } catch {
    return null;
  }
}

type JsonRpcResp<T = unknown> = {
  jsonrpc: "2.0";
  id: number | string | null;
  result?: T;
  error?: { code: number; message: string };
};

async function mcpCall<T>(endpoint: string, token: string, method: string, params: unknown, id: number): Promise<JsonRpcResp<T>> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      authorization: `Bearer ${token}`,
      "mcp-protocol-version": "2025-06-18",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
  if (res.status === 401 || res.status === 403) {
    throw Object.assign(new Error("unauthorized"), { unauthorized: true });
  }
  if (!res.ok) throw new Error(`MCP ${method} failed (${res.status})`);
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("text/event-stream")) {
    const text = await res.text();
    // Take last data: line
    const line = text
      .split("\n")
      .reverse()
      .find((l) => l.startsWith("data: "));
    if (!line) throw new Error(`MCP ${method} returned empty stream`);
    return JSON.parse(line.slice(6)) as JsonRpcResp<T>;
  }
  return (await res.json()) as JsonRpcResp<T>;
}

export async function probeTools(endpoint: string): Promise<ProbeResult> {
  const checkedAt = new Date().toISOString();
  const token = readToken();
  if (!token) {
    return {
      status: "not_connected",
      message: "Not connected — start OAuth to run a live probe.",
      checkedAt,
    };
  }
  try {
    // 1) initialize
    await mcpCall(endpoint, token, "initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "verdant-browser-test", version: "0.1.0" },
    }, 1);
    // 2) tools/list
    const list = await mcpCall<{ tools: Array<{ name: string }> }>(
      endpoint, token, "tools/list", {}, 2,
    );
    if (list.error) throw new Error(list.error.message);
    const toolNames = (list.result?.tools ?? []).map((t) => t.name);
    // 3) tools/call list_grows
    const call = await mcpCall<{
      content?: Array<{ type: string; text?: string }>;
      structuredContent?: { grows?: unknown[] };
      isError?: boolean;
    }>(endpoint, token, "tools/call", {
      name: "list_grows",
      arguments: { limit: 1 },
    }, 3);
    if (call.error) throw new Error(call.error.message);
    let growCount: number | undefined;
    const sc = call.result?.structuredContent;
    if (sc && Array.isArray(sc.grows)) growCount = sc.grows.length;
    else if (Array.isArray(call.result?.content)) {
      const t = call.result.content.find((c) => c.type === "text")?.text;
      if (t) {
        try {
          const parsed = JSON.parse(t) as { grows?: unknown[] } | unknown[];
          growCount = Array.isArray(parsed)
            ? parsed.length
            : Array.isArray(parsed.grows) ? parsed.grows.length : undefined;
        } catch {
          /* ignore parse — count remains undefined */
        }
      }
    }
    return {
      status: "connected",
      toolCount: toolNames.length,
      toolNames,
      growCount,
      message:
        typeof growCount === "number"
          ? `list_grows returned ${growCount} grow(s) for your account.`
          : "list_grows call succeeded.",
      checkedAt,
    };
  } catch (e) {
    const unauth = (e as { unauthorized?: boolean }).unauthorized === true;
    return {
      status: unauth ? "unauthorized" : "failed",
      message: unauth
        ? "Token was rejected. Reconnect to refresh authorization."
        : "Live probe failed. Try again or reconnect.",
      checkedAt,
    };
  }
}

export type ToolCallOutcome =
  | { status: "not_connected"; message: string }
  | { status: "unauthorized"; message: string }
  | { status: "error"; message: string; code?: number }
  | {
      status: "ok";
      result: {
        content?: Array<{ type: string; text?: string }>;
        structuredContent?: unknown;
        isError?: boolean;
      };
    };

/**
 * Invoke an MCP tool by name with arbitrary arguments using the browser's
 * stored OAuth token. Returns a coarse outcome — never throws raw error
 * bodies (which could echo tokens) to the caller.
 */
export async function callMcpTool(
  endpoint: string,
  name: string,
  args: Record<string, unknown>,
): Promise<ToolCallOutcome> {
  const token = readToken();
  if (!token) {
    return {
      status: "not_connected",
      message: "Not connected. Connect this browser from Settings → Agent integrations first.",
    };
  }
  try {
    // Ensure the session is initialized before the first call in a fresh tab.
    await mcpCall(endpoint, token, "initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "verdant-tool-explorer", version: "0.1.0" },
    }, 1);
    const resp = await mcpCall<{
      content?: Array<{ type: string; text?: string }>;
      structuredContent?: unknown;
      isError?: boolean;
    }>(endpoint, token, "tools/call", { name, arguments: args }, 2);
    if (resp.error) {
      return { status: "error", message: resp.error.message, code: resp.error.code };
    }
    return { status: "ok", result: resp.result ?? {} };
  } catch (e) {
    const unauth = (e as { unauthorized?: boolean }).unauthorized === true;
    if (unauth) {
      return {
        status: "unauthorized",
        message: "Token was rejected. Reconnect from Settings → Agent integrations.",
      };
    }
    return { status: "error", message: "Tool call failed. Try again or reconnect." };
  }
}

