import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "@/lib/react-router-compat";

const getSessionMock = vi.fn();
const getAuthorizationDetailsMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => getSessionMock(...args),
      oauth: {
        getAuthorizationDetails: (...args: unknown[]) => getAuthorizationDetailsMock(...args),
        approveAuthorization: vi.fn(),
        denyAuthorization: vi.fn(),
      },
    },
  },
}));

import OAuthConsent from "@/pages/OAuthConsent";

function renderConsent() {
  return render(
    <MemoryRouter initialEntries={["/.lovable/oauth/consent?authorization_id=boundary-test"]}>
      <Routes>
        <Route path="/.lovable/oauth/consent" element={<OAuthConsent />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("OAuth consent credential boundary copy", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    getAuthorizationDetailsMock.mockReset();
    getSessionMock.mockResolvedValue({
      data: { session: { access_token: "SESSION_STUB" } },
    });
    getAuthorizationDetailsMock.mockResolvedValue({
      data: { client: { name: "Trusted Test Client" } },
      error: null,
    });
  });

  it("scopes read-only claims to Verdant's current MCP tools", async () => {
    renderConsent();

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /connect trusted test client/i })).toBeTruthy();
    });

    const clientCopy = screen.getByTestId("oauth-consent-client-copy").textContent ?? "";
    const safetyCopy = screen.getByTestId("oauth-consent-safety").textContent ?? "";
    expect(clientCopy).toMatch(/current MCP tools/i);
    expect(clientCopy).toMatch(/read-only operations/i);
    expect(safetyCopy).toMatch(/current MCP tools do not expose/i);
    expect(safetyCopy).toMatch(/write tools/i);
  });

  it("discloses that the bearer is not resource-bound and normal permissions may apply", async () => {
    renderConsent();

    await waitFor(() => {
      expect(screen.getByTestId("oauth-consent-credential-boundary")).toBeTruthy();
    });
    const boundary = screen.getByTestId("oauth-consent-credential-boundary").textContent ?? "";
    expect(boundary).toMatch(/authenticated account credential/i);
    expect(boundary).toMatch(/not currently.*only at the MCP endpoint/i);
    expect(boundary).toMatch(/normal signed-in account permissions may apply/i);
  });

  it("points revocation to implemented support instead of an invented settings control", async () => {
    renderConsent();

    await waitFor(() => {
      expect(screen.getByTestId("oauth-consent-revoke")).toBeTruthy();
    });
    const revokeCopy = screen.getByTestId("oauth-consent-revoke").textContent ?? "";
    const support = screen.getByTestId("oauth-consent-support-link") as HTMLAnchorElement;

    expect(revokeCopy).toMatch(/does not yet provide a self-service/i);
    expect(revokeCopy).toMatch(/Signing out is not presented as revoking/i);
    expect(support.getAttribute("href")).toBe("/contact");
    expect(revokeCopy).not.toMatch(/Supabase auth settings/i);
  });
});
