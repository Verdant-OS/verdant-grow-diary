/**
 * #2181 Codex 4318623523: the install script must be the canonical sequence,
 * so a command that defeats the provisioned-dependency guard is rejected.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CURSOR_CLOUD_AGENT_CANONICAL_INSTALL_LINES,
  assertCursorCloudAgentInstallScript,
  parseCursorCloudAgentEnvironment,
} from "@/lib/cursorCloudAgentEnvironmentRules";

const canonical = CURSOR_CLOUD_AGENT_CANONICAL_INSTALL_LINES.join("\n");
const GUARD = "if [ ! -d node_modules ]; then";
const REMOVE_DEPENDENCIES = ["rm", "-rf", "node_modules"].join(" ");

function withLineBefore(target: string, inserted: string): string {
  const lines = [...CURSOR_CLOUD_AGENT_CANONICAL_INSTALL_LINES];
  lines.splice(lines.indexOf(target), 0, inserted);
  return lines.join("\n");
}

describe("cursor cloud agent install script is canonical", () => {
  it("accepts the committed .cursor/environment.json, line for line", () => {
    const raw = readFileSync(join(process.cwd(), ".cursor", "environment.json"), "utf8");
    const { install } = parseCursorCloudAgentEnvironment(raw);
    expect(() => assertCursorCloudAgentInstallScript(install)).not.toThrow();
    expect(
      install
        .trim()
        .split("\n")
        .map((line) => line.trim()),
    ).toEqual([...CURSOR_CLOUD_AGENT_CANONICAL_INSTALL_LINES]);
  });

  it.each([REMOVE_DEPENDENCIES, "mv node_modules /tmp/node_modules", "echo extra"])(
    "rejects %j before the node_modules guard",
    (inserted) => {
      expect(() => assertCursorCloudAgentInstallScript(withLineBefore(GUARD, inserted))).toThrow(
        "cursor_cloud_agent_install_not_canonical",
      );
    },
  );

  it("rejects an extra trailing command", () => {
    expect(() =>
      assertCursorCloudAgentInstallScript(`${canonical}\n${REMOVE_DEPENDENCIES}`),
    ).toThrow("cursor_cloud_agent_install_not_canonical");
  });
});
