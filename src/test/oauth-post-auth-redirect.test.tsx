import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "@/lib/react-router-compat";
import { beforeEach, describe, expect, it, vi } from "vitest";
import OAuthPostAuthRedirect from "@/components/OAuthPostAuthRedirect";
import {
  OAUTH_POST_AUTH_REDIRECT_STORAGE_KEY,
  savePendingOAuthPostAuthRedirect,
} from "@/lib/oauthPostAuthRedirectRules";

const authState = vi.hoisted(() => ({
  user: { id: "user-oauth" } as { id: string } | null,
  loading: false,
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => authState,
}));

function LocationProbe() {
  const location = useLocation();
  return (
    <output data-testid="oauth-post-auth-location">
      {`${location.pathname}${location.search}${location.hash}`}
    </output>
  );
}

function renderRedirect(initialEntry = "/") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <OAuthPostAuthRedirect />
      <Routes>
        <Route path="/" element={<LocationProbe />} />
        <Route path="/onboarding" element={<LocationProbe />} />
        <Route path="/plants/:plantId" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("OAuthPostAuthRedirect", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    authState.user = { id: "user-oauth" };
    authState.loading = false;
  });

  it("restores a one-shot safe destination after OAuth returns to the app root", async () => {
    savePendingOAuthPostAuthRedirect("/plants/plant-123?tentId=tent-1#plant-ai-doctor-review");
    renderRedirect();

    await waitFor(() =>
      expect(screen.getByTestId("oauth-post-auth-location")).toHaveTextContent(
        "/plants/plant-123?tentId=tent-1#plant-ai-doctor-review",
      ),
    );
    expect(window.sessionStorage.getItem(OAUTH_POST_AUTH_REDIRECT_STORAGE_KEY)).toBeNull();
  });

  it("does not navigate without a pending target or on a non-root route", async () => {
    const first = renderRedirect();
    expect(screen.getByTestId("oauth-post-auth-location")).toHaveTextContent("/");
    first.unmount();

    savePendingOAuthPostAuthRedirect("/onboarding?intent=csv_history");
    renderRedirect("/onboarding");
    await waitFor(() =>
      expect(screen.getByTestId("oauth-post-auth-location")).toHaveTextContent("/onboarding"),
    );
    expect(window.sessionStorage.getItem(OAUTH_POST_AUTH_REDIRECT_STORAGE_KEY)).not.toBeNull();
  });
});
