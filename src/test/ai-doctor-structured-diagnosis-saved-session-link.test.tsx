/**
 * StructuredDiagnosisCard — "View saved AI Doctor session" link.
 *
 * Read-only navigation affordance. Surfaces a link to the persisted session
 * detail page only when an aiDoctorSessionId is supplied.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import StructuredDiagnosisCard from "@/components/StructuredDiagnosisCard";
import { aiDoctorSessionDetailPath } from "@/lib/routes";
import type { Diagnosis } from "@/lib/aiDoctorDiagnosisRules";

const SESSION_ID = "sess-saved-link-1";
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

describe("StructuredDiagnosisCard — saved session link", () => {
  it("renders the link with the route helper href when a session id is provided", () => {
    renderCard({ sessionId: SESSION_ID });
    const link = screen.getByTestId(
      "coach-ai-doctor-diagnosis-saved-session-link",
    ) as HTMLAnchorElement;
    expect(link.textContent).toContain("View saved AI Doctor session");
    expect(link.getAttribute("href")).toBe(aiDoctorSessionDetailPath(SESSION_ID));
  });

  it("does not render the link when no session id is provided", () => {
    renderCard({ sessionId: null });
    expect(
      screen.queryByTestId("coach-ai-doctor-diagnosis-saved-session-link"),
    ).toBeNull();
  });

  it("preserves the Add to Action Queue button", () => {
    renderCard({ sessionId: SESSION_ID });
    expect(
      screen.getByTestId(
        "coach-ai-doctor-diagnosis-suggested-action-0-add-button",
      ),
    ).toBeTruthy();
  });

  it("preserves the 'Created from this session' chip behavior", async () => {
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
        "coach-ai-doctor-diagnosis-suggested-action-0-created-from-session-chip",
      ),
    ).toBeTruthy();
  });

  it("does not leak [session:<id>] tokens or target_device into the link", () => {
    renderCard({ sessionId: SESSION_ID });
    const link = screen.getByTestId(
      "coach-ai-doctor-diagnosis-saved-session-link",
    );
    const text = (link.textContent ?? "").toLowerCase();
    expect(text).not.toContain("[session:");
    expect(text).not.toContain("target_device");
  });

  it("copy does not imply automation, execution, or device control", () => {
    renderCard({ sessionId: SESSION_ID });
    const link = screen.getByTestId(
      "coach-ai-doctor-diagnosis-saved-session-link",
    );
    const lower = (link.textContent ?? "").toLowerCase();
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

describe("StructuredDiagnosisCard — static safety (saved session link)", () => {
  it("does not import the Supabase client", () => {
    expect(CARD).not.toMatch(/from\s+["']@\/integrations\/supabase\/client["']/);
  });

  it("introduces no DB write or RPC paths", () => {
    expect(CARD).not.toMatch(/\.from\(\s*["']/);
    expect(CARD).not.toMatch(/\.insert\(/);
    expect(CARD).not.toMatch(/\.update\(/);
    // Match Supabase-style chained .delete() (no args), not Set#delete(x).
    expect(CARD).not.toMatch(/\.delete\(\s*\)/);
    expect(CARD).not.toMatch(/\.upsert\(/);
    expect(CARD).not.toMatch(/\.rpc\(/);
    expect(CARD).not.toMatch(/functions\.invoke/);
    expect(CARD.toLowerCase()).not.toContain("service_role");
  });

  it("uses the aiDoctorSessionDetailPath route helper (no hardcoded path)", () => {
    expect(CARD).toMatch(/aiDoctorSessionDetailPath\(aiDoctorSessionId\)/);
    expect(CARD).not.toMatch(/to=["']\/doctor\/sessions\//);
  });
});
