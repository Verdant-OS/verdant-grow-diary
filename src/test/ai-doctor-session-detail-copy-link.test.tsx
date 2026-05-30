/**
 * Tests for the "Copy link" button on the AI Doctor session detail page.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import AiDoctorSessionDetail, {
  buildSessionDetailCanonicalUrl,
} from "@/pages/AiDoctorSessionDetail";
import type { AiDoctorSessionRow } from "@/hooks/use-ai-doctor-sessions";

function makeRow(): AiDoctorSessionRow {
  return {
    id: "sess-link",
    created_at: "2026-05-28T10:00:00Z",
    plant_id: "p1",
    tent_id: "t1",
    grow_id: "g1",
    question: "Why are leaves curling?",
    diagnosis: null,
    raw_confidence: null,
    displayed_confidence: null,
    context_confidence_ceiling: null,
    suggested_actions: [],
  };
}

let currentRow: AiDoctorSessionRow | null = makeRow();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }),
          maybeSingle: () => Promise.resolve({ data: currentRow, error: null }),
        }),
      }),
    }),
  },
}));

function renderRoute(element: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/doctor/sessions/sess-link?foo=bar&utm_source=x"]}>
        <Routes>
          <Route path="/doctor/sessions/:sessionId" element={element} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("buildSessionDetailCanonicalUrl — pure helper", () => {
  it("returns canonical path when no origin provided", () => {
    expect(buildSessionDetailCanonicalUrl("sess-1")).toBe("/doctor/sessions/sess-1");
  });
  it("prefixes origin and strips trailing slashes", () => {
    expect(buildSessionDetailCanonicalUrl("sess-1", "https://app.example.com/")).toBe(
      "https://app.example.com/doctor/sessions/sess-1",
    );
  });
  it("does not include unrelated query params", () => {
    const url = buildSessionDetailCanonicalUrl("sess-1", "https://app.example.com");
    expect(url).not.toMatch(/[?&](foo|utm_source|utm_medium)=/);
  });
});

describe("AiDoctorSessionDetail — Copy link button", () => {
  beforeEach(() => {
    currentRow = makeRow();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the copy link button", async () => {
    renderRoute(<AiDoctorSessionDetail />);
    expect(
      await screen.findByTestId("ai-doctor-session-detail-copy-link-button"),
    ).toBeTruthy();
  });

  it("uses Clipboard API and copies canonical URL without unrelated params", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(global.navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    renderRoute(<AiDoctorSessionDetail />);
    const btn = await screen.findByTestId("ai-doctor-session-detail-copy-link-button");
    fireEvent.click(btn);
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledTimes(1);
    });
    const copied = writeText.mock.calls[0][0] as string;
    expect(copied).toMatch(/\/doctor\/sessions\/sess-link$/);
    expect(copied).not.toMatch(/foo=bar|utm_source/);
    expect(
      await screen.findByTestId("ai-doctor-session-detail-copy-link-success"),
    ).toBeTruthy();
  });

  it("falls back to execCommand when clipboard is unavailable", async () => {
    Object.defineProperty(global.navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });
    const execSpy = vi.fn().mockReturnValue(true);
    (document as unknown as { execCommand: unknown }).execCommand = execSpy;
    renderRoute(<AiDoctorSessionDetail />);
    const btn = await screen.findByTestId("ai-doctor-session-detail-copy-link-button");
    fireEvent.click(btn);
    await waitFor(() => {
      expect(execSpy).toHaveBeenCalledWith("copy");
    });
    expect(
      await screen.findByTestId("ai-doctor-session-detail-copy-link-success"),
    ).toBeTruthy();
  });

  it("shows error state when copy fails", async () => {
    Object.defineProperty(global.navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
    });
    (document as unknown as { execCommand: unknown }).execCommand = vi
      .fn()
      .mockReturnValue(false);
    renderRoute(<AiDoctorSessionDetail />);
    const btn = await screen.findByTestId("ai-doctor-session-detail-copy-link-button");
    fireEvent.click(btn);
    expect(
      await screen.findByTestId("ai-doctor-session-detail-copy-link-error"),
    ).toBeTruthy();
  });
});

describe("Copy link — safety scan", () => {
  const ROOT = resolve(__dirname, "../..");
  const PAGE = readFileSync(resolve(ROOT, "src/pages/AiDoctorSessionDetail.tsx"), "utf8");

  it("no DB writes, AI invocations, or action_queue/alerts writes", () => {
    expect(PAGE).not.toMatch(/\.insert\(/);
    expect(PAGE).not.toMatch(/\.update\(/);
    expect(PAGE).not.toMatch(/\.delete\(/);
    expect(PAGE).not.toMatch(/\.upsert\(/);
    expect(PAGE).not.toMatch(/functions\.invoke/);
    expect(PAGE).not.toMatch(/ai-coach/);
    const lower = PAGE.toLowerCase();
    expect(lower).not.toContain("service_role");
    expect(lower).not.toContain("action_queue");
    expect(lower).not.toContain("alert_events");
    for (const tok of [
      "mqtt",
      "auto-execute",
      "actuate",
      "device.command",
      "relay.on",
      "relay.off",
      "home-assistant",
      "home_assistant",
      "smart plug",
    ]) {
      expect(lower).not.toContain(tok);
    }
  });
});
