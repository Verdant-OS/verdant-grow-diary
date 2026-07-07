/**
 * Breeding program setup — default cultivar quick-pick.
 *
 * Proves both built-in defaults appear on the setup page and that clicking
 * each one prefills the exact cultivar name, lineage, and CBD:THC ratio into
 * the form's parent/cultivar fields.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({}), auth: { getUser: async () => ({ data: { user: null } }) } },
}));

vi.mock("@/hooks/use-toast", () => ({
  toast: vi.fn(),
  useToast: () => ({ toast: vi.fn() }),
}));

import BreedingProgramNew from "@/pages/BreedingProgramNew";
import { DEFAULT_CULTIVARS } from "@/constants/defaultCultivars";

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/breeding/new"]}>
      <BreedingProgramNew />
    </MemoryRouter>,
  );
}

describe("BreedingProgramNew · default cultivars", () => {
  it("exposes exactly two built-in defaults with the pinned names", () => {
    expect(DEFAULT_CULTIVARS).toHaveLength(2);
    expect(DEFAULT_CULTIVARS.map((c) => c.cultivarName)).toEqual([
      "banana cough",
      "permanent marker",
    ]);
  });

  it("renders a quick-pick button for each default without any typing", () => {
    renderPage();
    const section = screen.getByText(/default cultivars/i).closest("div")!;
    for (const cv of DEFAULT_CULTIVARS) {
      const button = within(section).getByTestId(`default-cultivar-${cv.id}`);
      expect(button).toBeTruthy();
      expect(button.textContent).toBe(cv.cultivarName);
    }
  });

  it.each(DEFAULT_CULTIVARS)(
    "clicking $cultivarName prefills the exact name, lineage, and CBD:THC ratio",
    async (cv) => {
      renderPage();
      const user = userEvent.setup();
      await user.click(screen.getByTestId(`default-cultivar-${cv.id}`));

      const maternal = screen.getByLabelText(/P1 maternal label/i) as HTMLInputElement;
      const pair = screen.getByLabelText(/Cross pair label/i) as HTMLInputElement;
      const notes = screen.getByLabelText(/^Notes$/i) as HTMLTextAreaElement;

      expect(maternal.value).toBe(cv.cultivarName);
      expect(pair.value).toBe(cv.lineage);
      expect(notes.value).toContain(`Cultivar: ${cv.cultivarName}`);
      expect(notes.value).toContain(`Lineage: ${cv.lineage}`);
      expect(notes.value).toContain(`CBD:THC ratio: ${cv.cbdThcRatio}`);
    },
  );
});
