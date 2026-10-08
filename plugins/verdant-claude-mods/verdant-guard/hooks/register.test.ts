import { expect, test } from "claude-code/testing";

// The test's own hooks stand for the engine: a call that reaches them would have run.
test("a force-push is refused before it reaches the engine", async ($, on) => {
  let reached = 0;
  on("tool.call", { tool: "Bash" }, () => {
    reached += 1;
    return { result: { stdout: "", stderr: "", interrupted: false } } as never;
  });
  const r = await $.tool.call({ tool: "Bash", command: "git push --force origin claude/x" });
  expect(reached).toBe(0);
  expect(String(r.deny)).toContain("verdant-guard");
});

test("an ordinary task-branch push reaches the engine", async ($, on) => {
  let reached = 0;
  on("tool.call", { tool: "Bash" }, () => {
    reached += 1;
    return { result: { stdout: "", stderr: "", interrupted: false } } as never;
  });
  await $.tool.call({ tool: "Bash", command: "git push -u origin claude/happy-cray-yeazfk" });
  expect(reached).toBe(1);
});

test("editing a generated file is refused", async ($, on) => {
  let reached = 0;
  on("tool.call", { tool: "Edit" }, () => {
    reached += 1;
    return { result: {} } as never;
  });
  const r = await $.tool.call({
    tool: "Edit",
    file_path: "/repo/src/routeTree.gen.ts",
    old_string: "a",
    new_string: "b",
  });
  expect(reached).toBe(0);
  expect(String(r.deny)).toContain("verdant-guard");
});
