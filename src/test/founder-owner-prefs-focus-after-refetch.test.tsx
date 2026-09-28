/**
 * FounderOwnerPrefsForm — focus returns to Save after the post-save refetch.
 *
 * A successful save refetches the founder row. The refetch flips `loading`
 * back to true, which unmounts the form, so the Save button that comes back
 * is a new node. Focus must land on it once React has committed the
 * remounted form, whatever a requestAnimationFrame callback does.
 *
 * The hook mock here holds real state so the unmount/remount actually
 * happens; the shared form test mocks the hook statically and cannot see it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FounderOwnerPrefsForm from "@/components/FounderOwnerPrefsForm";
import type { MyFounderRow } from "@/hooks/useMyFounderRow";

const invokeSpy = vi.fn();
let releaseRefetch: () => void = () => {};

const ROW: MyFounderRow = {
  founder_number: 33,
  display_name: null,
  display_style: "hidden",
  show_on_wall: false,
  optional_link: null,
  status: "confirmed",
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: {
      invoke: (...args: unknown[]) => invokeSpy(...args),
    },
  },
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

// Mirrors useMyFounderRow's refetch: loading goes true synchronously, the
// read resolves later, then row and loading update together.
vi.mock("@/hooks/useMyFounderRow", async () => {
  const React = await import("react");
  return {
    useMyFounderRow: () => {
      const [loading, setLoading] = React.useState(false);
      const [row, setRow] = React.useState<MyFounderRow | null>(ROW);
      const refetch = React.useCallback(async () => {
        setLoading(true);
        await new Promise<void>((resolve) => {
          releaseRefetch = resolve;
        });
        setRow({ ...ROW });
        setLoading(false);
      }, []);
      return { loading, row, refetch };
    },
  };
});

const FRAME_ORDERINGS = [
  {
    name: "a frame callback runs before React commits the remounted form",
    frame: (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    },
  },
  {
    name: "no frame callback ever runs",
    frame: () => 1,
  },
] as const;

beforeEach(() => {
  invokeSpy.mockReset();
  invokeSpy.mockResolvedValue({ data: { ok: true }, error: null });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("FounderOwnerPrefsForm — focus after the post-save refetch", () => {
  it.each(FRAME_ORDERINGS)("focuses the remounted Save button when $name", async ({ frame }) => {
    vi.stubGlobal("requestAnimationFrame", vi.fn(frame));
    const user = userEvent.setup();
    render(<FounderOwnerPrefsForm />);

    const original = screen.getByRole("button", { name: /save founder settings/i });
    await user.click(original);

    // The refetch has unmounted the form.
    await screen.findByText(/Loading your Founder settings/i);
    expect(screen.queryByRole("button", { name: /save founder settings/i })).toBeNull();

    releaseRefetch();

    const restored = await screen.findByRole("button", { name: /save founder settings/i });
    expect(restored).not.toBe(original);
    await waitFor(() => expect(restored).toHaveFocus());
  });
});
