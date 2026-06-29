// Sidebar must not advertise any XLSX / spreadsheet import entry.
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SidebarProvider } from "@/components/ui/sidebar";
import AppSidebar from "@/components/AppSidebar";

describe("AppSidebar — no XLSX import link", () => {
  it("renders no link mentioning XLSX, Spreadsheet, or Genetics Import", () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { container } = render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <SidebarProvider>
            <AppSidebar />
          </SidebarProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/XLSX/i);
    expect(text).not.toMatch(/Spreadsheet/i);
    expect(text).not.toMatch(/Genetics\s+Import/i);
    const links = Array.from(container.querySelectorAll("a"));
    for (const a of links) {
      expect(a.getAttribute("href") ?? "").not.toMatch(
        /\/operator\/genetics-import|\/imports\/representative-csv|\/sensors\/csv-preview|\/partners\/csv-preview/,
      );
    }
  });
});
