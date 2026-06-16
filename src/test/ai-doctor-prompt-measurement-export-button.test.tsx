import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AiDoctorPromptMeasurementExportButton } from "@/components/AiDoctorPromptMeasurementExportButton";
import { createAiDoctorPromptMeasurementCaptureStore } from "@/lib/cost/aiDoctorPromptMeasurementCaptureStore";
import { buildAiDoctorPromptMeasurement } from "@/lib/cost/aiDoctorPromptMeasurement";

describe("AiDoctorPromptMeasurementExportButton", () => {
  it("is disabled when store is empty", () => {
    const store = createAiDoctorPromptMeasurementCaptureStore();
    render(<AiDoctorPromptMeasurementExportButton store={store} />);
    const btn = screen.getByRole("button", { name: /Export AI Doctor prompt measurements/i });
    expect(btn).toBeDisabled();
  });

  it("downloads a CSV when measurements exist", () => {
    const store = createAiDoctorPromptMeasurementCaptureStore();
    store.capture(
      buildAiDoctorPromptMeasurement({
        promptName: "ai_doctor_review",
        recordedAt: "2026-06-16T00:00:00Z",
        userPromptText: "hello",
      }),
    );
    const onDownload = vi.fn();
    render(
      <AiDoctorPromptMeasurementExportButton store={store} onDownload={onDownload} />,
    );
    const btn = screen.getByRole("button", { name: /Export AI Doctor prompt measurements/i });
    expect(btn).not.toBeDisabled();
    fireEvent.click(btn);
    expect(onDownload).toHaveBeenCalledTimes(1);
    const [filename, csv] = onDownload.mock.calls[0];
    expect(filename).toBe("verdant-ai-doctor-prompt-measurements.csv");
    expect(csv).toMatch(/^recordedAt,promptName,/);
    expect(csv).toContain("ai_doctor_review");
    expect(csv).not.toContain("hello"); // raw prompt text never appears
  });
});
