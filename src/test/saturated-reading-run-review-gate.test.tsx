import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CsvPreviewReviewGate } from "@/components/CsvPreviewReviewGate";
import { parseDelimitedSensorPreview } from "@/lib/csvSensorPreviewRules";

describe("saturated reading run review gate", () => {
  it("keeps normal humidity rows accepted when a saturated run is only a review warning", () => {
    const rows = [
      "2026-06-01T00:00:00Z,55,70",
      ...Array.from(
        { length: 12 },
        (_, index) => `2026-06-01T00:${String(index + 1).padStart(2, "0")}:00Z,100,70`,
      ),
      "2026-06-01T00:13:00Z,56,70",
    ];
    const preview = parseDelimitedSensorPreview(
      ["timestamp,humidity,temperature", ...rows].join("\n"),
      { fileName: "saturated-run.csv", delimiter: "," },
    );
    expect(preview.ok).toBe(true);
    expect(preview.flags.some((flag) => flag.code === "saturated_reading_run")).toBe(true);

    render(
      <CsvPreviewReviewGate
        previewResult={preview}
        hasHardBlockedRows={false}
        hasAcceptedRows={true}
        now={new Date("2026-06-02T00:00:00Z")}
      />,
    );

    expect(screen.getByTestId("csv-import-plan-accepted")).toHaveTextContent("Accepted: 28");
    expect(screen.getByTestId("csv-import-plan-blocked")).toHaveTextContent("Blocked: 0");
    fireEvent.click(screen.getByTestId("csv-gate-toggle-sensor-sample"));
    const sample = screen.getByTestId("csv-gate-sensor-sample-list").textContent ?? "";
    expect(sample).toContain("humidity = 55");
    expect(sample).toContain("quality=ok");
    expect(sample).not.toContain("quality=suspect");
  });
});
