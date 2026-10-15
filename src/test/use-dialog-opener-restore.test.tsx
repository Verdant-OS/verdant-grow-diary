import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDialogOpenerRestore } from "@/hooks/useDialogOpenerRestore";

describe("useDialogOpenerRestore", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("restores focus to the captured opener and prevents default close focus", () => {
    const opener = document.createElement("button");
    opener.type = "button";
    document.body.append(opener);
    opener.focus();

    const { result, rerender } = renderHook(({ open }) => useDialogOpenerRestore(open), {
      initialProps: { open: false },
    });

    rerender({ open: true });

    const preventDefault = vi.fn();
    act(() => {
      result.current({ preventDefault });
    });

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(opener);
  });

  it("does not capture body as the opener", () => {
    document.body.focus();

    const { result, rerender } = renderHook(({ open }) => useDialogOpenerRestore(open), {
      initialProps: { open: false },
    });

    rerender({ open: true });

    const preventDefault = vi.fn();
    act(() => {
      result.current({ preventDefault });
    });

    expect(preventDefault).not.toHaveBeenCalled();
  });

  it("skips restore when the opener was removed from the document", () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();

    const { result, rerender } = renderHook(({ open }) => useDialogOpenerRestore(open), {
      initialProps: { open: false },
    });

    rerender({ open: true });
    opener.remove();

    const preventDefault = vi.fn();
    act(() => {
      result.current({ preventDefault });
    });

    expect(preventDefault).not.toHaveBeenCalled();
  });
});
