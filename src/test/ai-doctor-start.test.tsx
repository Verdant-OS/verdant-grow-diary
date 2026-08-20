import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "@/lib/react-router-compat";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  data: [] as Array<Record<string, unknown>>,
  isLoading: false,
  isError: false,
  refetch: vi.fn(async () => undefined),
  invoke: vi.fn(),
  // B4a: the page now validates any carried ?growId=/?tentId= against rows
  // the grower owns, so the harness has to supply those rows.
  tents: [] as Array<Record<string, unknown>>,
  grows: [] as Array<Record<string, unknown>>,
  // B4a review: ownership reads start EMPTY, not absent. The harness must be
  // able to say "still loading" and "read failed" as distinct from "no rows".
  growsLoading: false,
  growsError: null as string | null,
  tentsLoading: false,
  tentsError: false,
  // B4a review: neither ownership read retries on its own, so the page owns a
  // retry affordance. The harness has to be able to observe it firing.
  tentsFetching: false,
  tentsRefetch: vi.fn(async () => undefined),
  growsRefresh: vi.fn(async () => undefined),
}));

vi.mock("@/hooks/useGrowData", () => ({
  useGrowPlants: () => ({
    data: state.data,
    isLoading: state.isLoading,
    isError: state.isError,
    refetch: state.refetch,
  }),
  useGrowTents: () => ({
    data: state.tents,
    isLoading: state.tentsLoading,
    isError: state.tentsError,
    isFetching: state.tentsFetching,
    refetch: state.tentsRefetch,
  }),
}));

vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: state.grows,
    loading: state.growsLoading,
    error: state.growsError,
    refresh: state.growsRefresh,
  }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: state.invoke } },
}));

import AiDoctorStart from "@/pages/AiDoctorStart";

function LocationProbe() {
  const location = useLocation();
  return (
    <output data-testid="location">
      {location.pathname}
      {location.search}
      {location.hash}
    </output>
  );
}

function renderPage(entry = "/doctor") {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <LocationProbe />
      <Routes>
        <Route path="/doctor" element={<AiDoctorStart />} />
        <Route path="/plants/:id" element={<div data-testid="plant-detail">Plant detail</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("AiDoctorStart", () => {
  beforeEach(() => {
    state.data = [];
    state.isLoading = false;
    state.isError = false;
    state.refetch.mockClear();
    state.invoke.mockClear();
    state.tents = [];
    state.grows = [];
    state.growsLoading = false;
    state.growsError = null;
    state.tentsLoading = false;
    state.tentsError = false;
    state.tentsFetching = false;
    state.tentsRefetch.mockClear();
    state.growsRefresh.mockClear();
  });

  afterEach(() => cleanup());

  it("renders a distinct loading state without implying an empty plant list", () => {
    state.isLoading = true;
    renderPage();

    expect(screen.getByTestId("ai-doctor-start-loading")).toHaveAttribute("role", "status");
    expect(screen.queryByText("No active plants to review")).toBeNull();
  });

  it("renders the failed-read state and retries without inventing plant choices", () => {
    state.isError = true;
    renderPage();

    expect(screen.getByTestId("ai-doctor-start-error")).toHaveAttribute("role", "alert");
    expect(screen.getByText(/won't choose one from incomplete data/i)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("ai-doctor-start-error-retry"));
    expect(state.refetch).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("ai-doctor-start-options")).toBeNull();
  });

  it("renders a clear empty state with a Plants handoff", () => {
    renderPage();

    expect(screen.getByText("No active plants to review")).toBeInTheDocument();
    expect(screen.getByTestId("ai-doctor-start-empty-plants-link")).toHaveAttribute(
      "href",
      "/plants",
    );
  });

  it("renders active choices in deterministic order with exact tent and anchor context", () => {
    state.data = [
      { id: "beta", name: "Beta", stage: "flower", tentId: "tent-b" },
      { id: "alpha", name: "Alpha", strain: "Kush", tentId: "tent-a" },
      { id: "archived", name: "Archived", isArchived: true },
    ];
    renderPage();

    const options = screen.getAllByRole("link", { name: /with AI Doctor/i });
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveAccessibleName("Review Alpha with AI Doctor");
    expect(options[0]).toHaveAttribute(
      "href",
      "/plants/alpha?tentId=tent-a#plant-ai-doctor-review",
    );
    expect(options[1]).toHaveAttribute("href", "/plants/beta?tentId=tent-b#plant-ai-doctor-review");
    expect(screen.getByTestId("ai-doctor-start-history-link")).toHaveAttribute(
      "href",
      "/doctor/sessions",
    );
  });

  it("never auto-selects or runs AI when exactly one plant is available", () => {
    state.data = [{ id: "solo", name: "Solo", tentId: "tent-1" }];
    renderPage();

    expect(screen.getByTestId("location")).toHaveTextContent("/doctor");
    expect(screen.queryByTestId("plant-detail")).toBeNull();
    expect(screen.getAllByRole("link", { name: /with AI Doctor/i })).toHaveLength(1);
    expect(
      screen.getByText(/runs only after you press the review button there/i),
    ).toBeInTheDocument();
    expect(state.invoke).not.toHaveBeenCalled();
  });

  // ---- Tranche B+ slice B4a — carried context (D-B6, D4) ----

  const SCOPED = {
    grows: [{ id: "grow-1", name: "Autumn Run" }],
    tents: [{ id: "tent-a", name: "Tent A", grow_id: "grow-1" }],
    plants: [
      { id: "beta", name: "Beta", tentId: "tent-b" },
      { id: "alpha", name: "Alpha", tentId: "tent-a" },
    ],
  };

  it("mounts the loop card so the visual chain does not break at /doctor", () => {
    renderPage();
    expect(screen.getByTestId("ai-doctor-start-one-tent-loop-next-step-card")).toHaveAttribute(
      "data-current-step",
      "ai-doctor",
    );
  });

  it("labels a carried tent and lists its plants first WITHOUT removing any choice", () => {
    state.grows = SCOPED.grows;
    state.tents = SCOPED.tents;
    state.data = SCOPED.plants;
    renderPage("/doctor?growId=grow-1&tentId=tent-a");

    const tentContext = screen.getByTestId("ai-doctor-start-tent-context");
    expect(tentContext).toHaveTextContent("Tent A");
    // Origin-neutral: the URL carries no provenance, and B4b (the Sensors
    // producer) is deferred, so claiming the context came from Sensor Snapshot
    // would assert a navigation history Verdant cannot observe.
    expect(tentContext).not.toHaveTextContent(/sensor snapshot/i);
    const options = screen.getAllByRole("link", { name: /with AI Doctor/i });
    // Alpha (in tent-a) is promoted above Beta, but Beta is still choosable —
    // the doctrine is an explicit choice, and a shortened list is a soft guess.
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveAccessibleName("Review Alpha with AI Doctor");
    expect(screen.getByTestId("ai-doctor-start-option-0-in-tent")).toBeInTheDocument();
    expect(screen.queryByTestId("ai-doctor-start-option-1-in-tent")).toBeNull();
  });

  it("fails closed on a tent the grower does not own and says so calmly", () => {
    state.grows = SCOPED.grows;
    state.tents = SCOPED.tents;
    state.data = SCOPED.plants;
    renderPage("/doctor?growId=grow-1&tentId=tent-someone-else");

    expect(screen.queryByTestId("ai-doctor-start-tent-context")).toBeNull();
    expect(screen.getByTestId("ai-doctor-start-invalid-scope")).toBeInTheDocument();
    // Every active plant is still offered.
    expect(screen.getAllByRole("link", { name: /with AI Doctor/i })).toHaveLength(2);
  });

  it("never triggers an AI call from carried context", () => {
    state.grows = SCOPED.grows;
    state.tents = SCOPED.tents;
    state.data = SCOPED.plants;
    renderPage("/doctor?growId=grow-1&tentId=tent-a");

    expect(state.invoke).not.toHaveBeenCalled();
    expect(screen.getByTestId("location")).toHaveTextContent("/doctor");
    expect(screen.queryByTestId("plant-detail")).toBeNull();
  });

  it("does not call a carried scope invalid while the ownership reads are still loading", () => {
    // grows starts as [] with loading=true. Resolving against that would tell
    // the grower their own valid link "couldn't be matched" — an unknown
    // answer presented as a negative one.
    state.growsLoading = true;
    state.tentsLoading = true;
    state.data = SCOPED.plants;
    renderPage("/doctor?growId=grow-1&tentId=tent-a");

    expect(screen.queryByTestId("ai-doctor-start-invalid-scope")).toBeNull();
    expect(screen.queryByTestId("ai-doctor-start-tent-context")).toBeNull();
  });

  it("reports a FAILED ownership read as unverified, never as invalid ownership", () => {
    state.growsError = "network down";
    state.data = SCOPED.plants;
    renderPage("/doctor?growId=grow-1&tentId=tent-a");

    expect(screen.getByTestId("ai-doctor-start-scope-unverified")).toBeInTheDocument();
    // Crucially NOT the account-mismatch wording — we do not know that.
    expect(screen.queryByTestId("ai-doctor-start-invalid-scope")).toBeNull();
  });

  it("offers a retry when the ownership reads fail, and retries only what failed", () => {
    // Neither read recovers on its own (`useGrowTents` sets retry:false; the
    // grows store refreshes on mount only), so without this affordance one
    // transient failure would disable valid carried context until a reload.
    state.growsError = "network down";
    state.data = SCOPED.plants;
    renderPage("/doctor?growId=grow-1&tentId=tent-a");

    fireEvent.click(screen.getByTestId("ai-doctor-start-scope-retry"));

    expect(state.growsRefresh).toHaveBeenCalledTimes(1);
    // The tents read succeeded — re-reading a healthy source is waste.
    expect(state.tentsRefetch).not.toHaveBeenCalled();
  });

  it("retries the tents read when that is the one that failed", () => {
    state.tentsError = true;
    state.data = SCOPED.plants;
    renderPage("/doctor?growId=grow-1&tentId=tent-a");

    fireEvent.click(screen.getByTestId("ai-doctor-start-scope-retry"));

    expect(state.tentsRefetch).toHaveBeenCalledTimes(1);
    expect(state.growsRefresh).not.toHaveBeenCalled();
  });

  it("disables the retry while a re-read is already in flight", () => {
    state.tentsError = true;
    state.tentsFetching = true;
    state.data = SCOPED.plants;
    renderPage("/doctor?growId=grow-1&tentId=tent-a");

    const retry = screen.getByTestId("ai-doctor-start-scope-retry");
    expect(retry).toBeDisabled();
    expect(retry).toHaveTextContent("Checking");
  });

  it("does not claim plants are listed when the plants read failed", () => {
    // The same outage that breaks the scope reads usually breaks this one, and
    // the list is then replaced by an error state. Saying "every active plant
    // is listed below" over an error panel tells the grower something the page
    // is visibly not doing.
    state.growsError = "network down";
    state.isError = true;
    renderPage("/doctor?growId=grow-1&tentId=tent-a");

    const message = screen.getByTestId("ai-doctor-start-scope-unverified");
    expect(message).toBeInTheDocument();
    expect(message).not.toHaveTextContent("Every active plant is listed below");
    // The read failure still gets its own honest surface.
    expect(screen.getByTestId("ai-doctor-start-error")).toBeInTheDocument();
  });

  it("does not claim plants are listed when there are no active plants", () => {
    state.growsError = "network down";
    state.data = [];
    renderPage("/doctor?growId=grow-1&tentId=tent-a");

    expect(screen.getByTestId("ai-doctor-start-scope-unverified")).not.toHaveTextContent(
      "Every active plant is listed below",
    );
  });

  it("still claims the list when plants really are listed", () => {
    state.growsError = "network down";
    state.data = SCOPED.plants;
    renderPage("/doctor?growId=grow-1&tentId=tent-a");

    expect(screen.getByTestId("ai-doctor-start-scope-unverified")).toHaveTextContent(
      "Every active plant is listed below",
    );
  });

  it("applies the same honesty gate to the unowned-scope message", () => {
    state.isError = true;
    state.grows = SCOPED.grows;
    renderPage("/doctor?growId=grow-1&tentId=tent-does-not-exist");

    const message = screen.getByTestId("ai-doctor-start-invalid-scope");
    expect(message).not.toHaveTextContent("Every active plant is listed below");
  });

  it("keeps the carried-tent fact but drops the list claim when plants fail to load", () => {
    // The carried context IS true and worth confirming, so the paragraph
    // stays — only the clause that describes a list which is not on screen
    // goes. Hiding the whole thing would also break the aria-describedby
    // relationship the in-tent badge relies on.
    state.isError = true;
    state.grows = SCOPED.grows;
    state.tents = SCOPED.tents;
    renderPage("/doctor?growId=grow-1&tentId=tent-a");

    const context = screen.getByTestId("ai-doctor-start-tent-context");
    expect(context).toHaveTextContent("This link carried tent context");
    expect(context).not.toHaveTextContent("Its plants are listed first");
  });

  it("keeps the list clause when the plants really are listed", () => {
    state.data = SCOPED.plants;
    state.grows = SCOPED.grows;
    state.tents = SCOPED.tents;
    renderPage("/doctor?growId=grow-1&tentId=tent-a");

    expect(screen.getByTestId("ai-doctor-start-tent-context")).toHaveTextContent(
      "Its plants are listed first",
    );
  });

  it("keeps a verified tent when only the UNNEEDED grows read failed", () => {
    // A tent-only URL is supported (a legacy tent may carry a null grow_id).
    // There, the grows read only enriches the tent's owning grow, so its
    // failure must not discard a tent tentsQuery confirmed the grower owns —
    // that would be a read failure silently costing valid context.
    state.growsError = "network down";
    state.tents = SCOPED.tents;
    state.data = SCOPED.plants;
    renderPage("/doctor?tentId=tent-a");

    expect(screen.getByTestId("ai-doctor-start-tent-context")).toBeInTheDocument();
    expect(screen.queryByTestId("ai-doctor-start-scope-unverified")).toBeNull();
    expect(screen.queryByTestId("ai-doctor-start-invalid-scope")).toBeNull();
  });

  it("still reports unverified when the read the URL actually needed failed", () => {
    state.growsError = "network down";
    state.tents = SCOPED.tents;
    state.data = SCOPED.plants;
    renderPage("/doctor?growId=grow-1");

    expect(screen.getByTestId("ai-doctor-start-scope-unverified")).toBeInTheDocument();
  });

  it("holds the plant list until carried-scope ordering has settled", () => {
    // Rendering first would show the unscoped alphabetical order and then
    // reorder and re-badge under the grower's pointer; a link can move
    // mid-click and the choice would bypass the carried context.
    state.tentsLoading = true;
    state.data = SCOPED.plants;
    renderPage("/doctor?growId=grow-1&tentId=tent-a");

    expect(screen.queryByTestId("ai-doctor-start-options")).toBeNull();
    expect(screen.getByTestId("ai-doctor-start-loading")).toBeInTheDocument();
  });

  it("does not hold the list when no scope was carried", () => {
    // Nothing can reorder, so waiting would be a stall for no benefit.
    state.tentsLoading = true;
    state.data = SCOPED.plants;
    renderPage("/doctor");

    expect(screen.getByTestId("ai-doctor-start-options")).toBeInTheDocument();
  });

  it("does not hold a tent-only URL behind the unrelated grows read", () => {
    // Ordering keys off the resolved tent, so a still-loading grows list
    // cannot reorder anything here. Waiting on it would hide a verified tent
    // and a loaded plant list behind a request the URL does not depend on.
    state.growsLoading = true;
    state.tents = SCOPED.tents;
    state.data = SCOPED.plants;
    renderPage("/doctor?tentId=tent-a");

    expect(screen.getByTestId("ai-doctor-start-options")).toBeInTheDocument();
    expect(screen.getByTestId("ai-doctor-start-tent-context")).toBeInTheDocument();
  });

  it("does not hold a grow-only URL behind the unrelated tents read", () => {
    state.tentsLoading = true;
    state.grows = SCOPED.grows;
    state.data = SCOPED.plants;
    renderPage("/doctor?growId=grow-1");

    expect(screen.getByTestId("ai-doctor-start-options")).toBeInTheDocument();
  });

  it("still holds when BOTH ids are carried and either read is pending", () => {
    // Both are needed then: the rules cross-check that the tent belongs to
    // the grow, and the result drives ordering.
    state.tentsLoading = true;
    state.grows = SCOPED.grows;
    state.data = SCOPED.plants;
    renderPage("/doctor?growId=grow-1&tentId=tent-a");

    expect(screen.queryByTestId("ai-doctor-start-options")).toBeNull();
  });

  it("does not claim a list while scope ordering has replaced it with a loader", () => {
    // Reachable via the retry path: clicking retry sets the scope read loading
    // again while its error still stands, so the failure paragraph would
    // otherwise describe a list the page has just swapped for a loading panel.
    state.growsError = "network down";
    state.growsLoading = true;
    state.data = SCOPED.plants;
    renderPage("/doctor?growId=grow-1&tentId=tent-a");

    expect(screen.queryByTestId("ai-doctor-start-options")).toBeNull();
    expect(screen.getByTestId("ai-doctor-start-scope-unverified")).not.toHaveTextContent(
      "Every active plant is listed below",
    );
  });

  it("does not disable the retry because an UNRELATED read is in flight", () => {
    // Both reads always mount. On a grow-only URL a slow tents query must not
    // leave the button stuck on "Checking…" while the failed grows read is not
    // being retried at all.
    state.growsError = "network down";
    state.tentsFetching = true;
    state.data = SCOPED.plants;
    renderPage("/doctor?growId=grow-1");

    const retry = screen.getByTestId("ai-doctor-start-scope-retry");
    expect(retry).toBeEnabled();
    expect(retry).toHaveTextContent("Try the check again");
  });

  it("still disables the retry while the REQUIRED read is being re-fetched", () => {
    state.tentsError = true;
    state.tentsFetching = true;
    state.data = SCOPED.plants;
    renderPage("/doctor?tentId=tent-a");

    expect(screen.getByTestId("ai-doctor-start-scope-retry")).toBeDisabled();
  });

  it("offers no retry when no scope was carried — there is nothing to re-check", () => {
    state.growsError = "network down";
    state.data = SCOPED.plants;
    renderPage("/doctor");

    expect(screen.queryByTestId("ai-doctor-start-scope-retry")).toBeNull();
  });

  it("says nothing about scope when no scope was carried, even on a failed read", () => {
    state.growsError = "network down";
    state.data = SCOPED.plants;
    renderPage("/doctor");

    expect(screen.queryByTestId("ai-doctor-start-scope-unverified")).toBeNull();
    expect(screen.queryByTestId("ai-doctor-start-invalid-scope")).toBeNull();
  });

  it("exposes the in-tent badge to assistive tech as the link's description", () => {
    state.grows = SCOPED.grows;
    state.tents = SCOPED.tents;
    state.data = SCOPED.plants;
    renderPage("/doctor?growId=grow-1&tentId=tent-a");

    const promoted = screen.getAllByRole("link", { name: /with AI Doctor/i })[0];
    const badgeId = "ai-doctor-start-option-0-in-tent";
    expect(promoted).toHaveAttribute("aria-describedby", badgeId);
    // The action name is unchanged — the badge describes, it does not rename.
    expect(promoted).toHaveAccessibleName("Review Alpha with AI Doctor");
    expect(document.getElementById(badgeId)).toHaveTextContent("In this tent");
  });
});
