/**
 * View MCP manifest modal — Copy button safe-summary contract.
 *
 * Locks the exact content of the text the modal Copy button writes to
 * the clipboard: it must be the safe manifest projection (server
 * identity, version, fingerprint, tool count, exact tool names,
 * required/optional parameter summary, safety note) and must never
 * contain any secret-like value. Presenter-only; no Supabase calls.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

vi.mock("@/hooks/usePageSeo", () => ({
  usePageSeo: () => undefined,
}));

import AgentIntegrations from "@/pages/AgentIntegrations";
import {
  MCP_MANIFEST,
  SECRET_LIKE_PATTERNS,
  containsSecretLikeValue,
} from "@/lib/mcp/manifestView";
import { computeManifestHash, shortenManifestHash } from "@/lib/mcp/manifestHash";

function renderAgentIntegrations() {
  return render(
    <MemoryRouter initialEntries={["/settings/agent-integrations"]}>
      <Routes>
        <Route path="/settings/agent-integrations" element={<AgentIntegrations />} />
      </Routes>
    </MemoryRouter>,
  );
}

/**
 * Requirement-driven exclusion list. `containsSecretLikeValue` already
 * covers most of these, but each pattern is asserted individually so a
 * future weakening of SECRET_LIKE_PATTERNS cannot silently pass here.
 * (Test files are exempt from the frontend private-term scanners, so the
 * literal tokens below are safe to spell out — they exist to FORBID.)
 */
const FORBIDDEN_IN_COPY: Array<{ label: string; re: RegExp }> = [
  { label: "JWT-like string", re: /eyJ[A-Za-z0-9_-]{10,}/ },
  { label: "Bearer header value", re: /\bBearer\s/i },
  { label: "access_token", re: /access[_-]?token/i },
  { label: "refresh_token", re: /refresh[_-]?token/i },
  { label: "service_role", re: /service[_-]?role/i },
  { label: "service-role env var name", re: /SUPABASE_SERVICE_ROLE_KEY/ },
  { label: "bridge_token", re: /bridge[_-]?token/i },
  { label: "client_secret", re: /client[_-]?secret/i },
  { label: "raw Authorization header", re: /authorization\s*:/i },
  { label: "raw Cookie header", re: /cookie\s*:/i },
  { label: "raw_payload", re: /raw_payload/i },
  { label: "private env value (db url)", re: /SUPABASE_DB_URL/ },
  { label: "private env value (bridge secret)", re: /BRIDGE_TOKEN_SECRET/ },
  { label: "generic secret env assignment", re: /[A-Z_]*SECRET[A-Z_]*\s*=/ },
];

describe("Manifest summary modal — Copy button payload", () => {
  let writeText: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
  });

  async function openModalAndCopy(): Promise<string> {
    renderAgentIntegrations();
    fireEvent.click(screen.getByTestId("open-manifest-summary-modal"));
    await waitFor(() => {
      expect(screen.getByTestId("manifest-summary-modal")).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId("manifest-summary-copy"));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    return writeText.mock.calls[0][0] as string;
  }

  it("copies the safe summary with server identity, version, fingerprint, and tool count", async () => {
    const payload = await openModalAndCopy();

    // Server identity (title + machine name).
    expect(payload).toContain(MCP_MANIFEST.serverTitle);
    expect(payload).toContain(MCP_MANIFEST.serverName);

    // Manifest version, labeled.
    expect(payload).toMatch(
      new RegExp(`Version:\\s+${MCP_MANIFEST.version.replace(/\./g, "\\.")}`),
    );

    // Manifest fingerprint — must match the same projection the page renders.
    const fingerprint = shortenManifestHash(computeManifestHash(MCP_MANIFEST));
    expect(fingerprint.length).toBeGreaterThan(0);
    expect(payload).toMatch(new RegExp(`Fingerprint:\\s+${fingerprint}`));

    // Tool count.
    expect(payload).toContain(`Tools advertised: ${MCP_MANIFEST.tools.length}`);
  });

  it("copies exactly the three shipped tool names with their required/optional parameter summary", async () => {
    // Guard the manifest shape itself so a tool rename fails loudly here too.
    expect(MCP_MANIFEST.tools.map((t) => t.name)).toEqual([
      "list_grows",
      "list_recent_diary_entries",
      "get_latest_sensor_snapshot",
    ]);

    const payload = await openModalAndCopy();

    for (const tool of MCP_MANIFEST.tools) {
      expect(payload).toContain(tool.name);
      for (const p of tool.params) {
        // buildSafeManifestSummaryText emits "name: type (required|optional)".
        expect(payload).toContain(`${p.name}: ${p.type} (${p.required ? "required" : "optional"})`);
      }
    }
    // The parameter-less summary line is emitted for tools without params.
    expect(payload).toMatch(/required|optional/);
  });

  it("copies the safety note stating no tokens/secrets are included", async () => {
    const payload = await openModalAndCopy();
    expect(payload).toMatch(/does not include tokens/i);
    expect(payload).toMatch(/secrets/i);
  });

  it("copy payload contains no secret-like values (helper + explicit patterns)", async () => {
    const payload = await openModalAndCopy();

    // Canonical helper the page's own guard uses.
    expect(containsSecretLikeValue(payload)).toBe(false);

    // Every pattern in the shared denylist, asserted one by one.
    for (const re of SECRET_LIKE_PATTERNS) {
      expect(re.test(payload), `SECRET_LIKE_PATTERNS ${re} matched copy payload`).toBe(false);
    }

    // Requirement-driven explicit exclusions (independent of the helper).
    for (const { label, re } of FORBIDDEN_IN_COPY) {
      expect(re.test(payload), `copy payload leaked: ${label}`).toBe(false);
    }
  });
});
