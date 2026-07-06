/**
 * Agent Integrations settings page + OAuth consent route render tests.
 *
 * Presenter-only regressions. No Supabase network calls. The consent
 * route Supabase client is mocked so we can exercise the three visible
 * states (unauthenticated → redirect to /auth, error, ready).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

// ---------- module mocks ----------
const getSessionMock = vi.fn();
const getAuthorizationDetailsMock = vi.fn();
const approveAuthorizationMock = vi.fn();
const denyAuthorizationMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => getSessionMock(...args),
      oauth: {
        getAuthorizationDetails: (...args: unknown[]) =>
          getAuthorizationDetailsMock(...args),
        approveAuthorization: (...args: unknown[]) =>
          approveAuthorizationMock(...args),
        denyAuthorization: (...args: unknown[]) =>
          denyAuthorizationMock(...args),
      },
    },
  },
}));

vi.mock("@/hooks/usePageSeo", () => ({
  usePageSeo: () => undefined,
}));

// ---------- imports under test ----------
import AgentIntegrations from "@/pages/AgentIntegrations";
import OAuthConsent from "@/pages/OAuthConsent";
import {
  MCP_MANIFEST,
  containsSecretLikeValue,
} from "@/lib/mcp/manifestView";

beforeEach(() => {
  getSessionMock.mockReset();
  getAuthorizationDetailsMock.mockReset();
  approveAuthorizationMock.mockReset();
  denyAuthorizationMock.mockReset();
});

function renderAgentIntegrations() {
  return render(
    <MemoryRouter initialEntries={["/settings/agent-integrations"]}>
      <Routes>
        <Route
          path="/settings/agent-integrations"
          element={<AgentIntegrations />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("AgentIntegrations page", () => {
  it("renders the safety statement", () => {
    renderAgentIntegrations();
    const safety = screen.getByTestId("agent-integrations-safety");
    expect(safety.textContent).toMatch(/read-only/i);
    expect(safety.textContent).toMatch(/action queue/i);
    expect(safety.textContent).toMatch(/device/i);
  });

  it("shows the OAuth configured badge when issuer is a direct supabase.co host", () => {
    renderAgentIntegrations();
    expect(screen.getByTestId("oauth-status").textContent).toMatch(
      /configured/i,
    );
  });

  it("lists every MCP tool with its exact name and no invented params", () => {
    renderAgentIntegrations();
    for (const tool of MCP_MANIFEST.tools) {
      const row = screen.getByTestId(`mcp-tool-${tool.name}`);
      expect(row.textContent).toContain(tool.name);
      for (const p of tool.params) {
        expect(row.textContent).toContain(p.name);
        expect(row.textContent).toContain(
          p.required ? "required" : "optional",
        );
      }
    }
  });

  it("copy button writes a secret-free payload to the clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    renderAgentIntegrations();
    fireEvent.click(screen.getByTestId("copy-connection-details"));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledTimes(1);
    });
    const payload = writeText.mock.calls[0][0] as string;
    expect(payload).toContain("/functions/v1/mcp");
    expect(payload).toContain("/.lovable/oauth/consent");
    expect(payload).toContain("list_grows");
    expect(containsSecretLikeValue(payload)).toBe(false);

    await waitFor(() => {
      expect(screen.getByTestId("copy-status").textContent).toMatch(
        /copied/i,
      );
    });
  });

  it("copy button shows a failure status when the clipboard rejects", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    renderAgentIntegrations();
    fireEvent.click(screen.getByTestId("copy-connection-details"));
    await waitFor(() => {
      expect(screen.getByTestId("copy-status").textContent).toMatch(
        /copy failed/i,
      );
    });
  });

  it("exposes the manifest link with target=_blank + rel=noopener", () => {
    renderAgentIntegrations();
    const link = screen.getByTestId("mcp-manifest-link") as HTMLAnchorElement;
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toMatch(/noopener/);
  });

  it("renders manifest version, fingerprint, and tool count", () => {
    renderAgentIntegrations();
    expect(screen.getByTestId("manifest-version").textContent).toBe(
      MCP_MANIFEST.version,
    );
    expect(screen.getByTestId("manifest-fingerprint").textContent).toMatch(
      /^[0-9a-f]+/,
    );
    expect(screen.getByTestId("manifest-tool-count").textContent).toContain(
      `Tools advertised: ${MCP_MANIFEST.tools.length}`,
    );
  });

  it("lists exactly the three shipped MCP tools by name", () => {
    renderAgentIntegrations();
    const names = MCP_MANIFEST.tools.map((t) => t.name);
    expect(names).toEqual([
      "list_grows",
      "list_recent_diary_entries",
      "get_latest_sensor_snapshot",
    ]);
    for (const n of names) {
      expect(screen.getByTestId(`mcp-tool-${n}`)).toBeTruthy();
    }
  });

  it("renders the Verify tool access button + not_checked panel by default", () => {
    renderAgentIntegrations();
    expect(screen.getByTestId("verify-tool-access-button")).toBeTruthy();
    const panel = screen.getByTestId("verify-tool-access-result");
    expect(panel.getAttribute("data-status")).toBe("not_checked");
    expect(screen.getByTestId("verify-label").textContent).toMatch(/not checked/i);
    expect(screen.getByTestId("verify-tool-checked").textContent).toMatch(
      /list_grows/,
    );
    expect(screen.getByTestId("verify-next-step").textContent).toMatch(
      /run verify tool access after connecting an agent/i,
    );
  });

  it("shows harness_unavailable after clicking Verify with the default browser harness", async () => {
    renderAgentIntegrations();
    fireEvent.click(screen.getByTestId("verify-tool-access-button"));
    await waitFor(() => {
      expect(
        screen
          .getByTestId("verify-tool-access-result")
          .getAttribute("data-status"),
      ).toBe("harness_unavailable");
    });
    expect(screen.getByTestId("verify-next-step").textContent).toMatch(
      /configured local harness/i,
    );
  });

  it("renders authorized state when a harness adapter reports ok", async () => {
    render(
      <MemoryRouter initialEntries={["/settings/agent-integrations"]}>
        <Routes>
          <Route
            path="/settings/agent-integrations"
            element={
              <AgentIntegrations
                verifyHarness={{
                  available: true,
                  probe: async () => ({ ok: true, growCount: 1 }),
                }}
              />
            }
          />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByTestId("verify-tool-access-button"));
    await waitFor(() => {
      expect(
        screen
          .getByTestId("verify-tool-access-result")
          .getAttribute("data-status"),
      ).toBe("authorized");
    });
    expect(screen.getByTestId("verify-grow-count").textContent).toContain(
      "1 grow",
    );
    // Never leaks token-shaped strings into DOM.
    const body = document.body.textContent ?? "";
    expect(body).not.toMatch(/eyJ[A-Za-z0-9]{5,}\./);
    expect(body).not.toMatch(/service_role/i);
    expect(body).not.toMatch(/refresh_token/i);
  });

  it("renders unauthorized state when the probe says unauthenticated", async () => {
    render(
      <MemoryRouter initialEntries={["/settings/agent-integrations"]}>
        <Routes>
          <Route
            path="/settings/agent-integrations"
            element={
              <AgentIntegrations
                verifyHarness={{
                  available: true,
                  probe: async () => ({ ok: false, unauthenticated: true }),
                }}
              />
            }
          />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByTestId("verify-tool-access-button"));
    await waitFor(() => {
      expect(
        screen
          .getByTestId("verify-tool-access-result")
          .getAttribute("data-status"),
      ).toBe("unauthorized");
    });
  });

  it("renders failed state when the probe rejects, without leaking details", async () => {
    render(
      <MemoryRouter initialEntries={["/settings/agent-integrations"]}>
        <Routes>
          <Route
            path="/settings/agent-integrations"
            element={
              <AgentIntegrations
                verifyHarness={{
                  available: true,
                  probe: async () => {
                    throw new Error(
                      "Bearer eyJabc.SECRET.SIG service_role refresh_token=xyz",
                    );
                  },
                }}
              />
            }
          />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByTestId("verify-tool-access-button"));
    await waitFor(() => {
      expect(
        screen
          .getByTestId("verify-tool-access-result")
          .getAttribute("data-status"),
      ).toBe("failed");
    });
    const body = document.body.textContent ?? "";
    expect(body).not.toMatch(/eyJabc\./);
    expect(body).not.toMatch(/service_role/i);
    expect(body).not.toMatch(/refresh_token/i);
  });

  it("renders the connect-agent checklist with all 7 steps + OAuth consent link", () => {
    renderAgentIntegrations();
    const list = screen.getByTestId("connect-agent-steps");
    expect(list.querySelectorAll("li").length).toBe(7);
    expect(list.textContent).toMatch(/ChatGPT/);
    expect(list.textContent).toMatch(/OAuth consent/i);
    expect(list.textContent).toMatch(/list_grows/);

    const consent = screen.getByTestId(
      "open-oauth-consent-link",
    ) as HTMLAnchorElement;
    expect(consent.getAttribute("href")).toContain("/.lovable/oauth/consent");
    expect(consent.getAttribute("rel")).toMatch(/noopener/);

    const manifest = screen.getByTestId(
      "view-mcp-manifest-link",
    ) as HTMLAnchorElement;
    expect(manifest.getAttribute("target")).toBe("_blank");
    expect(manifest.getAttribute("rel")).toMatch(/noopener/);

    expect(
      screen.getByTestId("connect-agent-safety-copy").textContent,
    ).toMatch(/read-only/i);
  });

  it("checklist links carry accessible aria-labels", () => {
    renderAgentIntegrations();
    expect(
      screen.getByTestId("open-oauth-consent-link").getAttribute("aria-label"),
    ).toMatch(/OAuth consent/i);
    expect(
      screen.getByTestId("view-mcp-manifest-link").getAttribute("aria-label"),
    ).toMatch(/MCP manifest/i);
    expect(
      screen
        .getByTestId("view-tool-reference-link")
        .getAttribute("aria-label"),
    ).toMatch(/tool reference/i);
    expect(
      screen
        .getByTestId("copy-connection-details")
        .getAttribute("aria-label"),
    ).toMatch(/connection details/i);
    expect(
      screen
        .getByTestId("open-manifest-summary-modal")
        .getAttribute("aria-label"),
    ).toMatch(/safe MCP manifest summary/i);
  });

  it("next-step guidance changes with verification state (unauthorized)", async () => {
    render(
      <MemoryRouter initialEntries={["/settings/agent-integrations"]}>
        <Routes>
          <Route
            path="/settings/agent-integrations"
            element={
              <AgentIntegrations
                verifyHarness={{
                  available: true,
                  probe: async () => ({ ok: false, unauthenticated: true }),
                }}
              />
            }
          />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByTestId("verify-tool-access-button"));
    await waitFor(() => {
      expect(
        screen
          .getByTestId("verify-tool-access-result")
          .getAttribute("data-status"),
      ).toBe("unauthorized");
    });
    expect(screen.getByTestId("verify-next-step").textContent).toMatch(
      /complete OAuth consent/i,
    );
  });

  it("View MCP manifest modal opens, renders the safe projection, and copy excludes secrets", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    renderAgentIntegrations();
    fireEvent.click(screen.getByTestId("open-manifest-summary-modal"));

    await waitFor(() => {
      expect(screen.getByTestId("manifest-summary-modal")).toBeTruthy();
    });
    expect(screen.getByTestId("manifest-summary-title").textContent).toMatch(
      /safe MCP manifest summary/i,
    );
    expect(
      screen.getByTestId("manifest-summary-tool-count").textContent,
    ).toContain(String(MCP_MANIFEST.tools.length));
    for (const t of MCP_MANIFEST.tools) {
      expect(screen.getByTestId(`manifest-summary-tool-${t.name}`)).toBeTruthy();
    }
    expect(
      screen.getByTestId("manifest-summary-safety-note").textContent,
    ).toMatch(/does not include tokens/i);

    // Copy button excludes secret-like values.
    fireEvent.click(screen.getByTestId("manifest-summary-copy"));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const payload = writeText.mock.calls[0][0] as string;
    expect(payload).toContain("Verdant Grow OS");
    expect(payload).toContain("list_grows");
    expect(containsSecretLikeValue(payload)).toBe(false);

    // Modal DOM contains no token/secret-like strings.
    const modalText =
      screen.getByTestId("manifest-summary-modal").textContent ?? "";
    expect(modalText).not.toMatch(/eyJ[A-Za-z0-9]{5,}\./);
    expect(modalText.toLowerCase()).not.toContain("service_role");
    expect(modalText.toLowerCase()).not.toContain("refresh_token");
    expect(modalText.toLowerCase()).not.toContain("bearer ");
  });
});

// ---------- OAuth consent route ----------


function renderConsent(authorizationId: string | null) {
  const initial = authorizationId
    ? `/.lovable/oauth/consent?authorization_id=${authorizationId}`
    : `/.lovable/oauth/consent`;
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route
          path="/.lovable/oauth/consent"
          element={<OAuthConsent />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("OAuthConsent route regression", () => {
  const originalLocation = window.location;

  beforeEach(() => {
    // jsdom's window.location isn't fully writable; replace with a
    // minimal stub we can observe.
    Object.defineProperty(window, "location", {
      configurable: true,
      writable: true,
      value: {
        origin: "http://localhost",
        pathname: "/.lovable/oauth/consent",
        search: "?authorization_id=abc",
        href: "http://localhost/.lovable/oauth/consent?authorization_id=abc",
      },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "location", {
      configurable: true,
      writable: true,
      value: originalLocation,
    });
  });

  it("shows an error when authorization_id is missing", async () => {
    renderConsent(null);
    await waitFor(() => {
      expect(screen.getByText(/authorization request failed/i)).toBeTruthy();
    });
    expect(screen.getByText(/missing authorization_id/i)).toBeTruthy();
  });

  it("redirects unauthenticated visitors to /auth with the consent URL preserved", async () => {
    getSessionMock.mockResolvedValue({ data: { session: null } });

    renderConsent("abc-123");

    await waitFor(() => {
      expect(window.location.href).toMatch(/^\/auth\?redirectTo=/);
    });
    // The full consent path (including query) must be preserved.
    expect(window.location.href).toContain(
      encodeURIComponent("/.lovable/oauth/consent"),
    );
    expect(getAuthorizationDetailsMock).not.toHaveBeenCalled();
  });

  it("renders the approve/deny screen when the session + details resolve", async () => {
    getSessionMock.mockResolvedValue({
      data: { session: { access_token: "SESSION_STUB" } },
    });
    getAuthorizationDetailsMock.mockResolvedValue({
      data: {
        client: { name: "ChatGPT" },
        redirect_uri: "https://chat.openai.com/callback",
      },
      error: null,
    });

    renderConsent("abc-123");

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /connect chatgpt/i }),
      ).toBeTruthy();
    });
    expect(screen.getByRole("button", { name: /approve/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /deny/i })).toBeTruthy();
    // No session token or details JSON leaks into the visible DOM.
    expect(document.body.textContent).not.toContain("SESSION_STUB");
    expect(document.body.textContent).not.toContain("access_token");
  });

  it("renders an error state when getAuthorizationDetails fails", async () => {
    getSessionMock.mockResolvedValue({
      data: { session: { access_token: "x" } },
    });
    getAuthorizationDetailsMock.mockResolvedValue({
      data: null,
      error: { message: "expired authorization" },
    });

    renderConsent("abc-123");

    await waitFor(() => {
      expect(screen.getByText(/expired authorization/i)).toBeTruthy();
    });
  });

  it("approve calls approveAuthorization and redirects to the returned URL", async () => {
    getSessionMock.mockResolvedValue({
      data: { session: { access_token: "x" } },
    });
    getAuthorizationDetailsMock.mockResolvedValue({
      data: { client: { name: "Cursor" } },
      error: null,
    });
    approveAuthorizationMock.mockResolvedValue({
      data: { redirect_url: "https://cursor.example/callback?code=OK" },
      error: null,
    });

    renderConsent("abc-123");
    await waitFor(() =>
      screen.getByRole("button", { name: /approve/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: /approve/i }));

    await waitFor(() => {
      expect(approveAuthorizationMock).toHaveBeenCalledWith("abc-123");
      expect(window.location.href).toBe(
        "https://cursor.example/callback?code=OK",
      );
    });
  });
});
