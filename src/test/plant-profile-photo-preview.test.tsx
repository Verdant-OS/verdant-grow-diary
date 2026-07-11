/**
 * usePlantProfilePhotoPreview + PlantProfilePhotoPreview integration
 * tests. Browser decoding is mocked deterministically — the test
 * environment's real HEIC support is not relied on.
 *
 * No network, no Supabase, no upload — preview is display-only.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, cleanup } from "@testing-library/react";
import { useState } from "react";
import { usePlantProfilePhotoPreview, type PlantProfilePhotoDecodeProbe } from "@/hooks/usePlantProfilePhotoPreview";
import PlantProfilePhotoPreview from "@/components/PlantProfilePhotoPreview";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// --------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------

function fakeFile(name: string, type: string, size = 1024): File {
  const f = new File([new Uint8Array(size)], name, { type });
  return f;
}

let urlCounter = 0;
const created: string[] = [];
const revoked: string[] = [];
const fakeCreate = (_b: Blob) => {
  urlCounter += 1;
  const url = `blob:mock/${urlCounter}`;
  created.push(url);
  return url;
};
const fakeRevoke = (u: string) => {
  revoked.push(u);
};

function immediateProbe(result: boolean): PlantProfilePhotoDecodeProbe {
  return () => Promise.resolve(result);
}

function deferredProbe(): {
  probe: PlantProfilePhotoDecodeProbe;
  resolveWith: (v: boolean) => void;
} {
  let resolver: (v: boolean) => void = () => {};
  const p = new Promise<boolean>((r) => {
    resolver = r;
  });
  return {
    probe: () => p,
    resolveWith: (v) => resolver(v),
  };
}

// Test harness: pipes the hook into the presenter and exposes controls
// to swap the file / unmount.
interface HarnessProps {
  initialFile: File | null;
  initialMime: string | null;
  probe: PlantProfilePhotoDecodeProbe;
  onReplace?: () => void;
  onRemove?: () => void;
}
function Harness(props: HarnessProps & { register?: (setFile: (f: File | null, m: string | null) => void) => void }) {
  const [file, setFile] = useState<File | null>(props.initialFile);
  const [mime, setMime] = useState<string | null>(props.initialMime);
  props.register?.((f, m) => {
    setFile(f);
    setMime(m);
  });
  const { preview } = usePlantProfilePhotoPreview(
    { file, mimeType: mime },
    {
      createObjectURL: fakeCreate,
      revokeObjectURL: fakeRevoke,
      decodeProbe: props.probe,
    },
  );
  return (
    <div>
      <div data-testid="preview-status">{preview.status}</div>
      {preview.status !== "none" && (
        <PlantProfilePhotoPreview
          state={preview}
          altName="Test Plant"
          onReplace={props.onReplace ?? (() => {})}
          onRemove={props.onRemove ?? (() => {})}
        />
      )}
    </div>
  );
}

beforeEach(() => {
  urlCounter = 0;
  created.length = 0;
  revoked.length = 0;
});
afterEach(() => cleanup());

// --------------------------------------------------------------------
// Tests
// --------------------------------------------------------------------

describe("usePlantProfilePhotoPreview — supported formats", () => {
  it.each([
    ["image/jpeg", "photo.jpg"],
    ["image/png", "photo.png"],
    ["image/webp", "photo.webp"],
  ])("renders a normal object-URL preview for %s", async (mime, name) => {
    const file = fakeFile(name, mime);
    render(
      <Harness
        initialFile={file}
        initialMime={mime}
        probe={immediateProbe(true)}
      />,
    );
    expect(screen.getByTestId("preview-status").textContent).toBe("image");
    // Object URL was created and not revoked yet.
    expect(created.length).toBe(1);
    expect(revoked.length).toBe(0);
  });
});

describe("usePlantProfilePhotoPreview — HEIC/HEIF decode probing", () => {
  it("HEIC decode success renders the image preview", async () => {
    const { probe, resolveWith } = deferredProbe();
    render(
      <Harness
        initialFile={fakeFile("shot.heic", "image/heic")}
        initialMime="image/heic"
        probe={probe}
      />,
    );
    expect(screen.getByTestId("preview-status").textContent).toBe("loading");
    await act(async () => {
      resolveWith(true);
    });
    expect(screen.getByTestId("preview-status").textContent).toBe("image");
  });

  it("HEIC decode failure renders the accessible fallback card with badge", async () => {
    render(
      <Harness
        initialFile={fakeFile("shot.heic", "image/heic")}
        initialMime="image/heic"
        probe={immediateProbe(false)}
      />,
    );
    await act(async () => {});
    expect(screen.getByTestId("preview-status").textContent).toBe("fallback");
    const card = screen.getByRole("status");
    expect(card).toHaveAttribute("aria-live", "polite");
    expect(card.getAttribute("data-preview-reason")).toBe(
      "browser_decode_unsupported",
    );
    expect(screen.getByText("Photo selected")).toBeInTheDocument();
    expect(screen.getByText("HEIC")).toBeInTheDocument();
    expect(
      screen.getByText(/original photo is ready to upload/i),
    ).toBeInTheDocument();
    // Object URL created for the probe was revoked when we fell back.
    expect(revoked.length).toBeGreaterThan(0);
  });

  it("HEIF decode failure renders the HEIF badge", async () => {
    render(
      <Harness
        initialFile={fakeFile("shot.heif", "image/heif")}
        initialMime="image/heif"
        probe={immediateProbe(false)}
      />,
    );
    await act(async () => {});
    expect(screen.getByText("HEIF")).toBeInTheDocument();
  });

  it("probe rejection surfaces a generic preview_error fallback", async () => {
    const failing: PlantProfilePhotoDecodeProbe = () =>
      Promise.reject(new Error("boom"));
    render(
      <Harness
        initialFile={fakeFile("shot.heic", "image/heic")}
        initialMime="image/heic"
        probe={failing}
      />,
    );
    await act(async () => {});
    const card = screen.getByRole("status");
    expect(card.getAttribute("data-preview-reason")).toBe("preview_error");
    expect(
      screen.getByText(/still ready to upload/i),
    ).toBeInTheDocument();
  });
});

describe("usePlantProfilePhotoPreview — lifecycle + stale-result protection", () => {
  it("selecting a new file revokes the previous object URL", async () => {
    let setter: ((f: File | null, m: string | null) => void) | null = null;
    render(
      <Harness
        initialFile={fakeFile("a.jpg", "image/jpeg")}
        initialMime="image/jpeg"
        probe={immediateProbe(true)}
        register={(s) => {
          setter = s;
        }}
      />,
    );
    expect(created.length).toBe(1);
    const firstUrl = created[0];
    await act(async () => {
      setter?.(fakeFile("b.jpg", "image/jpeg"), "image/jpeg");
    });
    expect(revoked).toContain(firstUrl);
  });

  it("removing (setting file to null) revokes and clears state", async () => {
    let setter: ((f: File | null, m: string | null) => void) | null = null;
    render(
      <Harness
        initialFile={fakeFile("a.jpg", "image/jpeg")}
        initialMime="image/jpeg"
        probe={immediateProbe(true)}
        register={(s) => {
          setter = s;
        }}
      />,
    );
    const firstUrl = created[0];
    await act(async () => {
      setter?.(null, null);
    });
    expect(revoked).toContain(firstUrl);
    expect(screen.getByTestId("preview-status").textContent).toBe("none");
  });

  it("unmounting revokes the active object URL", async () => {
    const { unmount } = render(
      <Harness
        initialFile={fakeFile("a.jpg", "image/jpeg")}
        initialMime="image/jpeg"
        probe={immediateProbe(true)}
      />,
    );
    const firstUrl = created[0];
    unmount();
    expect(revoked).toContain(firstUrl);
  });

  it("stale HEIC decode result cannot overwrite a newer selection", async () => {
    // Per-call deferred probe: each invocation gets its own resolver.
    const resolvers: Array<(v: boolean) => void> = [];
    const perCallProbe: PlantProfilePhotoDecodeProbe = () =>
      new Promise<boolean>((r) => resolvers.push(r));

    let setter: ((f: File | null, m: string | null) => void) | null = null;
    render(
      <Harness
        initialFile={fakeFile("a.heic", "image/heic")}
        initialMime="image/heic"
        probe={perCallProbe}
        register={(s) => {
          setter = s;
        }}
      />,
    );
    expect(screen.getByTestId("preview-status").textContent).toBe("loading");
    expect(resolvers.length).toBe(1);

    // Swap to a new HEIC file — kicks off a second probe.
    await act(async () => {
      setter?.(fakeFile("b.heic", "image/heic"), "image/heic");
    });
    expect(resolvers.length).toBe(2);

    // Resolve A (the stale one) LATE with true; must be ignored.
    await act(async () => {
      resolvers[0](true);
    });
    expect(screen.getByTestId("preview-status").textContent).toBe("loading");

    // Now resolve B with false → fallback wins.
    await act(async () => {
      resolvers[1](false);
    });
    expect(screen.getByTestId("preview-status").textContent).toBe("fallback");
  });
});

// --------------------------------------------------------------------
// Static safety pins on the surrounding integration.
// --------------------------------------------------------------------

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

describe("EditPlantDialog integration — save contract + safety", () => {
  const EDIT = read("src/components/EditPlantDialog.tsx");

  it("uploads the exact original File object, not a preview representation", () => {
    // The dialog passes `selected.file` (the original File) directly.
    expect(EDIT).toMatch(/uploadPlantProfilePhoto\(\s*\{\s*file:\s*selected\.file/);
    // No client-side conversion / renaming / MIME rewriting.
    expect(EDIT).not.toMatch(/toBlob|toDataURL|canvas|heic2any/i);
  });

  it("no upload happens before Save (upload is inside the submit handler only)", () => {
    // Guard: onFileChosen only sets local state — no upload call.
    const onChosen = EDIT.match(/function onFileChosen[\s\S]*?\n\s*\}\n/);
    expect(onChosen).toBeTruthy();
    expect(onChosen?.[0]).not.toMatch(/uploadPlantProfilePhoto/);
  });

  it("Save button is not disabled by preview state — only by `busy`", () => {
    expect(EDIT).toMatch(/disabled=\{busy\}/);
    expect(EDIT).not.toMatch(/disabled=\{[^}]*preview/);
  });

  it("delegates decode / object-URL lifecycle to the preview hook", () => {
    expect(EDIT).toContain(
      'import { usePlantProfilePhotoPreview } from "@/hooks/usePlantProfilePhotoPreview"',
    );
    expect(EDIT).toContain(
      'import PlantProfilePhotoPreview from "@/components/PlantProfilePhotoPreview"',
    );
    // No decoding rules embedded directly in JSX.
    expect(EDIT).not.toMatch(/HTMLImageElement|\.decode\(\)/);
    // No new URL.createObjectURL calls in the dialog — hook owns them.
    expect(EDIT).not.toMatch(/URL\.createObjectURL/);
  });

  it("still writes only to `plants` and never invokes Edge functions", () => {
    expect(EDIT).not.toMatch(/functions\.invoke/);
    expect(EDIT).not.toMatch(/from\("alerts"\)|from\("action_queue"\)/);
  });
});
