/**
 * AI Doctor Coach in-flight panel — "Created from this session" chip beside
 * each suggestion that already has a linked open Action Queue item.
 *
 * Read-only UI polish. Reuses `useAiDoctorSessionLinkedActionQueueItems` and
 * the pure `findLinkedActionForSuggestion` helper via StructuredDiagnosisCard.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import StructuredDiagnosisCard from "@/components/StructuredDiagnosisCard";
import type { Diagnosis } from "@/lib/aiDoctorDiagnosisRules";

const SESSION_ID = "sess-coach-chip-1";
let linkedRows: Array<Record<string, unknown>> = [];

vi.mock("@/integrations/supabase/client", () => {
  const actionQueueBuilder = () => {
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      in: () => chain,
      like: () => chain,
      order: () => chain,
      limit: () => Promise.resolve({ data: linkedRows, error: null }),
    };
    return chain;
  };
  return {
    supabase: {
      from: (table: string) =>
        table === "action_queue"
          ? actionQueueBuilder()
          : { select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) },
      rpc: () => Promise.resolve({ data: null, error: null }),
      functions: { invoke: () => Promise.resolve({ data: null, error: null }) },
    },
  };
});

function makeDiagnosis(): Diagnosis {
  return {
    summary: "Mild stress.",
    likelyIssue: "Heat stress",
    confidence: 0.7,
    evidence: ["tip curl"],
    missingInformation: [],
    possibleCauses: [],
    immediateAction: "Raise light.",
    whatNotToDo: [],
    followUp24h: { summary: "Recheck.", checklist: [] },
    recoveryPlan3d: { summary: "Stabilize.", checklist: [] },
    riskLevel: "medium",
    suggestedActions: [
      {
        type: "task",
        title: "Raise light",
        detail: "Raise the light by 10 cm.",
        priority: "medium",
        reason: "Reduce radiant load.",
        approvalRequired: true,
      },
      {
        type: "task",
        title: "Add oscillating fan",
        detail: "Improve canopy airflow.",
        priority: "low",
        reason: "Even out temperature.",
        approvalRequired: true,
      },
    ],
  };
}

function renderCard(opts: { sessionId?: string | null } = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <StructuredDiagnosisCard
          diagnosis={makeDiagnosis()}
          aiDoctorSessionId={opts.sessionId ?? undefined}
          onAddToQueue={() => Promise.resolve()}
          testId="coach-ai-doctor-diagnosis"
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  linkedRows = [];
});

describe("Coach in-flight panel — Created from this session chip", () => {
  it("shows the chip beside a linked suggestion", async () => {
    linkedRows = [
      {
        id: "aq-light",
        status: "pending_approval",
        source: "ai_doctor",
        reason: `Raise light. [session:${SESSION_ID}]`,
        suggested_change: "Raise light: Raise the light by 10 cm.",
      },
    ];
    renderCard({ sessionId: SESSION_ID });
    const chip = await screen.findByTestId(
      "coach-ai-doctor-diagnosis-suggested-action-0-created-from-session-chip",
    );
    expect(chip.textContent).toContain("Created from this session");
  });

  it("renders 'View in Action Queue' link with /actions?focus=<id>", async () => {
    linkedRows = [
      {
        id: "aq-light",
        status: "pending_approval",
        source: "ai_doctor",
        reason: `Raise light. [session:${SESSION_ID}]`,
        suggested_change: "Raise light: Raise the light by 10 cm.",
      },
    ];
    renderCard({ sessionId: SESSION_ID });
    const link = (await screen.findByTestId(
      "coach-ai-doctor-diagnosis-suggested-action-0-created-from-session-link",
    )) as HTMLAnchorElement;
    expect(link.textContent).toContain("View in Action Queue");
    expect(link.getAttribute("href")).toBe("/actions?focus=aq-light");
  });

  it("only marks the matched suggestion when multiple exist", async () => {
    linkedRows = [
      {
        id: "aq-fan",
        status: "pending_approval",
        source: "ai_doctor",
        reason: `Add oscillating fan. [session:${SESSION_ID}]`,
        suggested_change: "Add oscillating fan: Improve canopy airflow.",
      },
    ];
    renderCard({ sessionId: SESSION_ID });
    await waitFor(() => {
      expect(
        screen.queryByTestId(
          "coach-ai-doctor-diagnosis-suggested-action-1-created-from-session",
        ),
      ).not.toBeNull();
    });
    expect(
      screen.queryByTestId(
        "coach-ai-doctor-diagnosis-suggested-action-0-created-from-session",
      ),
    ).toBeNull();
  });

  it("does not render the chip when no linked item exists", async () => {
    linkedRows = [];
    renderCard({ sessionId: SESSION_ID });
    await screen.findByTestId("coach-ai-doctor-diagnosis-suggested-action-0");
    await waitFor(() => {
      expect(
        screen.queryByTestId(
          "coach-ai-doctor-diagnosis-suggested-action-0-created-from-session-chip",
        ),
      ).toBeNull();
    });
  });

  it("preserves the existing Add to Action Queue button", async () => {
    linkedRows = [
      {
        id: "aq-light",
        status: "pending_approval",
        source: "ai_doctor",
        reason: `Raise light. [session:${SESSION_ID}]`,
        suggested_change: "Raise light: Raise the light by 10 cm.",
      },
    ];
    renderCard({ sessionId: SESSION_ID });
    expect(
      await screen.findByTestId(
        "coach-ai-doctor-diagnosis-suggested-action-0-add-button",
      ),
    ).toBeTruthy();
  });

  it("renders no chip and does not crash when no session id is provided", async () => {
    linkedRows = [
      {
        id: "aq-light",
        status: "pending_approval",
        source: "ai_doctor",
        reason: `Raise light. [session:${SESSION_ID}]`,
        suggested_change: "Raise light: Raise the light by 10 cm.",
      },
    ];
    renderCard({ sessionId: null });
    await screen.findByTestId("coach-ai-doctor-diagnosis-suggested-action-0");
    expect(
      screen.queryByTestId(
        "coach-ai-doctor-diagnosis-suggested-action-0-created-from-session-chip",
      ),
    ).toBeNull();
  });

  it("never leaks [session:<id>] token or target_device", async () => {
    linkedRows = [
      {
        id: "aq-light",
        status: "pending_approval",
        source: "ai_doctor",
        reason: `Raise light. [session:${SESSION_ID}]`,
        suggested_change: "Raise light: Raise the light by 10 cm.",
      },
    ];
    renderCard({ sessionId: SESSION_ID });
    const marked = await screen.findByTestId(
      "coach-ai-doctor-diagnosis-suggested-action-0-created-from-session",
    );
    const text = (marked.textContent ?? "").toLowerCase();
    expect(text).not.toContain("[session:");
    expect(text).not.toContain("target_device");
  });

  it("chip copy does not imply automation, execution, or device control", async () => {
    linkedRows = [
      {
        id: "aq-light",
        status: "pending_approval",
        source: "ai_doctor",
        reason: `Raise light. [session:${SESSION_ID}]`,
        suggested_change: "Raise light: Raise the light by 10 cm.",
      },
    ];
    renderCard({ sessionId: SESSION_ID });
    const marked = await screen.findByTestId(
      "coach-ai-doctor-diagnosis-suggested-action-0-created-from-session",
    );
    const lower = (marked.textContent ?? "").toLowerCase();
    for (const tok of [
      "automate",
      "auto-execute",
      "actuate",
      "turn on",
      "turn off",
      "mqtt",
      "relay",
      "approve",
      "complete",
      "reject",
      "execute",
    ]) {
      expect(lower).not.toContain(tok);
    }
  });
});

// --- Static safety scan ------------------------------------------------------
const ROOT = resolve(__dirname, "../..");
const CARD = readFileSync(
  resolve(ROOT, "src/components/StructuredDiagnosisCard.tsx"),
  "utf8",
);
const COACH = readFileSync(resolve(ROOT, "src/pages/Coach.tsx"), "utf8");

describe("Coach chip — static safety", () => {
  it("StructuredDiagnosisCard introduces no write paths", () => {
    // The card itself must not touch the DB client directly. All writes
    // belong to the parent (Coach page) via the onAddToQueue callback.
    expect(CARD).not.toMatch(/from\(["']action_queue["']\)/);
    expect(CARD).not.toMatch(/supabase\./);
    expect(CARD).not.toMatch(/\.rpc\(/);
    expect(CARD).not.toMatch(/functions\.invoke/);
    expect(CARD.toLowerCase()).not.toContain("service_role");
  });

  it("Coach page is not modified to add new action_queue write chains for the chip", () => {
    // Existing legitimate inserts (Add to Action Queue) remain, but no new
    // automation / device control markers should appear alongside the chip.
    const lower = COACH.toLowerCase();
    for (const tok of [
      "auto-execute",
      "actuate",
      "device.command",
      "relay.on",
      "relay.off",
      "home_assistant",
      "home-assistant",
    ]) {
      expect(lower).not.toContain(tok);
    }
  });
});
