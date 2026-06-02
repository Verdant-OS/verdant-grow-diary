import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import CoachAiDoctorContextPanel from "@/components/CoachAiDoctorContextPanel";

const insertSpy = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      insert: (...args: unknown[]) => {
        insertSpy(...args);
        return { select: () => ({ single: async () => ({ data: null, error: null }) }) };
      },
      select: () => ({ eq: () => ({ data: [], error: null }) }),
    }),
    functions: { invoke: vi.fn() },
  },
}));

const NOW_ISO = new Date().toISOString();
const HOUR = 3600 * 1000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

describe("CoachAiDoctorContextPanel", () => {
  it("renders readiness, evidence, missing and safe-next-step", () => {
    render(
      <CoachAiDoctorContextPanel
        plant={{
          id: "p1",
          strain: "NL",
          stage: "veg",
          medium: "Coco",
          photo: "https://x/y.jpg",
        }}
        diaryEntries={[
          { entry_type: "watering", entry_at: ago(HOUR) },
          { entry_type: "note", entry_at: ago(2 * HOUR) },
          {
            entry_type: "manual_sensor_snapshot",
            entry_at: ago(HOUR),
            details: { source: "manual" },
          },
        ]}
      />,
    );
    expect(screen.getByTestId("coach-ai-doctor-context-panel")).toBeTruthy();
    expect(screen.getByTestId("coach-ai-doctor-context-readiness").textContent)
      .toMatch(/Strong context/);
    expect(screen.getByTestId("coach-ai-doctor-context-safe-next-step")).toBeTruthy();
    expect(screen.queryByTestId("coach-ai-doctor-context-notice")).toBeNull();
  });

  it("shows calm 'More context would improve confidence' copy when partial/insufficient", () => {
    render(
      <CoachAiDoctorContextPanel
        plant={null}
        diaryEntries={[]}
      />,
    );
    const notice = screen.getByTestId("coach-ai-doctor-context-notice");
    expect(notice.textContent).toMatch(/More context would improve confidence/);
    expect(screen.getByTestId("coach-ai-doctor-context-readiness").textContent)
      .toMatch(/Insufficient context/);
  });

  it("exposes tooltip help text on rendered readiness items", () => {
    const { container } = render(
      <CoachAiDoctorContextPanel
        plant={{ id: "p1", strain: "NL", stage: "veg", medium: "Coco" }}
        diaryEntries={[{ entry_type: "watering", entry_at: NOW_ISO }]}
      />,
    );
    const items = container.querySelectorAll("li[data-code]");
    expect(items.length).toBeGreaterThan(0);
    for (const li of Array.from(items)) {
      expect((li as HTMLElement).getAttribute("title")?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it("does not create AI Doctor sessions, alerts, or action queue items just by rendering", () => {
    render(
      <CoachAiDoctorContextPanel
        plant={{ id: "p1", strain: "NL", stage: "veg" }}
        diaryEntries={[{ entry_type: "watering", entry_at: NOW_ISO }]}
      />,
    );
    expect(insertSpy).not.toHaveBeenCalled();
  });
});
