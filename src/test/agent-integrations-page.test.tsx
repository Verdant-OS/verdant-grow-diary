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
