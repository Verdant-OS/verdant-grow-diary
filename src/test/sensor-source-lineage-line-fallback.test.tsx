/**
 * Fallback / safe-display tests for SensorSourceLineageLine.
 *
 * These tests prove that unknown source / unknown vendor strings render
 * as safe plain text fallbacks and never imply "Live", auth, or
 * ownership. The component must also never leak bridge tokens, raw
 * payloads, or internal IDs.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import SensorSourceLineageLine from "@/components/SensorSourceLineageLine";

const FORBIDDEN_LEAK_SUBSTRINGS = [
  "vbt_",
  "Bearer ",
  "service_role",
  "raw_payload",
  "user_id",
  "auth.uid",
];

function assertNoLeaks(text: string) {
  for (const needle of FORBIDDEN_LEAK_SUBSTRINGS) {
    expect(text).not.toContain(needle);
  }
}

describe("SensorSourceLineageLine — fallback safety", () => {
  it("unknown source renders verbatim as safe plain text fallback", () => {
    render(<SensorSourceLineageLine source="future-transport-xyz" />);
    const root = screen.getByTestId("sensor-source-lineage");
    expect(screen.getByTestId("sensor-source-lineage-source").textContent).toBe(
      "future-transport-xyz",
    );
    // Unknown source must not be implicitly promoted to Live.
    expect(root.textContent).not.toContain("Live");
  });

  it("unknown vendor renders verbatim as lineage-only fallback", () => {
    render(<SensorSourceLineageLine source="mqtt" vendor="future-brand-9000" />);
    const vendor = screen.getByTestId("sensor-source-lineage-vendor");
    expect(vendor.textContent).toBe("future-brand-9000");
    expect(vendor.getAttribute("title")?.toLowerCase()).toContain(
      "never used for auth",
    );
  });

  it("unknown source + known vendor never implies Live", () => {
    render(
      <SensorSourceLineageLine source="random-thing" vendor="ecowitt" />,
    );
    const root = screen.getByTestId("sensor-source-lineage");
    expect(root.textContent).not.toContain("Live");
    // Source label preserved verbatim, vendor label normalized.
    expect(screen.getByTestId("sensor-source-lineage-source").textContent).toBe(
      "random-thing",
    );
    expect(screen.getByTestId("sensor-source-lineage-vendor").textContent).toBe(
      "EcoWitt",
    );
  });

  it("known source + unknown vendor never implies auth/ownership", () => {
    render(
      <SensorSourceLineageLine source="webhook" vendor="mystery-vendor" />,
    );
    const root = screen.getByTestId("sensor-source-lineage");
    const html = root.outerHTML;
    // No auth/ownership-implying language anywhere in the rendered tree.
    expect(html.toLowerCase()).not.toContain("verified");
    expect(html.toLowerCase()).not.toContain("trusted");
    expect(html.toLowerCase()).not.toContain("owner");
    // Vendor must still be marked lineage-only via title hint.
    expect(
      screen.getByTestId("sensor-source-lineage-vendor").getAttribute("title")
        ?.toLowerCase(),
    ).toContain("never used for auth");
  });

  it("no bridge tokens, raw payloads, auth strings, or internal IDs are rendered", () => {
    render(
      <SensorSourceLineageLine
        source="mqtt"
        vendor="ecowitt"
      />,
    );
    const text = screen.getByTestId("sensor-source-lineage").outerHTML;
    assertNoLeaks(text);
  });

  it.each(["manual", "csv", "demo", "stale", "invalid", "import"] as const)(
    "%s never renders as Live, even with known vendor",
    (src) => {
      render(<SensorSourceLineageLine source={src} vendor="ecowitt" />);
      const root = screen.getByTestId("sensor-source-lineage");
      expect(root.getAttribute("data-non-live")).toBe("true");
      expect(root.textContent).not.toContain("Live");
    },
  );

  it("empty / null source falls back to 'Unknown' safely", () => {
    render(<SensorSourceLineageLine source={null} vendor={null} />);
    expect(screen.getByTestId("sensor-source-lineage-source").textContent).toBe(
      "Unknown",
    );
    expect(screen.queryByTestId("sensor-source-lineage-vendor")).toBeNull();
  });
});
