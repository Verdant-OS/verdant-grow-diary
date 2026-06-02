/**
 * Tests for SensorSourceBadge — the canonical source+status presenter.
 *
 * Safety properties enforced:
 *  - demo data NEVER renders with the "healthy/green" (`ok`) severity
 *  - missing status falls back to needs_review, never usable
 *  - usable + non-demo source is the ONLY combination that resolves to `ok`
 *  - stale / invalid / needs_review render distinctly from usable
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import SensorSourceBadge from "@/components/SensorSourceBadge";

afterEach(() => cleanup());

function renderBadge(props: React.ComponentProps<typeof SensorSourceBadge>) {
  const { container } = render(<SensorSourceBadge {...props} />);
  const root = container.querySelector(
    `[data-testid="${props.testId ?? "sensor-source-badge"}"]`,
  ) as HTMLElement;
  return {
    severity: root.getAttribute("data-severity"),
    source: root.getAttribute("data-source"),
    status: root.getAttribute("data-status"),
    demo: root.getAttribute("data-demo") === "true",
    text: root.textContent ?? "",
  };
}

describe("SensorSourceBadge", () => {
  it("renders DEMO prefix and warning severity for demo source, regardless of status", () => {
    const b = renderBadge({ source: "demo", status: "usable" });
    expect(b.demo).toBe(true);
    expect(b.severity).toBe("warning");
    expect(b.text).toMatch(/DEMO/);
    expect(b.severity).not.toBe("ok");
  });

  it("renders live + usable as the only healthy (ok) treatment", () => {
    const b = renderBadge({ source: "live", status: "usable" });
    expect(b.demo).toBe(false);
    expect(b.severity).toBe("ok");
  });

  it("resolves missing status to needs_review (warning), never usable", () => {
    const b = renderBadge({ source: "live", status: null });
    expect(b.status).toBe("needs_review");
    expect(b.severity).toBe("warning");
  });

  it("resolves undefined status to needs_review (warning), never usable", () => {
    const b = renderBadge({ source: "live" });
    expect(b.status).toBe("needs_review");
    expect(b.severity).toBe("warning");
  });

  it("renders stale distinctly from usable", () => {
    const usable = renderBadge({ source: "live", status: "usable" });
    const stale = renderBadge({ source: "live", status: "stale" });
    expect(stale.severity).toBe("warning");
    expect(stale.severity).not.toBe(usable.severity);
  });

  it("renders invalid as danger, distinct from usable", () => {
    const invalid = renderBadge({ source: "live", status: "invalid" });
    expect(invalid.severity).toBe("danger");
    expect(invalid.severity).not.toBe("ok");
  });

  it("renders no_data as empty, distinct from usable", () => {
    const nodata = renderBadge({ source: "live", status: "no_data" });
    expect(nodata.severity).toBe("empty");
    expect(nodata.severity).not.toBe("ok");
  });

  it("demo + stale is still demo-flagged (warning), never ok", () => {
    const b = renderBadge({ source: "demo", status: "stale" });
    expect(b.demo).toBe(true);
    expect(b.severity).not.toBe("ok");
  });

  it("includes both source and status labels in the visible text", () => {
    const b = renderBadge({ source: "manual", status: "usable" });
    expect(b.text).toMatch(/Manual/);
    expect(b.text).toMatch(/Usable/);
  });
});
