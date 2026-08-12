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

import AgentIntegrations from "@/pages/AgentIntegrations";
import { MCP_MANIFEST, containsSecretLikeValue } from "@/lib/mcp/manifestView";
import { LOCAL_TOOL_PREFS_KEY } from "@/lib/mcp/localToolPreferences";
import { OAUTH_ATTEMPT_LOG_KEY } from "@/lib/mcp/oauthAttemptLog";
import type { ConnectionStatusExport } from "@/lib/mcp/connectionStatusExport";

/** jsdom's Blob has no .text(); FileReader is the portable read path. */
function blobToText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/settings/agent-integrations"]}>
      <Routes>
        <Route path="/settings/agent-integrations" element={<AgentIntegrations />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
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
    window.localStorage.setItem(
      LOCAL_TOOL_PREFS_KEY,
      JSON.stringify({ get_latest_sensor_snapshot: false }),
    );
    window.localStorage.setItem(
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
    const stored = JSON.parse(window.localStorage.getItem(LOCAL_TOOL_PREFS_KEY) ?? "{}") as Record<
      string,
      boolean
    >;
    expect(stored.list_grows).toBe(false);

    unmount();
    renderPage();
    expect(screen.getByTestId("tool-toggle-list_grows").getAttribute("aria-checked")).toBe("false");
  });
});

describe("last OAuth attempt display", () => {
  it("shows a placeholder when no attempt is recorded", () => {
    renderPage();
    expect(screen.getByTestId("oauth-last-attempt").textContent).toMatch(/none recorded/i);
    expect(screen.queryByTestId("oauth-retry")).toBeNull();
  });

  it("shows a failed attempt with its sanitized reason and a retry button", () => {
    window.localStorage.setItem(
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
    window.localStorage.setItem(
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

  it("records a consent-denied callback (?error=access_denied) as a failed attempt", async () => {
    window.history.replaceState(
      {},
      "",
      "/settings/agent-integrations?error=access_denied&error_description=User+denied",
    );
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId("oauth-last-attempt").getAttribute("data-outcome")).toBe("failed");
    });
    expect(screen.getByTestId("oauth-last-attempt-reason").textContent).toMatch(/access_denied/);
    const stored = JSON.parse(window.localStorage.getItem(OAUTH_ATTEMPT_LOG_KEY) ?? "null") as {
      outcome?: string;
    } | null;
    expect(stored?.outcome).toBe("failed");
  });
});

describe("probe gating by local tool preference", () => {
  it("disables the probe with an explanation when list_grows is locally disabled", () => {
    // Seed a live-looking browser token so the probe button renders at all.
    window.sessionStorage.setItem(
      "verdant.mcp.oauth.token.v1",
      JSON.stringify({ access_token: "test-token", obtained_at: Date.now(), expires_in: 3600 }),
    );
    window.localStorage.setItem(LOCAL_TOOL_PREFS_KEY, JSON.stringify({ list_grows: false }));
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
