/**
 * The production report writer of scripts/dev/ecowitt-ingest-forwarder.ts,
 * reached through `createMessageHandler` with no injected writer: writes are
 * serialised and each one replaces the previous report atomically (Codex P2
 * on #2335 at acab6b12). `node:fs/promises` is mocked so nothing touches disk.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const fs = vi.hoisted(() => {
  const releases: Array<() => void> = [];
  return {
    releases,
    mkdir: vi.fn(async () => undefined),
    rename: vi.fn(async () => undefined),
    writeFile: vi.fn(
      () =>
        new Promise<void>((resolve) => {
          releases.push(resolve);
        }),
    ),
  };
});
vi.mock("node:fs/promises", () => ({
  mkdir: fs.mkdir,
  rename: fs.rename,
  writeFile: fs.writeFile,
}));

import {
  DEFAULT_REPORT_PATH,
  createMessageHandler,
  type ForwarderFlags,
} from "../../scripts/dev/ecowitt-ingest-forwarder";

const FAKE_PASSKEY = ["FAKE", "TEST", "PASSKEY", "NOT", "REAL"].join("_");
const MESSAGE = JSON.stringify({
  PASSKEY: FAKE_PASSKEY,
  dateutc: "2026-10-22 05:27:14",
  temp2f: 80,
});
const flags: ForwarderFlags = {
  live: false,
  once: false,
  writeReport: true,
  topic: "ecowitt/grow",
  mqttUrl: "mqtt://127.0.0.1:1883",
};
const ENV = { ingestUrl: null, token: null, mqttUsername: null, mqttPassword: null };

describe("production report writer through createMessageHandler", () => {
  afterEach(() => {
    fs.releases.splice(0);
    fs.writeFile.mockClear();
    fs.rename.mockClear();
  });

  it("writes one report at a time and renames the complete document into place", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const handle = createMessageHandler({ flags, env: ENV, onDone: () => {} });
      handle("ecowitt/grow", MESSAGE);
      handle("ecowitt/grow", MESSAGE);
      await vi.waitFor(() => expect(fs.writeFile).toHaveBeenCalledTimes(1));
      // The second message has finished its dry run but its write waits on the first.
      await new Promise((r) => setTimeout(r, 20));
      expect(fs.writeFile).toHaveBeenCalledTimes(1);
      expect(fs.rename).not.toHaveBeenCalled();
      const [partialPath] = fs.writeFile.mock.calls[0] as unknown as [string];
      expect(partialPath).toBe(`${DEFAULT_REPORT_PATH}.partial`);
      fs.releases[0]();
      await vi.waitFor(() => expect(fs.rename).toHaveBeenCalledTimes(1));
      expect(fs.rename).toHaveBeenCalledWith(`${DEFAULT_REPORT_PATH}.partial`, DEFAULT_REPORT_PATH);
      await vi.waitFor(() => expect(fs.writeFile).toHaveBeenCalledTimes(2));
      fs.releases[1]();
      await vi.waitFor(() => expect(fs.rename).toHaveBeenCalledTimes(2));
    } finally {
      logSpy.mockRestore();
    }
  });
});
