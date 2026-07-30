import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  callMcpTool,
  completeAuthorization,
  disconnect,
  hasStoredToken,
  probeTools,
  startAuthorization,
} from "@/lib/mcp/browserOAuthClient";

const STORAGE_KEYS = {
  client: "verdant.mcp.oauth.clientRegistration.v1",
  pkce: "verdant.mcp.oauth.pkce.v1",
  token: "verdant.mcp.oauth.token.v1",
} as const;

const STORAGE_UNAVAILABLE_MESSAGE =
  "OAuth needs browser session storage. Enable site data and try connecting again.";
const PENDING_AUTHORIZATION_INVALID_MESSAGE =
  "Pending authorization data is invalid. Start the connection again.";
const TEST_PKCE_VERIFIER = "a".repeat(43);
const TEST_STATE = "b".repeat(22);

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function pendingAuthorization(state = TEST_STATE) {
  return {
    verifier: TEST_PKCE_VERIFIER,
    state,
    redirect_uri: new URL("/settings/agent-integrations", window.location.origin).toString(),
    client_id: "test-browser-client",
  };
}

function memoryStorage(seed: Record<string, string> = {}) {
  const values = new Map<string, string>(Object.entries(seed));
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      values.delete(key);
    }),
  };
}

beforeEach(() => {
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.sessionStorage.clear();
});

describe("browser OAuth session storage safety", () => {
  it("fails closed when session storage reads are blocked and never makes MCP requests", async () => {
    const blockedStorage = {
      getItem: vi.fn(() => {
        throw new Error("storage blocked");
      }),
      setItem: vi.fn(() => {
        throw new Error("storage blocked");
      }),
      removeItem: vi.fn(() => {
        throw new Error("storage blocked");
      }),
    } as Pick<Storage, "getItem" | "setItem" | "removeItem">;
    vi.stubGlobal("sessionStorage", blockedStorage);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    expect(hasStoredToken()).toBe(false);
    await expect(probeTools("https://mcp.example.test/mcp")).resolves.toMatchObject({
      status: "not_connected",
    });
    await expect(
      callMcpTool("https://mcp.example.test/mcp", "list_grows", {}),
    ).resolves.toMatchObject({ status: "not_connected" });
    expect(() => disconnect()).not.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not redirect when PKCE state cannot be persisted", async () => {
    const storage = memoryStorage({
      [STORAGE_KEYS.client]: JSON.stringify({
        client_id: "test-browser-client",
        redirect_uri: new URL("/settings/agent-integrations", window.location.origin).toString(),
      }),
    });
    storage.setItem.mockImplementation(() => {
      throw new Error("storage blocked");
    });
    vi.stubGlobal("sessionStorage", storage);
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        authorization_endpoint: "https://oauth-storage-write.example/authorize",
        token_endpoint: "https://oauth-storage-write.example/token",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const originalHref = window.location.href;

    await expect(
      startAuthorization("https://oauth-storage-write.example", "/settings/agent-integrations"),
    ).rejects.toThrow(STORAGE_UNAVAILABLE_MESSAGE);

    expect(storage.setItem).toHaveBeenCalledWith(STORAGE_KEYS.pkce, expect.any(String));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(window.location.href).toBe(originalHref);
  });

  it("rejects a non-record client registration response without a raw TypeError", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          authorization_endpoint: "https://oauth-registration-null.example/authorize",
          token_endpoint: "https://oauth-registration-null.example/token",
          registration_endpoint: "https://oauth-registration-null.example/register",
        }),
      )
      .mockResolvedValueOnce(jsonResponse(null));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      startAuthorization("https://oauth-registration-null.example", "/settings/agent-integrations"),
    ).rejects.toThrow("Client registration returned an invalid response");

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("clears malformed pending authorization before any discovery or token request", async () => {
    window.sessionStorage.setItem(STORAGE_KEYS.pkce, "not-json");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      completeAuthorization("https://oauth-malformed.example", {
        code: "test-code",
        state: "test-state",
      }),
    ).rejects.toThrow(PENDING_AUTHORIZATION_INVALID_MESSAGE);

    expect(window.sessionStorage.getItem(STORAGE_KEYS.pkce)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("clears incomplete pending authorization before any discovery or token request", async () => {
    window.sessionStorage.setItem(
      STORAGE_KEYS.pkce,
      JSON.stringify({
        verifier: TEST_PKCE_VERIFIER,
        state: TEST_STATE,
        redirect_uri: new URL("/settings/agent-integrations", window.location.origin).toString(),
      }),
    );
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      completeAuthorization("https://oauth-incomplete.example", {
        code: "test-code",
        state: TEST_STATE,
      }),
    ).rejects.toThrow(PENDING_AUTHORIZATION_INVALID_MESSAGE);

    expect(window.sessionStorage.getItem(STORAGE_KEYS.pkce)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("clears an invalid PKCE verifier before any discovery or token request", async () => {
    window.sessionStorage.setItem(
      STORAGE_KEYS.pkce,
      JSON.stringify({ ...pendingAuthorization(), verifier: "not-a-valid-pkce-verifier" }),
    );
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      completeAuthorization("https://oauth-invalid-pkce.example", {
        code: "test-code",
        state: TEST_STATE,
      }),
    ).rejects.toThrow(PENDING_AUTHORIZATION_INVALID_MESSAGE);

    expect(window.sessionStorage.getItem(STORAGE_KEYS.pkce)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps a valid pending authorization when the callback state does not match", async () => {
    const pending = pendingAuthorization();
    window.sessionStorage.setItem(STORAGE_KEYS.pkce, JSON.stringify(pending));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      completeAuthorization("https://oauth-state-mismatch.example", {
        code: "test-code",
        state: "unexpected-state",
      }),
    ).rejects.toThrow("OAuth state mismatch");

    expect(window.sessionStorage.getItem(STORAGE_KEYS.pkce)).toBe(JSON.stringify(pending));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("persists a valid token and clears the one-shot PKCE state after a successful exchange", async () => {
    window.sessionStorage.setItem(STORAGE_KEYS.pkce, JSON.stringify(pendingAuthorization()));
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          authorization_endpoint: "https://oauth-success.example/authorize",
          token_endpoint: "https://oauth-success.example/token",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ access_token: "TEST_ONLY_BROWSER_TOKEN", expires_in: 3_600 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await completeAuthorization("https://oauth-success.example", {
      code: "test-code",
      state: TEST_STATE,
    });

    expect(hasStoredToken()).toBe(true);
    expect(window.sessionStorage.getItem(STORAGE_KEYS.pkce)).toBeNull();
    expect(JSON.parse(window.sessionStorage.getItem(STORAGE_KEYS.token) ?? "{}")).toMatchObject({
      access_token: "TEST_ONLY_BROWSER_TOKEN",
      expires_in: 3_600,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("clears PKCE state when the token response is valid JSON but not a record", async () => {
    window.sessionStorage.setItem(STORAGE_KEYS.pkce, JSON.stringify(pendingAuthorization()));
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          authorization_endpoint: "https://oauth-token-null.example/authorize",
          token_endpoint: "https://oauth-token-null.example/token",
        }),
      )
      .mockResolvedValueOnce(jsonResponse(null));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      completeAuthorization("https://oauth-token-null.example", {
        code: "test-code",
        state: TEST_STATE,
      }),
    ).rejects.toThrow("Token endpoint returned an invalid response");

    expect(window.sessionStorage.getItem(STORAGE_KEYS.token)).toBeNull();
    expect(window.sessionStorage.getItem(STORAGE_KEYS.pkce)).toBeNull();
  });

  it("does not claim success when the exchanged token cannot be stored", async () => {
    const storage = memoryStorage({
      [STORAGE_KEYS.pkce]: JSON.stringify(pendingAuthorization()),
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          authorization_endpoint: "https://oauth-token-write.example/authorize",
          token_endpoint: "https://oauth-token-write.example/token",
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ access_token: "TEST_ONLY_BROWSER_TOKEN" }));
    vi.stubGlobal("fetch", fetchMock);
    storage.setItem.mockImplementation(() => {
      throw new Error("storage blocked");
    });
    vi.stubGlobal("sessionStorage", storage);

    await expect(
      completeAuthorization("https://oauth-token-write.example", {
        code: "test-code",
        state: TEST_STATE,
      }),
    ).rejects.toThrow(STORAGE_UNAVAILABLE_MESSAGE);

    expect(storage.getItem(STORAGE_KEYS.token)).toBeNull();
    expect(storage.getItem(STORAGE_KEYS.pkce)).toBeNull();
  });
});
