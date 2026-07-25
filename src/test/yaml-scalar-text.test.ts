import { describe, expect, it } from "vitest";
import { readWorkflowYamlScalar } from "./helpers/yamlScalarText";

describe("readWorkflowYamlScalar", () => {
  it("preserves an inline workflow expression", () => {
    expect(
      readWorkflowYamlScalar(
        "        if: always() && steps.config.outputs.should_run == 'true'",
        "if",
      ),
    ).toBe("always() && steps.config.outputs.should_run == 'true'");
  });

  it("folds a block expression and stops at the next sibling key", () => {
    const source = [
      "        if: >-",
      "          always()",
      "          && steps.config.outputs.should_run == 'true'",
      "          && inputs.publish != 'false'",
      "        uses: actions/upload-artifact@0123456789",
    ].join("\r\n");

    expect(readWorkflowYamlScalar(source, "if")).toBe(
      "always() && steps.config.outputs.should_run == 'true' && inputs.publish != 'false'",
    );
  });

  it("reads only indented literal paths and excludes dedented comments", () => {
    const source = [
      "          path: |",
      "            e2e/results/report.json",
      "            playwright-report/",
      "",
      "      # This is a step-level comment, not literal content.",
      "      - name: Next step",
    ].join("\n");

    expect(readWorkflowYamlScalar(source, "path").split("\n")).toEqual([
      "e2e/results/report.json",
      "playwright-report/",
    ]);
  });

  it("fails closed when the requested key is absent", () => {
    expect(() => readWorkflowYamlScalar("        uses: action@sha", "if")).toThrow(
      /missing yaml scalar key/i,
    );
  });

  it("fails closed when a block marker has no indented content", () => {
    expect(() =>
      readWorkflowYamlScalar(["        path: |", "      - name: Next step"].join("\n"), "path"),
    ).toThrow(/no indented content/i);
  });
});
