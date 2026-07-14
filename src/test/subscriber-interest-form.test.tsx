import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  insert: vi.fn(),
  track: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: unknown[]) => mocks.from(...args),
  },
}));

vi.mock("@/lib/pricingAnalytics", () => ({
  trackPricingEvent: (...args: unknown[]) => mocks.track(...args),
}));

import SubscriberInterestForm from "@/components/SubscriberInterestForm";

beforeEach(() => {
  mocks.from.mockReset();
  mocks.insert.mockReset();
  mocks.track.mockReset();
  mocks.from.mockReturnValue({ insert: mocks.insert });
  mocks.insert.mockResolvedValue({ error: null });
});

describe("SubscriberInterestForm", () => {
  it("captures explicit paid-plan interest without starting a subscription", async () => {
    const user = userEvent.setup();
    render(<SubscriberInterestForm planId="founder_lifetime" />);

    expect(screen.getByTestId("subscriber-interest-plan")).toHaveTextContent("Founder Lifetime");
    await user.type(screen.getByLabelText("Email"), "  Grower@Example.com ");
    await user.click(screen.getByRole("button", { name: "Email me when checkout opens" }));

    await waitFor(() => expect(mocks.insert).toHaveBeenCalledTimes(1));
    expect(mocks.from).toHaveBeenCalledWith("leads");
    expect(mocks.insert).toHaveBeenCalledWith({
      email: "grower@example.com",
      lead_type: "grower",
      source: "pricing_interest",
      message: "Requested checkout availability notice for Founder Lifetime (founder_lifetime).",
    });
    expect(mocks.track).toHaveBeenCalledWith("pricing_interest_submitted", {
      plan: "founder_lifetime",
      source: "pricing_interest",
    });
    expect(JSON.stringify(mocks.track.mock.calls)).not.toContain("grower@example.com");
    expect(screen.getByTestId("subscriber-interest-success")).toHaveTextContent(
      /no subscription started/i,
    );
    expect(screen.getByTestId("subscriber-interest-success")).toHaveTextContent(
      /no Founder spot was reserved/i,
    );
    expect(screen.getByTestId("subscriber-interest-share-card")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Share Founder Lifetime" })).toBeInTheDocument();
    expect((screen.getByLabelText("Paid plan share link") as HTMLInputElement).value).toContain(
      "plan=founder_lifetime",
    );
  });

  it("announces invalid email without writing", async () => {
    const user = userEvent.setup();
    render(<SubscriberInterestForm planId="pro_monthly" />);

    await user.type(screen.getByLabelText("Email"), "invalid");
    fireEvent.submit(screen.getByTestId("subscriber-interest-form"));

    expect(await screen.findByRole("alert")).toHaveTextContent("valid email");
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("keeps database failures calm and does not claim success", async () => {
    mocks.insert.mockResolvedValue({ error: { message: "database detail" } });
    const user = userEvent.setup();
    render(<SubscriberInterestForm planId="pro_annual" />);

    await user.type(screen.getByLabelText("Email"), "grower@example.com");
    await user.click(screen.getByRole("button", { name: "Email me when checkout opens" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("try again");
    expect(screen.queryByText("database detail")).toBeNull();
    expect(screen.queryByTestId("subscriber-interest-success")).toBeNull();
    expect(mocks.track).toHaveBeenCalledWith("pricing_interest_submit_failed", {
      plan: "pro_annual",
      source: "pricing_interest",
    });
  });

  it("resets the success claim when the selected plan changes", async () => {
    const user = userEvent.setup();
    const view = render(<SubscriberInterestForm planId="pro_monthly" />);
    await user.type(screen.getByLabelText("Email"), "grower@example.com");
    await user.click(screen.getByRole("button", { name: "Email me when checkout opens" }));
    expect(await screen.findByTestId("subscriber-interest-success")).toBeInTheDocument();

    view.rerender(<SubscriberInterestForm planId="pro_annual" />);
    expect(screen.queryByTestId("subscriber-interest-success")).toBeNull();
    expect(screen.getByTestId("subscriber-interest-plan")).toHaveTextContent("Pro Annual");
  });

  it("contains no entitlement write, private-table query, or secret path", () => {
    const source = readFileSync(
      resolve(__dirname, "../components/SubscriberInterestForm.tsx"),
      "utf8",
    );
    expect(source).toMatch(/\.from\(["']leads["']\)\.insert/);
    expect(source).not.toMatch(/billing_subscriptions|subscriptions|profiles\.tier/);
    expect(source).not.toMatch(/service_role|device[-_ ]control|action_queue/i);
    expect(source).not.toMatch(/\.select\(|\.update\(|\.upsert\(|\.delete\(/);
  });
});
