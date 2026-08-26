import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import McpToolExplorer from "@/components/mcp/McpToolExplorer";
import { clearLocalStorageForTest } from "@/test/helpers/localStorageTestHelper";

const TOKEN_KEY = "verdant.mcp.oauth.token.v1";

function seedConnectedBrowser() {
  window.sessionStorage.setItem(
    TOKEN_KEY,
    JSON.stringify({ access_token: "test-token", obtained_at: Date.now(), expires_in: 3600 }),
  );
}

function renderExplorer() {
  return render(
    <MemoryRouter>
      <McpToolExplorer />
    </MemoryRouter>,
  );
}

describe("MCP tool explorer required-id gate", () => {
  beforeEach(() => {
    clearLocalStorageForTest();
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("disables untouched Grow Walk runs in a fresh connected browser without showing premature errors", async () => {
    seedConnectedBrowser();
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    renderExplorer();

    await waitFor(() => {
      expect(screen.getByTestId("tool-explorer-status")).toHaveTextContent("Connected");
    });

    const requiredIdRuns = [
      "tool-explorer-run-list_recent_diary_entries",
      "tool-explorer-run-get_latest_sensor_snapshot",
      "tool-explorer-run-list_grow_walk_targets",
      "tool-explorer-run-get_grow_walk_context",
    ].map((testId) => screen.getByTestId(testId) as HTMLButtonElement);

    expect(requiredIdRuns.every((run) => run.disabled)).toBe(true);
    expect(screen.queryByText("growId is required.")).toBeNull();
    expect(screen.queryByText("targetId is required.")).toBeNull();

    for (const run of requiredIdRuns) fireEvent.click(run);
    await Promise.resolve();

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
