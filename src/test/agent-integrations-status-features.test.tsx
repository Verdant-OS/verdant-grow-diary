/**
 * Component tests for the four MCP status-page support features:
 * JSON export, per-tool local enable/disable controls, last OAuth
 * attempt display with retry, and the contextual issuer setup-guide
 * link.
 *
 * Deliberately a NEW file (agent-integrations-page.test.tsx is touched
 * by open PR #910 — keeping these additions separate avoids a merge
 * collision). Presenter-only: no Supabase network calls; downloads are
 * intercepted via URL.createObjectURL + anchor click stubs.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "@/lib/react-router-compat";

vi.mock("@/hooks/usePageSeo", () => ({
  usePageSeo: () => undefined,
}));

import AgentIntegrations, { type AgentIntegrationsProps } from "@/pages/AgentIntegrations";
import McpToolExplorer from "@/components/mcp/McpToolExplorer";
import { MCP_MANIFEST, containsSecretLikeValue } from "@/lib/mcp/manifestView";
import { LOCAL_TOOL_PREFS_KEY } from "@/lib/mcp/localToolPreferences";
import { OAUTH_ATTEMPT_LOG_KEY } from "@/lib/mcp/oauthAttemptLog";
import type { ConnectionStatusExport } from "@/lib/mcp/connectionStatusExport";
import {
  clearLocalStorageForTest,
  getLocalStorageItemForTest,
  setLocalStorageItemForTest,
} from "@/test/helpers/localStorageTestHelper";

const PKCE_KEY = "verdant.mcp.oauth.pkce.v1";

/** A pending authorization, as startAuthorization would have written it. */
function seedPendingAuthorization() {
  window.sessionStorage.setItem(
    PKCE_KEY,
    JSON.stringify({
      verifier: "test-verifier",
      state: "test-state",
      redirect_uri: "http://localhost/settings/agent-integrations",
      client_id: "test-client",
    }),
  );
}

/** jsdom's Blob has no .text(); FileReader is the portable read path. */
function blobToText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

function renderPage(props: AgentIntegrationsProps = {}) {
  return render(
    <MemoryRouter initialEntries={["/settings/agent-integrations"]}>
      <Routes>
        <Route path="/settings/agent-integrations" element={<AgentIntegrations {...props} />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  clearLocalStorageForTest();
  window.sessionStorage.clear();
  window.history.replaceState({}, "", "/settings/agent-integrations");
});

afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState({}, "", "/");
});

describe("connection status JSON export", () => {
  it("downloads a parseable, secret-free status file", async () => {
    let capturedBlob: Blob | null = null;
    const createObjectURL = vi.fn((blob: Blob) => {
      capturedBlob = blob;
      return "blob:mock-export";
    });
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL, revokeObjectURL }));
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);

    renderPage();
    fireEvent.click(screen.getByTestId("export-connection-status"));

    await waitFor(() => {
      expect(screen.getByTestId("export-status").textContent).toMatch(/downloaded/i);
    });
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock-export");
    expect(screen.getByTestId("export-status").textContent).toMatch(
      /verdant-mcp-connection-status-/,
    );

    expect(capturedBlob).not.toBeNull();
    const json = await blobToText(capturedBlob as unknown as Blob);
    expect(containsSecretLikeValue(json)).toBe(false);
    const parsed = JSON.parse(json) as ConnectionStatusExport;
    expect(parsed.exportKind).toBe("verdant-mcp-connection-status");
    expect(parsed.oauth.issuer).toBe(MCP_MANIFEST.oauthIssuer);
    expect(parsed.oauth.issuerContext).toBe("configured");
    expect(parsed.tools.map((t) => t.name).sort()).toEqual(
      MCP_MANIFEST.tools.map((t) => t.name).sort(),
    );
    expect(parsed.browserConnection.connectedInThisBrowser).toBe(false);
    expect(parsed.oauth.lastAttempt).toBeNull();
  });

  it("reflects a locally disabled tool and a recorded OAuth attempt in the export", async () => {
    setLocalStorageItemForTest(
      LOCAL_TOOL_PREFS_KEY,
      JSON.stringify({ get_latest_sensor_snapshot: false }),
    );
    setLocalStorageItemForTest(
      OAUTH_ATTEMPT_LOG_KEY,
      JSON.stringify({
        startedAt: "2026-08-12T10:00:00.000Z",
        completedAt: "2026-08-12T10:01:00.000Z",
        outcome: "failed",
        reason: "Consent denied",
      }),
    );
    let capturedBlob: Blob | null = null;
    vi.stubGlobal(
      "URL",
      Object.assign(URL, {
        createObjectURL: vi.fn((blob: Blob) => {
          capturedBlob = blob;
          return "blob:mock-export";
        }),
        revokeObjectURL: vi.fn(),
      }),
    );
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

    renderPage();
    fireEvent.click(screen.getByTestId("export-connection-status"));
    await waitFor(() => expect(capturedBlob).not.toBeNull());

    const parsed = JSON.parse(
      await blobToText(capturedBlob as unknown as Blob),
    ) as ConnectionStatusExport;
    const snapshot = parsed.tools.find((t) => t.name === "get_latest_sensor_snapshot");
    expect(snapshot?.enabledInThisBrowser).toBe(false);
    expect(parsed.oauth.lastAttempt?.outcome).toBe("failed");
    expect(parsed.oauth.lastAttempt?.reason).toBe("Consent denied");
  });
});

describe("per-tool local enable/disable controls", () => {
  it("renders one switch per advertised tool, all enabled by default, with honest copy", () => {
    renderPage();
    for (const tool of MCP_MANIFEST.tools) {
      const toggle = screen.getByTestId(`tool-toggle-${tool.name}`);
      expect(toggle.getAttribute("aria-checked")).toBe("true");
      expect(screen.getByTestId(`tool-authz-${tool.name}`).textContent).toMatch(
        /integration-wide/i,
      );
    }
    const note = screen.getByTestId("tool-authorization-note");
    expect(note.textContent).toMatch(/one OAuth consent covers the whole/i);
    expect(note.textContent).toMatch(/local to this browser/i);
  });

  it("persists a toggle to localStorage and restores it on re-render", async () => {
    const { unmount } = renderPage();
    fireEvent.click(screen.getByTestId("tool-toggle-list_grows"));
    await waitFor(() => {
      expect(screen.getByTestId("tool-toggle-list_grows").getAttribute("aria-checked")).toBe(
        "false",
      );
    });
    const stored = JSON.parse(getLocalStorageItemForTest(LOCAL_TOOL_PREFS_KEY) ?? "{}") as Record<
      string,
      boolean
    >;
    expect(stored.list_grows).toBe(false);

    unmount();
    renderPage();
    expect(screen.getByTestId("tool-toggle-list_grows").getAttribute("aria-checked")).toBe("false");
  });
});

describe("export reflects in-memory state when storage writes fail", () => {
  it("keeps the export consistent with the visible switch after a quota failure", async () => {
    let capturedBlob: Blob | null = null;
    vi.stubGlobal(
      "URL",
      Object.assign(URL, {
        createObjectURL: vi.fn((blob: Blob) => {
          capturedBlob = blob;
          return "blob:mock-export";
        }),
        revokeObjectURL: vi.fn(),
      }),
    );
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

    renderPage();
    // Simulate quota/privacy-mode: every storage write now throws. The
    // toggle still updates in-memory state (the helpers swallow write
    // failures by design), and the export must match what the UI shows.
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    try {
      // Two sequential toggles: the second must not revert the first
      // even though neither write reached storage.
      fireEvent.click(screen.getByTestId("tool-toggle-list_grows"));
      fireEvent.click(screen.getByTestId("tool-toggle-get_latest_sensor_snapshot"));
      await waitFor(() => {
        expect(screen.getByTestId("tool-toggle-list_grows").getAttribute("aria-checked")).toBe(
          "false",
        );
        expect(
          screen.getByTestId("tool-toggle-get_latest_sensor_snapshot").getAttribute("aria-checked"),
        ).toBe("false");
      });
      fireEvent.click(screen.getByTestId("export-connection-status"));
      await waitFor(() => expect(capturedBlob).not.toBeNull());
    } finally {
      setItemSpy.mockRestore();
    }
    const parsed = JSON.parse(
      await blobToText(capturedBlob as unknown as Blob),
    ) as ConnectionStatusExport;
    const grows = parsed.tools.find((t) => t.name === "list_grows");
    const snapshot = parsed.tools.find((t) => t.name === "get_latest_sensor_snapshot");
    expect(grows?.enabledInThisBrowser).toBe(false);
    expect(snapshot?.enabledInThisBrowser).toBe(false);
  });
});

describe("last OAuth attempt display", () => {
  it("shows a placeholder when no attempt is recorded", () => {
    renderPage();
    expect(screen.getByTestId("oauth-last-attempt").textContent).toMatch(/none recorded/i);
    expect(screen.queryByTestId("oauth-retry")).toBeNull();
  });

  it("shows a failed attempt with its sanitized reason and a retry button", () => {
    setLocalStorageItemForTest(
      OAUTH_ATTEMPT_LOG_KEY,
      JSON.stringify({
        startedAt: "2026-08-12T10:00:00.000Z",
        completedAt: "2026-08-12T10:01:00.000Z",
        outcome: "failed",
        reason: "Token exchange failed (500)",
      }),
    );
    renderPage();
    const line = screen.getByTestId("oauth-last-attempt");
    expect(line.getAttribute("data-outcome")).toBe("failed");
    expect(screen.getByTestId("oauth-last-attempt-outcome").textContent).toMatch(/failed/i);
    expect(screen.getByTestId("oauth-last-attempt-reason").textContent).toMatch(
      /Token exchange failed \(500\)/,
    );
    expect(screen.getByTestId("oauth-retry")).toBeTruthy();
  });

  it("shows a successful attempt without a retry button", () => {
    setLocalStorageItemForTest(
      OAUTH_ATTEMPT_LOG_KEY,
      JSON.stringify({
        startedAt: "2026-08-12T10:00:00.000Z",
        completedAt: "2026-08-12T10:00:30.000Z",
        outcome: "success",
      }),
    );
    renderPage();
    expect(screen.getByTestId("oauth-last-attempt").getAttribute("data-outcome")).toBe("success");
    expect(screen.getByTestId("oauth-last-attempt-outcome").textContent).toMatch(/success/i);
    expect(screen.queryByTestId("oauth-retry")).toBeNull();
  });

  it("records a consent-denied callback (?error=access_denied) as a failed attempt when it matches the pending authorization's state", async () => {
    seedPendingAuthorization();
    window.history.replaceState(
      {},
      "",
      "/settings/agent-integrations?error=access_denied&error_description=User+denied&state=test-state",
    );
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId("oauth-last-attempt").getAttribute("data-outcome")).toBe("failed");
    });
    expect(screen.getByTestId("oauth-last-attempt-reason").textContent).toMatch(/access_denied/);
    const stored = JSON.parse(getLocalStorageItemForTest(OAUTH_ATTEMPT_LOG_KEY) ?? "null") as {
      outcome?: string;
      reason?: string;
    } | null;
    expect(stored?.outcome).toBe("failed");
    // Provider-controlled error_description is NEVER persisted or
    // rendered — only the shape-checked error code.
    expect(stored?.reason).toBe("Authorization error: access_denied");
    expect(screen.getByTestId("oauth-last-attempt-reason").textContent).not.toMatch(/User denied/);
    // The pending authorization was consumed by the error callback.
    expect(window.sessionStorage.getItem(PKCE_KEY)).toBeNull();
  });

  it("ignores a forged ?error= link when no authorization is pending in this browser", async () => {
    // No seedPendingAuthorization(): this simulates a crafted/stale link.
    window.history.replaceState(
      {},
      "",
      "/settings/agent-integrations?error=session_expired&error_description=Call+support+now",
    );
    renderPage();
    // Nothing recorded, nothing rendered from the forged params.
    expect(screen.getByTestId("oauth-last-attempt").textContent).toMatch(/none recorded/i);
    expect(screen.getByTestId("oauth-last-attempt").getAttribute("data-outcome")).toBe("none");
    expect(getLocalStorageItemForTest(OAUTH_ATTEMPT_LOG_KEY)).toBeNull();
    expect(screen.queryByTestId("browser-connect-error")).toBeNull();
  });

  it("ignores an ?error= whose state does not match the pending authorization, keeping the flow alive", async () => {
    seedPendingAuthorization(); // pending state is "test-state"
    window.history.replaceState(
      {},
      "",
      "/settings/agent-integrations?error=access_denied&state=attacker-state",
    );
    renderPage();
    // Not consumed: no record, no error surfaced, and the real pending
    // authorization is left intact so the genuine callback can finish.
    expect(screen.getByTestId("oauth-last-attempt").getAttribute("data-outcome")).toBe("none");
    expect(getLocalStorageItemForTest(OAUTH_ATTEMPT_LOG_KEY)).toBeNull();
    expect(window.sessionStorage.getItem(PKCE_KEY)).not.toBeNull();

    // Same for an ?error= that omits state entirely.
    window.history.replaceState({}, "", "/settings/agent-integrations?error=access_denied");
    renderPage();
    expect(getLocalStorageItemForTest(OAUTH_ATTEMPT_LOG_KEY)).toBeNull();
    expect(window.sessionStorage.getItem(PKCE_KEY)).not.toBeNull();
  });

  it("ignores a ?code= callback whose state does not match the pending authorization", async () => {
    seedPendingAuthorization(); // pending state is "test-state"
    window.history.replaceState(
      {},
      "",
      "/settings/agent-integrations?code=forged-code&state=attacker-state",
    );
    renderPage();
    // No exchange attempted, so no "OAuth state mismatch" failure is
    // recorded; the genuine pending authorization stays alive.
    await waitFor(() => {
      expect(screen.getByTestId("oauth-last-attempt").getAttribute("data-outcome")).toBe("none");
    });
    expect(getLocalStorageItemForTest(OAUTH_ATTEMPT_LOG_KEY)).toBeNull();
    expect(window.sessionStorage.getItem(PKCE_KEY)).not.toBeNull();
    expect(screen.queryByTestId("browser-connect-error")).toBeNull();
  });
});

describe("local tool preference gates the docs-page tool explorer", () => {
  it("renders first-class forms for both advertised Grow Walk tools", () => {
    render(
      <MemoryRouter initialEntries={["/docs/mcp-api"]}>
        <Routes>
          <Route path="/docs/mcp-api" element={<McpToolExplorer />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByTestId("tool-explorer-list_grow_walk_targets")).toBeTruthy();
    expect(screen.getByTestId("tool-explorer-get_grow_walk_context")).toBeTruthy();
    expect(document.getElementById("grow-walk-targets-grow")).toBeTruthy();
    expect(document.getElementById("grow-walk-context-type")).toBeTruthy();
    expect(document.getElementById("grow-walk-context-target")).toBeTruthy();
  });

  it("disables only the locally disabled tool's Run button with an honest note", () => {
    setLocalStorageItemForTest(LOCAL_TOOL_PREFS_KEY, JSON.stringify({ list_grows: false }));
    render(
      <MemoryRouter initialEntries={["/docs/mcp-api"]}>
        <Routes>
          <Route path="/docs/mcp-api" element={<McpToolExplorer />} />
        </Routes>
      </MemoryRouter>,
    );
    const disabledRun = screen.getByTestId("tool-explorer-run-list_grows") as HTMLButtonElement;
    expect(disabledRun.disabled).toBe(true);
    expect(screen.getByTestId("tool-explorer-local-disabled-list_grows").textContent).toMatch(
      /local preference/i,
    );
    // The other tools carry no disabled note.
    expect(
      screen.queryByTestId("tool-explorer-local-disabled-list_recent_diary_entries"),
    ).toBeNull();
    expect(
      screen.queryByTestId("tool-explorer-local-disabled-get_latest_sensor_snapshot"),
    ).toBeNull();
  });
});

describe("issuer-context override reaches the badge, guide link, and export", () => {
  it("renders the not_configured state end-to-end", async () => {
    let capturedBlob: Blob | null = null;
    vi.stubGlobal(
      "URL",
      Object.assign(URL, {
        createObjectURL: vi.fn((blob: Blob) => {
          capturedBlob = blob;
          return "blob:mock-export";
        }),
        revokeObjectURL: vi.fn(),
      }),
    );
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

    renderPage({ oauthStatusOverride: "not_configured" });
    expect(screen.getByTestId("oauth-status").textContent).toMatch(/not configured/i);
    const link = screen.getByTestId("issuer-setup-guide-link");
    expect(link.getAttribute("href")).toBe("/docs/mcp-api#issuer-not-configured");
    expect(link.getAttribute("data-issuer-context")).toBe("not_configured");

    fireEvent.click(screen.getByTestId("export-connection-status"));
    await waitFor(() => expect(capturedBlob).not.toBeNull());
    const parsed = JSON.parse(
      await blobToText(capturedBlob as unknown as Blob),
    ) as ConnectionStatusExport;
    expect(parsed.oauth.issuerContext).toBe("not_configured");
  });

  it("renders the unverified state's guide link", () => {
    renderPage({ oauthStatusOverride: "unverified" });
    expect(screen.getByTestId("issuer-setup-guide-link").getAttribute("href")).toBe(
      "/docs/mcp-api#issuer-unverified",
    );
    expect(screen.getByTestId("oauth-status").textContent).toMatch(/unable to verify/i);
  });
});

describe("probe gating by local tool preference", () => {
  it("describes the skipped probe honestly before the browser is connected", () => {
    setLocalStorageItemForTest(LOCAL_TOOL_PREFS_KEY, JSON.stringify({ list_grows: false }));
    renderPage();
    // Notice visible pre-connect, and the intro no longer promises the call.
    expect(screen.getByTestId("browser-connect-probe-disabled")).toBeTruthy();
    const panel = screen.getByTestId("browser-connect-panel");
    expect(panel.textContent).not.toMatch(/then calls/);
    expect(panel.textContent).toMatch(/check is skipped/i);
  });

  it("disables the probe with an explanation when list_grows is locally disabled", () => {
    // Seed a live-looking browser token so the probe button renders at all.
    window.sessionStorage.setItem(
      "verdant.mcp.oauth.token.v1",
      JSON.stringify({ access_token: "test-token", obtained_at: Date.now(), expires_in: 3600 }),
    );
    setLocalStorageItemForTest(LOCAL_TOOL_PREFS_KEY, JSON.stringify({ list_grows: false }));
    renderPage();
    const probe = screen.getByTestId("browser-connect-probe") as HTMLButtonElement;
    expect(probe.disabled).toBe(true);
    expect(screen.getByTestId("browser-connect-probe-disabled").textContent).toMatch(
      /local preference/i,
    );
  });
});

describe("contextual issuer setup-guide link", () => {
  it("links to the configured-issuer guide section for the production issuer", () => {
    renderPage();
    const link = screen.getByTestId("issuer-setup-guide-link");
    expect(link.getAttribute("href")).toBe("/docs/mcp-api#issuer-configured");
    expect(link.getAttribute("data-issuer-context")).toBe("configured");
  });
});
