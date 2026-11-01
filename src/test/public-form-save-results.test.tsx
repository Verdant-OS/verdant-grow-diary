import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/lib/react-router-compat";
import Contact from "@/pages/support/Contact";
import Feedback from "@/pages/support/Feedback";
import LeadCaptureForm from "@/components/LeadCaptureForm";
import SubscriberInterestForm from "@/components/SubscriberInterestForm";

const mocks = vi.hoisted(() => ({ insert: vi.fn(), from: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: mocks.from },
}));
vi.mock("@/pages/support/spamGuard", () => ({
  checkSpam: () => ({ ok: true }), fingerprint: () => "test", recordSubmission: vi.fn(),
}));
vi.mock("@/lib/pricingAnalytics", () => ({ trackPricingEvent: vi.fn() }));

beforeEach(() => {
  mocks.insert.mockReset();
  mocks.from.mockReset().mockReturnValue({ insert: mocks.insert });
});

const cases = [
  { name: "contact", table: "contact_messages", render: () => <Contact />, fill: () => {
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: "Test Grower" } });
    fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: "test@example.com" } });
    fireEvent.change(screen.getByLabelText(/^Message/), { target: { value: "Test message" } });
  } },
  { name: "feedback", table: "customer_feedback", render: () => <Feedback />, fill: () => {
    fireEvent.click(screen.getAllByRole("radio", { name: /4 out of 5/ })[0]);
  } },
  { name: "lead", table: "leads", render: () => <LeadCaptureForm />, fill: () => {
    fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: "test@example.com" } });
  } },
  { name: "plan interest", table: "leads", render: () => <SubscriberInterestForm planId="pro_monthly" />, fill: () => {
    fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: "test@example.com" } });
  } },
];

describe.each(cases)("$name save result", (form) => {
  it("waits for a saved row before announcing success", async () => {
    let finish: ((result: { error: null }) => void) | undefined;
    mocks.insert.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const view = render(<MemoryRouter>{form.render()}</MemoryRouter>);
    form.fill();
    const element = view.container.querySelector("form");
    if (!element) throw new Error("Missing form");
    fireEvent.submit(element);
    await waitFor(() => expect(mocks.insert).toHaveBeenCalledTimes(1));
    expect(mocks.from).toHaveBeenCalledWith(form.table);
    expect(screen.queryByRole("status")).toBeNull();
    if (!finish) throw new Error("Missing pending insert");
    finish({ error: null });
    expect(await screen.findByRole("status")).toBeInTheDocument();
  });
  it("settles a rejected save without claiming success or losing the form", async () => {
    mocks.insert.mockRejectedValue(new Error("private transport detail"));
    const view = render(<MemoryRouter>{form.render()}</MemoryRouter>);
    form.fill();
    const element = view.container.querySelector("form");
    if (!element) throw new Error("Missing form");
    fireEvent.submit(element);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.queryByRole("status")).toBeNull();
    expect(view.container.textContent).not.toContain("private transport detail");
    expect(view.container.querySelector('button[type="submit"]')).not.toBeDisabled();
  });
});