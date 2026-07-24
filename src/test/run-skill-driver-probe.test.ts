/**
 * Covers the run-verdant-grow-diary skill driver's Chromium discovery
 * (.claude/skills/run-verdant-grow-diary/driver.mjs → probeChromium).
 *
 * The driver guards its launch block behind a main-module check, so importing
 * it here NEVER starts a browser; probeChromium takes injected env + fs so
 * every branch is testable without touching the real filesystem.
 */
import { describe, it, expect } from "vitest";
// Plain .mjs agent tooling — resolved via allowJs; no type declarations needed.
import { probeChromium } from "../../.claude/skills/run-verdant-grow-diary/driver.mjs";

type FsLike = { existsSync: (p: string) => boolean; readdirSync: (p: string) => string[] };

function fakeFs(
  existing: string[],
  opts: { entries?: string[]; throwOnRead?: boolean } = {},
): FsLike {
  return {
    existsSync: (p: string) => existing.includes(p),
    readdirSync: () => {
      if (opts.throwOnRead) throw new Error("EACCES");
      return opts.entries ?? [];
    },
  };
}

const ROOT = "/opt/pw-browsers";
const bin = (rev: string) => `${ROOT}/chromium-${rev}/chrome-linux/chrome`;

describe("run-skill driver — probeChromium", () => {
  it("CHROMIUM env var wins when it points at an existing file", () => {
    const fs = fakeFs(["/custom/chrome", ROOT, bin("1228")], { entries: ["chromium-1228"] });
    expect(probeChromium({ CHROMIUM: "/custom/chrome" }, fs)).toBe("/custom/chrome");
  });

  it("a CHROMIUM path that does not exist falls through to the probe", () => {
    const fs = fakeFs([ROOT, bin("1228")], { entries: ["chromium-1228"] });
    expect(probeChromium({ CHROMIUM: "/missing/chrome" }, fs)).toBe(bin("1228"));
  });

  it("missing browsers root → undefined (Playwright bundled fallback)", () => {
    expect(probeChromium({}, fakeFs([]))).toBeUndefined();
  });

  it("unreadable browsers root → undefined, never a throw", () => {
    const fs = fakeFs([ROOT], { throwOnRead: true });
    expect(probeChromium({}, fs)).toBeUndefined();
  });

  it("selects the NEWEST chromium revision deterministically, never headless shells", () => {
    const fs = fakeFs([ROOT, bin("1194"), bin("1228")], {
      entries: ["chromium-1194", "chromium_headless_shell-1228", "chromium-1228", "ffmpeg-1011"],
    });
    expect(probeChromium({}, fs)).toBe(bin("1228"));
  });

  it("skips a newer revision whose binary is absent and falls back to the older one", () => {
    const fs = fakeFs([ROOT, bin("1194")], { entries: ["chromium-1194", "chromium-1228"] });
    expect(probeChromium({}, fs)).toBe(bin("1194"));
  });

  it("no usable candidates under the root → undefined", () => {
    const fs = fakeFs([ROOT], { entries: ["chromium_headless_shell-1228", "firefox-1495"] });
    expect(probeChromium({}, fs)).toBeUndefined();
  });

  it("honors a PLAYWRIGHT_BROWSERS_PATH override", () => {
    const alt = "/elsewhere/browsers";
    const fs: FsLike = {
      existsSync: (p) => p === alt || p === `${alt}/chromium-1300/chrome-linux/chrome`,
      readdirSync: () => ["chromium-1300"],
    };
    expect(probeChromium({ PLAYWRIGHT_BROWSERS_PATH: alt }, fs)).toBe(
      `${alt}/chromium-1300/chrome-linux/chrome`,
    );
  });
});
