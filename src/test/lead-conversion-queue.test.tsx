import { fireEvent, render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import LeadConversionQueuePanel from "@/components/LeadConversionQueuePanel";
import type { LeadRow } from "@/hooks/useLeadsList";
import {
  buildLeadConversionQueue,
  buildLeadConversionQueueSearchParams,
  resolveLeadConversionQueueFocus,
} from "@/lib/leadConversionQueueRules";

const NOW = Date.parse("2026-07-14T12:00:00.000Z");
const REQUEST = "Requested checkout availability notice for Pro Monthly (pro_monthly).";

function lead(overrides: Partial<LeadRow> = {}): LeadRow {
  return {
    id: "lead-x",
    created_at: "2026-07-10T12:00:00.000Z",
    updated_at: null,
    name: "Riley",
    email: "riley@example.com",
    company: null,
    role: null,
    lead_type: "grower",
    source: "pricing_interest_pricing_page",
    message: REQUEST,
    status: "new",
    operator_notes: null,
    contacted_at: null,
    follow_up_at: null,
    ...overrides,
  };
}

function fixture(): LeadRow[] {
  return [
    lead({
      id: "scheduled",
      name: "Scheduled Grower",
      status: "follow_up",
      contacted_at: "2026-07-12T12:00:00.000Z",
      follow_up_at: "2026-07-20T12:00:00.000Z",
    }),
    lead({
      id: "first-new",
      name: "New Request",
      created_at: "2026-07-12T12:00:00.000Z",
    }),
    lead({
      id: "due",
      name: "Due Follow-up",
      status: "follow_up",
      contacted_at: "2026-07-01T12:00:00.000Z",
      follow_up_at: "2026-07-13T12:00:00.000Z",
    }),
    lead({
      id: "first-old",
      name: "Old Request",
      created_at: "2026-07-01T12:00:00.000Z",
    }),
    lead({ id: "invalid", name: "Invalid Request", message: "not a valid request" }),
    lead({ id: "terminal", name: "Closed Request", status: "closed" }),
    lead({ id: "unrelated", source: "landing", message: "general contact" }),
  ];
}

describe("lead conversion queue rules", () => {
  it("ranks due follow-ups, untouched requests, and scheduled follow-ups in execution order", () => {
    const queue = buildLeadConversionQueue(fixture(), { now: NOW });

    expect(queue).toMatchObject({
      focus: "all",
      paidInterestRequests: 6,
      readyNow: 3,
      firstContacts: 2,
      followUpsDue: 1,
      scheduledLater: 1,
      needsDataReview: 1,
      terminalRequests: 1,
    });
    expect(queue.items.map((item) => item.leadId)).toEqual([
      "due",
      "first-old",
      "first-new",
      "scheduled",
    ]);
    expect(queue.items[0]).toMatchObject({
      kind: "follow_up",
      readiness: "ready_now",
      planId: "pro_monthly",
    });
    expect(queue.items[1].ageDays).toBe(13);
  });

  it("treats the exact due boundary as ready and preserves future follow-ups as scheduled", () => {
    const queue = buildLeadConversionQueue(
      [
        lead({ id: "exact", status: "follow_up", follow_up_at: new Date(NOW).toISOString() }),
        lead({
          id: "future",
          status: "follow_up",
          follow_up_at: new Date(NOW + 1).toISOString(),
        }),
      ],
      { now: NOW },
    );

    expect(queue.items.map(({ leadId, readiness }) => ({ leadId, readiness }))).toEqual([
      { leadId: "exact", readiness: "ready_now" },
      { leadId: "future", readiness: "scheduled" },
    ]);
  });

  it("filters by requested worklist focus without changing aggregate truth", () => {
    const first = buildLeadConversionQueue(fixture(), { now: NOW, focus: "first_contact" });
    const followUp = buildLeadConversionQueue(fixture(), { now: NOW, focus: "follow_up" });

    expect(first.items.map((item) => item.leadId)).toEqual(["first-old", "first-new"]);
    expect(followUp.items.map((item) => item.leadId)).toEqual(["due", "scheduled"]);
    expect(first.readyNow).toBe(followUp.readyNow);
    expect(first.paidInterestRequests).toBe(followUp.paidInterestRequests);
  });

  it("fails unknown query values closed to the complete queue and is deterministic", () => {
    expect(resolveLeadConversionQueueFocus("first_contact")).toBe("first_contact");
    expect(resolveLeadConversionQueueFocus("follow_up")).toBe("follow_up");
    expect(resolveLeadConversionQueueFocus("send_everything")).toBe("all");
    expect(resolveLeadConversionQueueFocus(null)).toBe("all");

    const first = buildLeadConversionQueue(fixture(), { now: NOW });
    const second = buildLeadConversionQueue(fixture(), { now: NOW });
    expect(second).toEqual(first);
    expect(JSON.stringify(first)).not.toMatch(/mailto:|subject|email body/i);
  });

  it("updates worklist focus without mutating or dropping unrelated query values", () => {
    const source = new URLSearchParams("source=landing&conversion=follow_up&tag=first&tag=second");

    const firstContact = buildLeadConversionQueueSearchParams(source, "first_contact");
    const all = buildLeadConversionQueueSearchParams(source, "all");

    expect(firstContact.get("conversion")).toBe("first_contact");
    expect(firstContact.get("source")).toBe("landing");
    expect(firstContact.getAll("tag")).toEqual(["first", "second"]);
    expect(all.has("conversion")).toBe(false);
    expect(all.getAll("tag")).toEqual(["first", "second"]);
    expect(source.get("conversion")).toBe("follow_up");
    expect(buildLeadConversionQueueSearchParams(source, "first_contact").toString()).toBe(
      firstContact.toString(),
    );
  });
});

describe("lead conversion queue presenter", () => {
  it("shows the ranked worklist, opens only the selected lead, and changes focus explicitly", () => {
    const onSelectLead = vi.fn();
    const onFocusChange = vi.fn();
    render(
      <LeadConversionQueuePanel
        leads={fixture()}
        focus="all"
        onFocusChange={onFocusChange}
        onSelectLead={onSelectLead}
        now={NOW}
      />,
    );

    expect(screen.getByText("Checkout conversion worklist")).toBeInTheDocument();
    expect(screen.getByText("Nothing is sent or logged automatically.")).toBeInTheDocument();
    expect(screen.getAllByTestId("lead-conversion-queue-item")).toHaveLength(4);
    expect(
      within(screen.getAllByTestId("lead-conversion-queue-item")[0]).getByText("Due Follow-up"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Open reviewed draft" })[0]);
    expect(onSelectLead).toHaveBeenCalledWith("due");
    expect(onSelectLead).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "First contact" }));
    expect(onFocusChange).toHaveBeenCalledWith("first_contact");
  });

  it("renders a calm empty state for an empty or non-matching focus", () => {
    render(
      <LeadConversionQueuePanel
        leads={[lead({ status: "closed" })]}
        focus="first_contact"
        onFocusChange={vi.fn()}
        onSelectLead={vi.fn()}
        now={NOW}
      />,
    );

    expect(screen.getByTestId("lead-conversion-queue-empty")).toHaveTextContent(
      "No eligible checkout requests",
    );
  });
});

describe("lead conversion queue wiring and safety", () => {
  const rules = readFileSync(resolve(process.cwd(), "src/lib/leadConversionQueueRules.ts"), "utf8");
  const panel = readFileSync(
    resolve(process.cwd(), "src/components/LeadConversionQueuePanel.tsx"),
    "utf8",
  );
  const page = readFileSync(resolve(process.cwd(), "src/pages/Leads.tsx"), "utf8");
  const sprint = readFileSync(
    resolve(process.cwd(), "src/lib/subscriberGrowthSprintRules.ts"),
    "utf8",
  );

  it("mounts the worklist and deep-links sprint actions into the right focus", () => {
    expect(page).toContain("<LeadConversionQueuePanel");
    expect(page).toContain('searchParams.get("conversion")');
    expect(sprint).toContain("/admin/leads?conversion=follow_up");
    expect(sprint).toContain("/admin/leads?conversion=first_contact");
  });

  it.each([
    ["rules", rules],
    ["panel", panel],
  ])("keeps %s free of outbound and persistence side effects", (_name, source) => {
    expect(source).not.toMatch(
      /fetch\(|supabase|service_role|send[-_ ]?email|webhook|twilio|resend/i,
    );
    expect(source).not.toMatch(/navigator\.clipboard|mailto:/i);
  });
});
