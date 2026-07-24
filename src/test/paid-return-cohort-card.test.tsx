import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import PaidReturnCohortCard from "@/components/PaidReturnCohortCard";
import { parsePaidReturnSnapshot } from "@/lib/paidReturnSnapshotRules";

describe("PaidReturnCohortCard", () => {
  it("labels the forward-only cohort and excludes passive sensor evidence", () => {
    const snapshot = parsePaidReturnSnapshot({
      ok: true,
      counts: {
        tracked_paid_activations: 10,
        in_flight_paid_activations: 2,
        matured_paid_activations_60d: 8,
        manual_grow_returned_60d: 4,
        server_completed_ai_doctor_returned_60d: 1,
        paid_returned_60d: 4,
      },
    });

    render(<PaidReturnCohortCard snapshot={snapshot} />);

    expect(screen.getByTestId("paid-return-cohort-card")).toHaveAttribute(
      "data-status",
      "return_observed",
    );
    expect(screen.getByText("60-day paid return — forward cohort")).toBeInTheDocument();
    expect(screen.getByText(/earlier subscribers are intentionally excluded/i)).toBeInTheDocument();
    expect(screen.getByText(/Passive sensor ingestion, client-persisted/i)).toBeInTheDocument();
    expect(
      screen.getByText(/client-persisted AI sessions, and cached replays are excluded/i),
    ).toBeInTheDocument();
    expect(screen.getByText("Server-validated AI Doctor return")).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(screen.getByText(/No billing or entitlement is changed/i)).toBeInTheDocument();
  });

  it("does not show a rate before a cohort reaches day 60", () => {
    const snapshot = parsePaidReturnSnapshot({
      ok: true,
      counts: {
        tracked_paid_activations: 1,
        in_flight_paid_activations: 1,
        matured_paid_activations_60d: 0,
        manual_grow_returned_60d: 0,
        server_completed_ai_doctor_returned_60d: 0,
        paid_returned_60d: 0,
      },
    });

    render(<PaidReturnCohortCard snapshot={snapshot} />);

    expect(screen.getByTestId("paid-return-cohort-card")).toHaveAttribute(
      "data-status",
      "maturing",
    );
    expect(screen.getByText("Maturing")).toBeInTheDocument();
    expect(screen.getByText(/Wait for a captured paid cohort/i)).toBeInTheDocument();
  });
});
