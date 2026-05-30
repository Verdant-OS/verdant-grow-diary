/**
 * Copy Link button on /doctor/sessions.
 *
 * Covers:
 *   - Button renders.
 *   - Copies current URL with risk / has-actions / date range / page params.
 *   - Cleared filters yield a clean URL.
 *   - Unrelated URL params are preserved.
 *   - Success state after async clipboard resolves.
 *   - Failure state when clipboard rejects.
 *   - Fallback path when navigator.clipboard is unavailable.
 *   - Static safety: no writes, no AI invocation, no device strings.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fireEvent, render, screen, waitFor, act } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// supabase noop mock
const rangeSpy = vi.fn(() => Promise.resolve({ data: [], error: null }));
const orderSpy = vi.fn(() => ({ range: rangeSpy }));
const chain: any = {
  eq: vi.fn(function () { return chain; }),
  not: vi.fn(function () { return chain; }),
  gte: vi.fn(function () { return chain; }),
  order: orderSpy,
};
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ select: () => chain }) },
}));

import AiDoctorSessionsIndex from "@/pages/AiDoctorSessionsIndex";
import { buildShareUrl } from "@/lib/aiDoctorSessionsShareLinkRules";

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
const PAGE = read("src/pages/AiDoctorSessionsIndex.tsx");
const HELPERS = read("src/lib/aiDoctorSessionsShareLinkRules.ts");

function renderAt(initialEntry: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/doctor/sessions" element={<AiDoctorSessionsIndex />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

let writeTextSpy: ReturnType<typeof vi.fn>;
let originalClipboard: PropertyDescriptor | undefined;

function setClipboard(impl: ((text: string) => Promise<void>) | null) {
  originalClipboard = Object.getOwnPropertyDescriptor(window.navigator, "clipboard");
  if (impl === null) {
    Object.defineProperty(window.navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });
    return;
  }
  writeTextSpy = vi.fn(impl);
  Object.defineProperty(window.navigator, "clipboard", {
    configurable: true,
    value: { writeText: writeTextSpy },
  });
}

function setLocation(search: string) {
  // jsdom: rewrite location via history so window.location.search updates.
  window.history.replaceState({}, "", `/doctor/sessions${search}`);
}

beforeEach(() => {
  setLocation("");
});

afterEach(() => {
  if (originalClipboard) {
    Object.defineProperty(window.navigator, "clipboard", originalClipboard);
  }
  originalClipboard = undefined;
});

describe("buildShareUrl", () => {
  it("joins origin + pathname + search and prepends ? when missing", () => {
    expect(buildShareUrl("https://x.com", "/doctor/sessions", "risk=high")).toBe(
      "https://x.com/doctor/sessions?risk=high",
    );
    expect(buildShareUrl("https://x.com", "/doctor/sessions", "?risk=high")).toBe(
      "https://x.com/doctor/sessions?risk=high",
    );
    expect(buildShareUrl("https://x.com", "/doctor/sessions", "")).toBe(
      "https://x.com/doctor/sessions",
    );
  });
});

describe("Copy link button — render", () => {
  it("renders on /doctor/sessions", async () => {
    setClipboard(async () => {});
    renderAt("/doctor/sessions");
    expect(await screen.findByTestId("ai-doctor-sessions-index-copy-link")).toBeInTheDocument();
  });
});

describe("Copy link button — clipboard content", () => {
  it("copies current URL with risk filter", async () => {
    setClipboard(async () => {});
    setLocation("?risk=high");
    renderAt("/doctor/sessions?risk=high");
    fireEvent.click(await screen.findByTestId("ai-doctor-sessions-index-copy-link"));
    await waitFor(() => expect(writeTextSpy).toHaveBeenCalledTimes(1));
    expect(writeTextSpy.mock.calls[0][0]).toContain("/doctor/sessions?risk=high");
  });

  it("copies URL with hasActions and dateRange params", async () => {
    setClipboard(async () => {});
    setLocation("?hasActions=yes&dateRange=7d");
    renderAt("/doctor/sessions?hasActions=yes&dateRange=7d");
    fireEvent.click(await screen.findByTestId("ai-doctor-sessions-index-copy-link"));
    await waitFor(() => expect(writeTextSpy).toHaveBeenCalledTimes(1));
    const copied = writeTextSpy.mock.calls[0][0] as string;
    expect(copied).toContain("hasActions=yes");
    expect(copied).toContain("dateRange=7d");
  });

  it("copies URL with 1-based page param", async () => {
    setClipboard(async () => {});
    setLocation("?page=3");
    renderAt("/doctor/sessions?page=3");
    fireEvent.click(await screen.findByTestId("ai-doctor-sessions-index-copy-link"));
    await waitFor(() => expect(writeTextSpy).toHaveBeenCalledTimes(1));
    expect(writeTextSpy.mock.calls[0][0]).toContain("page=3");
  });

  it("reflects cleared filters in copied URL", async () => {
    setClipboard(async () => {});
    setLocation("?risk=high");
    renderAt("/doctor/sessions?risk=high");
    // Simulate user clearing filters — URL drops the filter params.
    setLocation("");
    fireEvent.click(await screen.findByTestId("ai-doctor-sessions-index-copy-link"));
    await waitFor(() => expect(writeTextSpy).toHaveBeenCalledTimes(1));
    const copied = writeTextSpy.mock.calls[0][0] as string;
    expect(copied).toContain("/doctor/sessions");
    expect(copied).not.toContain("risk=");
  });

  it("preserves unrelated URL params", async () => {
    setClipboard(async () => {});
    setLocation("?risk=low&ref=email&utm=demo");
    renderAt("/doctor/sessions?risk=low&ref=email&utm=demo");
    fireEvent.click(await screen.findByTestId("ai-doctor-sessions-index-copy-link"));
    await waitFor(() => expect(writeTextSpy).toHaveBeenCalledTimes(1));
    const copied = writeTextSpy.mock.calls[0][0] as string;
    expect(copied).toContain("ref=email");
    expect(copied).toContain("utm=demo");
    expect(copied).toContain("risk=low");
  });
});

describe("Copy link button — states", () => {
  it("shows success state after clipboard resolves", async () => {
    setClipboard(async () => {});
    renderAt("/doctor/sessions");
    fireEvent.click(await screen.findByTestId("ai-doctor-sessions-index-copy-link"));
    expect(
      await screen.findByTestId("ai-doctor-sessions-index-copy-link-success"),
    ).toBeInTheDocument();
  });

  it("shows error state when clipboard rejects", async () => {
    setClipboard(async () => {
      throw new Error("denied");
    });
    renderAt("/doctor/sessions");
    fireEvent.click(await screen.findByTestId("ai-doctor-sessions-index-copy-link"));
    expect(
      await screen.findByTestId("ai-doctor-sessions-index-copy-link-error"),
    ).toBeInTheDocument();
  });

  it("falls back to execCommand when navigator.clipboard is unavailable", async () => {
    setClipboard(null);
    const execSpy = vi.fn(() => true);
    const originalExec = document.execCommand;
    document.execCommand = execSpy as unknown as typeof document.execCommand;
    try {
      renderAt("/doctor/sessions");
      fireEvent.click(await screen.findByTestId("ai-doctor-sessions-index-copy-link"));
      expect(
        await screen.findByTestId("ai-doctor-sessions-index-copy-link-success"),
      ).toBeInTheDocument();
      expect(execSpy).toHaveBeenCalledWith("copy");
    } finally {
      document.execCommand = originalExec;
    }
  });
});

describe("Copy link — static safety", () => {
  it("no writes, no functions.invoke, no device-control strings", () => {
    const sources = [PAGE, HELPERS];
    const forbidden = [
      ".insert(",
      ".update(",
      ".delete(",
      ".upsert(",
      "functions.invoke",
      "action_queue",
      "alerts",
      "service_role",
      "mqtt",
      "MQTT",
      "relay",
    ];
    for (const src of sources) {
      for (const term of forbidden) {
        expect(src).not.toContain(term);
      }
    }
  });
});
