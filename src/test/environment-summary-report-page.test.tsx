import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import EnvironmentSummaryReportPage from "@/pages/EnvironmentSummaryReportPage";

vi.mock("@/integrations/supabase/client", () => {
  const writeMethods = new Set(["insert", "update", "delete", "upsert", "rpc"]);
  const proxy: any = new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === "from") {
          return () =>
            new Proxy(
              {},
              {
                get(_t2, p2: string) {
                  if (writeMethods.has(p2)) {
                    throw new Error(`Forbidden Supabase write: ${p2}`);
                  }
                  if (p2 === "select")
                    return () => ({
                      order: () => Promise.resolve({ data: [], error: null }),
                    });
                  return () => proxy;
                },
              },
            );
        }
        if (writeMethods.has(prop)) {
          throw new Error(`Forbidden Supabase write: ${prop}`);
        }
        if (prop === "functions") {
          return {
            invoke: () => {
              throw new Error("Forbidden functions.invoke");
            },
          };
        }
        if (prop === "auth")
          return { getUser: () => Promise.resolve({ data: { user: null } }) };
        return () => proxy;
      },
    },
  );
  return { supabase: proxy };
});


function renderAt(path: string) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route
            path="/diary/environment-summary"
            element={<EnvironmentSummaryReportPage />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("EnvironmentSummaryReportPage", () => {
  it("renders without crashing using default last-7-day range", () => {
    renderAt("/diary/environment-summary");
    expect(screen.getByTestId("environment-summary-report-page")).toBeTruthy();
    expect(screen.getByTestId("env-report-start-date")).toBeTruthy();
    expect(screen.getByTestId("env-report-end-date")).toBeTruthy();
  });

  it("respects query params for start/end", () => {
    renderAt("/diary/environment-summary?start=2026-06-01&end=2026-06-07");
    const start = screen.getByTestId("env-report-start-date") as HTMLInputElement;
    const end = screen.getByTestId("env-report-end-date") as HTMLInputElement;
    expect(start.value).toBe("2026-06-01");
    expect(end.value).toBe("2026-06-07");
  });

  it("shows safe validation message for invalid ranges", () => {
    renderAt("/diary/environment-summary?start=2026-06-10&end=2026-06-01");
    expect(screen.getByTestId("env-report-range-error")).toBeTruthy();
  });

  it("download button has accessible label and deterministic filename", () => {
    renderAt("/diary/environment-summary?start=2026-06-01&end=2026-06-07");
    const btn = screen.getByTestId("env-report-download-pdf");
    expect(btn.getAttribute("aria-label")).toBe(
      "Download environment summary report PDF",
    );
    expect(btn.getAttribute("data-filename")).toBe(
      "verdant-environment-summary-2026-06-01-to-2026-06-07.pdf",
    );
  });

  it("does not include device-control copy", () => {
    const { container } = renderAt("/diary/environment-summary");
    const txt = container.textContent ?? "";
    expect(txt).not.toMatch(/apply fix|send command|auto[- ]adjust|execute/i);
    expect(txt).toMatch(/Read-only report/);
  });
});
