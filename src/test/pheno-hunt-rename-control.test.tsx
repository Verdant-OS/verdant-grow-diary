/**
 * #551 — presenter for renaming a hunt from the workspace header.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import PhenoHuntRenameControl from "@/components/PhenoHuntRenameControl";
import { usePhenoHuntRenameSession } from "@/hooks/usePhenoHuntRenameSession";
import { PHENO_HUNT_RENAME_COPY } from "@/lib/phenoHuntRenameRules";

afterEach(() => cleanup());

function Harness(props: {
  currentName: string;
  canWrite: boolean;
  onRename: (name: string) => Promise<boolean>;
}) {
  const session = usePhenoHuntRenameSession(props.onRename);
  return (
    <PhenoHuntRenameControl
      currentName={props.currentName}
      canWrite={props.canWrite}
      session={session}
    />
  );
}

const MANGLED = "Starter Grow Pheno HuntClaude E2E Pheno Hunt";

describe("PhenoHuntRenameControl", () => {
  it("is hidden when the grower cannot write", () => {
    render(<Harness currentName={MANGLED} canWrite={false} onRename={vi.fn()} />);
    expect(screen.queryByTestId("pheno-hunt-rename-open")).toBeNull();
  });

  it("renames: opens prefilled, saves the trimmed name, closes on success", async () => {
    const onRename = vi.fn(async () => true);
    render(<Harness currentName={MANGLED} canWrite onRename={onRename} />);
    fireEvent.click(screen.getByTestId("pheno-hunt-rename-open"));
    const input = screen.getByTestId("pheno-hunt-rename-input") as HTMLInputElement;
    expect(input.value).toBe(MANGLED);
    fireEvent.change(input, { target: { value: "  Claude E2E Pheno Hunt " } });
    fireEvent.click(screen.getByTestId("pheno-hunt-rename-save"));
    await waitFor(() => expect(onRename).toHaveBeenCalledWith("Claude E2E Pheno Hunt"));
    await waitFor(() => expect(screen.queryByTestId("pheno-hunt-rename-input")).toBeNull());
  });

  it("save is disabled for an empty or unchanged name", () => {
    render(<Harness currentName={MANGLED} canWrite onRename={vi.fn()} />);
    fireEvent.click(screen.getByTestId("pheno-hunt-rename-open"));
    const save = screen.getByTestId("pheno-hunt-rename-save") as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(screen.getByTestId("pheno-hunt-rename-input"), { target: { value: "   " } });
    expect(save.disabled).toBe(true);
    expect(screen.getByTestId("pheno-hunt-rename-hint").textContent).toBe(
      PHENO_HUNT_RENAME_COPY.empty,
    );
  });

  it("a failed save stays open and says so", async () => {
    const onRename = vi.fn(async () => false);
    render(<Harness currentName={MANGLED} canWrite onRename={onRename} />);
    fireEvent.click(screen.getByTestId("pheno-hunt-rename-open"));
    fireEvent.change(screen.getByTestId("pheno-hunt-rename-input"), {
      target: { value: "Claude E2E Pheno Hunt" },
    });
    fireEvent.click(screen.getByTestId("pheno-hunt-rename-save"));
    expect(await screen.findByTestId("pheno-hunt-rename-error")).toBeDefined();
    expect(screen.getByTestId("pheno-hunt-rename-error").textContent).toBe(
      PHENO_HUNT_RENAME_COPY.saveFailed,
    );
    expect(screen.getByTestId("pheno-hunt-rename-input")).toBeDefined();
  });

  it("a pending save cannot be cancelled, reopened or edited (#551 Codex P2)", async () => {
    let resolve: (ok: boolean) => void = () => {};
    const onRename = vi.fn(() => new Promise<boolean>((r) => (resolve = r)));
    render(<Harness currentName={MANGLED} canWrite onRename={onRename} />);
    fireEvent.click(screen.getByTestId("pheno-hunt-rename-open"));
    fireEvent.change(screen.getByTestId("pheno-hunt-rename-input"), {
      target: { value: "Claude E2E Pheno Hunt" },
    });
    fireEvent.click(screen.getByTestId("pheno-hunt-rename-save"));
    await waitFor(() => expect(onRename).toHaveBeenCalledTimes(1));
    const cancel = screen.getByTestId("pheno-hunt-rename-cancel") as HTMLButtonElement;
    const input = screen.getByTestId("pheno-hunt-rename-input") as HTMLInputElement;
    expect(cancel.disabled).toBe(true);
    expect(input.disabled).toBe(true);
    fireEvent.click(cancel);
    expect(screen.getByTestId("pheno-hunt-rename-input")).toBeDefined();
    resolve(true);
    await waitFor(() => expect(screen.queryByTestId("pheno-hunt-rename-input")).toBeNull());
  });

  it("a rejected rename is a failed save, not a stuck one (#551 CodeRabbit)", async () => {
    const onRename = vi.fn(async () => {
      throw new Error("network");
    });
    render(<Harness currentName={MANGLED} canWrite onRename={onRename} />);
    fireEvent.click(screen.getByTestId("pheno-hunt-rename-open"));
    fireEvent.change(screen.getByTestId("pheno-hunt-rename-input"), {
      target: { value: "Claude E2E Pheno Hunt" },
    });
    fireEvent.click(screen.getByTestId("pheno-hunt-rename-save"));
    expect(await screen.findByTestId("pheno-hunt-rename-error")).toBeDefined();
    const save = screen.getByTestId("pheno-hunt-rename-save") as HTMLButtonElement;
    expect(save.disabled).toBe(false);
    expect((screen.getByTestId("pheno-hunt-rename-cancel") as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it("cancel discards the edit", () => {
    const onRename = vi.fn();
    render(<Harness currentName={MANGLED} canWrite onRename={onRename} />);
    fireEvent.click(screen.getByTestId("pheno-hunt-rename-open"));
    fireEvent.change(screen.getByTestId("pheno-hunt-rename-input"), { target: { value: "X" } });
    fireEvent.click(screen.getByTestId("pheno-hunt-rename-cancel"));
    expect(screen.queryByTestId("pheno-hunt-rename-input")).toBeNull();
    expect(onRename).not.toHaveBeenCalled();
  });
});
