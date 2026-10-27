/**
 * Deterministic coverage for the browser MCP OAuth client.
 * Fetch, storage, and window.location are mocked. No network and no real tokens.
 *
 * @source-scan-justified: not used — assertions call the module.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TOKEN_KEY = "verdant.mcp.oauth.token.v1";
const PKCE_KEY = "verdant.mcp.oauth.pkce.v1";
const CLIENT_KEY = "verdant.mcp.oauth.clientRegistration.v1";

const ORIGIN = "https://app.test";

type LocationStore = { href: string };

function installLocation(): LocationStore {
  const store: LocationStore = { href: `${ORIGIN}/` };
  vi.stubGlobal("location", {
    get origin() {
      return ORIGIN;
    },
    get href() {
      return store.href;
    },
    set href(value: string) {
      store.href = value;
    },
    assign: vi.fn(),
    replace: vi.fn(),
  });
  return store;
}

function discoveryDoc(issuer: string) {
  return {
    issuer,
    authorization_endpoint: `${issuer}/authorize`,
    token_endpoint: `${issuer}/token`,
    registration_endpoint: `${issuer}/register`,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function loadClient() {
  vi.resetModules();
  return import("@/lib/mcp/browserOAuthClient");
}

function base64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function s256(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}

describe("browserOAuthClient", () => {
  let localSets: string[];

  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    installLocation();
    localSets = [];
    vi.spyOn(localStorage, "setItem").mockImplementation((key: string) => {
      localSets.push(key);
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("rejects a state mismatch and leaves the pending PKCE record in place", async () => {
    const { completeAuthorization, hasPendingAuthorization } = await loadClient();
    sessionStorage.setItem(
      PKCE_KEY,
      JSON.stringify({
        verifier: "verifier-1",
        state: "issued-state",
        redirect_uri: `${ORIGIN}/callback`,
        client_id: "client-1",
      }),
    );
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      completeAuthorization("https://issuer-mismatch.test", {
        code: "auth-code",
        state: "other-state",
      }),
    ).rejects.toThrow("OAuth state mismatch");

    expect(fetchMock).not.toHaveBeenCalled();
    expect(hasPendingAuthorization()).toBe(true);
    expect(sessionStorage.getItem(PKCE_KEY)).toContain("issued-state");
    expect(sessionStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(localSets).toEqual([]);
  });

  it("readCallbackParams returns null unless both code and state are present", async () => {
    const { readCallbackParams } = await loadClient();
    expect(readCallbackParams("")).toBeNull();
    expect(readCallbackParams("?code=abc")).toBeNull();
    expect(readCallbackParams("?state=xyz")).toBeNull();
    expect(readCallbackParams("?code=&state=xyz")).toBeNull();
    expect(readCallbackParams("?code=abc&state=")).toBeNull();
    expect(readCallbackParams("?code=abc&state=xyz")).toEqual({ code: "abc", state: "xyz" });
  });

  it("readCallbackErrorParams returns null without error and keeps coarse error fields", async () => {
    const { readCallbackErrorParams } = await loadClient();
    expect(readCallbackErrorParams("")).toBeNull();
    expect(readCallbackErrorParams("?code=abc&state=xyz")).toBeNull();
    expect(readCallbackErrorParams("?error=access_denied")).toEqual({
      error: "access_denied",
      errorDescription: undefined,
      state: undefined,
    });
    expect(
      readCallbackErrorParams("?error=access_denied&error_description=denied&state=issued-state"),
    ).toEqual({
      error: "access_denied",
      errorDescription: "denied",
      state: "issued-state",
    });
  });

  it("sends code_verifier, redirect_uri, and client_id, then drops the pending record", async () => {
    const issuer = "https://issuer-exchange.test";
    const { completeAuthorization, hasPendingAuthorization, hasStoredToken } = await loadClient();
    sessionStorage.setItem(
      PKCE_KEY,
      JSON.stringify({
        verifier: "verifier-sent",
        state: "issued-state",
        redirect_uri: `${ORIGIN}/agent`,
        client_id: "client-sent",
      }),
    );
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/.well-known/oauth-authorization-server")) {
        return jsonResponse(discoveryDoc(issuer));
      }
      if (url.endsWith("/token")) {
        expect(init?.body).toEqual(expect.any(String));
        return jsonResponse({ access_token: "session-token", expires_in: 120 });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await completeAuthorization(issuer, { code: "auth-code", state: "issued-state" });

    const tokenCall = fetchMock.mock.calls.find((call) => String(call[0]).endsWith("/token"));
    expect(tokenCall).toBeTruthy();
    const sent = new URLSearchParams(String(tokenCall?.[1]?.body));
    expect(sent.get("grant_type")).toBe("authorization_code");
    expect(sent.get("code")).toBe("auth-code");
    expect(sent.get("code_verifier")).toBe("verifier-sent");
    expect(sent.get("redirect_uri")).toBe(`${ORIGIN}/agent`);
    expect(sent.get("client_id")).toBe("client-sent");
    expect(hasPendingAuthorization()).toBe(false);
    expect(hasStoredToken()).toBe(true);
    expect(sessionStorage.getItem(TOKEN_KEY)).toContain("session-token");
    expect(localSets).toEqual([]);
  });

  it("rejects a non-2xx token response, stores nothing, and clears the pending record", async () => {
    const issuer = "https://issuer-400.test";
    const { completeAuthorization, hasPendingAuthorization, hasStoredToken } = await loadClient();
    sessionStorage.setItem(
      PKCE_KEY,
      JSON.stringify({
        verifier: "verifier-400",
        state: "issued-state",
        redirect_uri: `${ORIGIN}/agent`,
        client_id: "client-400",
      }),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("oauth-authorization-server")) return jsonResponse(discoveryDoc(issuer));
        return new Response(JSON.stringify({ error: "invalid_grant", access_token: "leaked" }), {
          status: 400,
          headers: { "content-type": "application/json" },
        });
      }),
    );

    await expect(
      completeAuthorization(issuer, { code: "auth-code", state: "issued-state" }),
    ).rejects.toThrow("Token exchange failed (400)");
    expect(hasStoredToken()).toBe(false);
    expect(sessionStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(hasPendingAuthorization()).toBe(false);
    expect(localSets).toEqual([]);
  });

  it("rejects a network error and a malformed token body without storing a token", async () => {
    const networkIssuer = "https://issuer-network.test";
    const malformedIssuer = "https://issuer-malformed.test";
    const client = await loadClient();

    const seed = (verifier: string) => {
      sessionStorage.setItem(
        PKCE_KEY,
        JSON.stringify({
          verifier,
          state: "issued-state",
          redirect_uri: `${ORIGIN}/agent`,
          client_id: "client-x",
        }),
      );
    };

    seed("verifier-network");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("network down");
      }),
    );
    await expect(
      client.completeAuthorization(networkIssuer, { code: "auth-code", state: "issued-state" }),
    ).rejects.toThrow("Could not fetch OAuth discovery metadata");
    expect(sessionStorage.getItem(TOKEN_KEY)).toBeNull();
    // Discovery never returned, so the exchange did not run. The pending record stays.
    expect(client.hasPendingAuthorization()).toBe(true);

    seed("verifier-malformed");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("oauth-authorization-server")) {
          return jsonResponse(discoveryDoc(malformedIssuer));
        }
        return new Response("not-json", {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );
    await expect(
      client.completeAuthorization(malformedIssuer, { code: "auth-code", state: "issued-state" }),
    ).rejects.toThrow();
    expect(sessionStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(client.hasStoredToken()).toBe(false);
    // Current contract clears PKCE only after a non-2xx response or a stored access token.
    expect(client.hasPendingAuthorization()).toBe(true);
    expect(localSets).toEqual([]);
  });

  it("does not store a token when the token endpoint omits access_token", async () => {
    const issuer = "https://issuer-empty-token.test";
    const { completeAuthorization, hasPendingAuthorization, hasStoredToken } = await loadClient();
    sessionStorage.setItem(
      PKCE_KEY,
      JSON.stringify({
        verifier: "verifier-empty",
        state: "issued-state",
        redirect_uri: `${ORIGIN}/agent`,
        client_id: "client-empty",
      }),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("oauth-authorization-server")) return jsonResponse(discoveryDoc(issuer));
        return jsonResponse({ token_type: "Bearer" });
      }),
    );
    await expect(
      completeAuthorization(issuer, { code: "auth-code", state: "issued-state" }),
    ).rejects.toThrow("Token endpoint returned no access_token");
    expect(hasStoredToken()).toBe(false);
    expect(hasPendingAuthorization()).toBe(true);
  });

  it("sameOriginRedirect accepts same-origin paths and rejects foreign or non-http URLs", async () => {
    const { sameOriginRedirect } = await loadClient();
    expect(sameOriginRedirect("/agent-integrations")).toBe(`${ORIGIN}/agent-integrations`);
    expect(sameOriginRedirect("agent-integrations")).toBe(`${ORIGIN}/agent-integrations`);
    expect(sameOriginRedirect(`${ORIGIN}/agent-integrations`)).toBe(`${ORIGIN}/agent-integrations`);

    expect(() => sameOriginRedirect("https://evil.test/callback")).toThrow(
      "redirect_uri must be same-origin",
    );
    expect(() => sameOriginRedirect("//evil.test/callback")).toThrow(
      "redirect_uri must be same-origin",
    );
    expect(() => sameOriginRedirect("javascript:alert(1)")).toThrow(
      "redirect_uri must be same-origin",
    );
    expect(() => sameOriginRedirect("data:text/html,hi")).toThrow(
      "redirect_uri must be same-origin",
    );
    expect(() => sameOriginRedirect("http://app.test/callback")).toThrow(
      "redirect_uri must be same-origin",
    );
  });

  it("keeps tokens in sessionStorage only; hasStoredToken and disconnect follow expiry", async () => {
    const { disconnect, hasStoredToken } = await loadClient();
    sessionStorage.setItem(
      TOKEN_KEY,
      JSON.stringify({ access_token: "live", obtained_at: Date.now(), expires_in: 3600 }),
    );
    sessionStorage.setItem(PKCE_KEY, JSON.stringify({ state: "pending" }));
    sessionStorage.setItem(CLIENT_KEY, JSON.stringify({ client_id: "c", redirect_uri: ORIGIN }));
    expect(hasStoredToken()).toBe(true);

    sessionStorage.setItem(
      TOKEN_KEY,
      JSON.stringify({
        access_token: "stale",
        obtained_at: Date.now() - 3570 * 1000,
        expires_in: 3600,
      }),
    );
    expect(hasStoredToken()).toBe(false);

    sessionStorage.setItem(
      TOKEN_KEY,
      JSON.stringify({
        access_token: "inside-skew",
        obtained_at: Date.now() - 3569 * 1000,
        expires_in: 3600,
      }),
    );
    expect(hasStoredToken()).toBe(true);

    sessionStorage.setItem(TOKEN_KEY, "{");
    expect(hasStoredToken()).toBe(false);

    sessionStorage.setItem(
      TOKEN_KEY,
      JSON.stringify({ access_token: "live", obtained_at: Date.now(), expires_in: 3600 }),
    );
    disconnect();
    expect(hasStoredToken()).toBe(false);
    expect(sessionStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(sessionStorage.getItem(PKCE_KEY)).toBeNull();
    expect(sessionStorage.getItem(CLIENT_KEY)).toBeNull();
    expect(localSets).toEqual([]);
    for (let i = 0; i < localStorage.length; i += 1) {
      expect(localStorage.key(i) ?? "").not.toContain("verdant.mcp.oauth");
    }
  });

  it("fetchDiscovery falls back to openid-configuration and caches a hit", async () => {
    const issuer = "https://issuer-discovery.test";
    const { fetchDiscovery } = await loadClient();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/.well-known/oauth-authorization-server")) {
        return new Response("nope", { status: 404 });
      }
      if (url.endsWith("/.well-known/openid-configuration")) {
        return jsonResponse(discoveryDoc(issuer));
      }
      throw new Error(`unexpected ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const first = await fetchDiscovery(issuer);
    const second = await fetchDiscovery(issuer);
    expect(first.authorization_endpoint).toBe(`${issuer}/authorize`);
    expect(second).toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("startAuthorization stores a random state and a valid S256 challenge", async () => {
    const issuer = "https://issuer-start.test";
    const location = installLocation();
    const { startAuthorization } = await loadClient();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("oauth-authorization-server")) return jsonResponse(discoveryDoc(issuer));
        if (url.endsWith("/register")) return jsonResponse({ client_id: "dyn-client" });
        throw new Error(`unexpected ${url}`);
      }),
    );

    await startAuthorization(issuer, "/agent-integrations");
    const firstRaw = sessionStorage.getItem(PKCE_KEY);
    expect(firstRaw).toBeTruthy();
    const first = JSON.parse(firstRaw!) as {
      verifier: string;
      state: string;
      redirect_uri: string;
      client_id: string;
    };
    const firstUrl = new URL(location.href);
    expect(firstUrl.origin).toBe(issuer);
    expect(firstUrl.pathname).toBe("/authorize");
    expect(firstUrl.searchParams.get("response_type")).toBe("code");
    expect(firstUrl.searchParams.get("client_id")).toBe("dyn-client");
    expect(firstUrl.searchParams.get("redirect_uri")).toBe(`${ORIGIN}/agent-integrations`);
    expect(firstUrl.searchParams.get("code_challenge_method")).toBe("S256");
    expect(firstUrl.searchParams.get("state")).toBe(first.state);
    expect(firstUrl.searchParams.get("code_challenge")).toBe(await s256(first.verifier));
    expect(first.redirect_uri).toBe(`${ORIGIN}/agent-integrations`);
    expect(sessionStorage.getItem(CLIENT_KEY)).toContain("dyn-client");
    expect(localSets).toEqual([]);

    await startAuthorization(issuer, "/agent-integrations");
    const second = JSON.parse(sessionStorage.getItem(PKCE_KEY)!) as {
      state: string;
      verifier: string;
    };
    expect(second.state).not.toBe(first.state);
    expect(second.verifier).not.toBe(first.verifier);
    expect(second.state.length).toBeGreaterThan(10);
  });
});
