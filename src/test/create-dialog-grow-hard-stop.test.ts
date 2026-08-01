import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const TENT = readFileSync(resolve(ROOT, "src/components/CreateTentDialog.tsx"), "utf8");
const PLANT = readFileSync(resolve(ROOT, "src/components/CreatePlantDialog.tsx"), "utf8");

describe("create dialog hard-stop wiring", () => {
  it("CreateTentDialog uses binding view, read-error retry debounce, always writes grow_id", () => {
    expect(TENT).toMatch(/buildCreateGrowBindingView/);
    expect(TENT).toMatch(/useCreateBindingRetry/);
    expect(TENT).toMatch(/create-tent-hard-stop/);
    expect(TENT).toMatch(/create-tent-read-error/);
    expect(TENT).toMatch(/create-tent-retry/);
    expect(TENT).toMatch(/growRetry\.gate\.disabled/);
    expect(TENT).toMatch(/grow_id:\s*targetGrowId/);
    expect(TENT).toMatch(/growsError/);
    expect(TENT).not.toMatch(/if\s*\(defaultGrowId\)\s*payload\.grow_id/);
    // Close/reopen must reset draft state (no stale name after dismiss).
    expect(TENT).toMatch(/function handleOpenChange/);
    expect(TENT).toMatch(/if\s*\(!next\)\s*resetForm\(\)/);
    expect(TENT).toMatch(/onOpenChange=\{handleOpenChange\}/);
  });

  it("CreatePlantDialog fail-closed tent + grow contracts with debounced retries", () => {
    expect(PLANT).toMatch(/buildCreateGrowBindingView/);
    expect(PLANT).toMatch(/useCreateBindingRetry/);
    expect(PLANT).toMatch(/evaluateSuppliedTentBinding/);
    expect(PLANT).toMatch(/create-plant-hard-stop/);
    expect(PLANT).toMatch(/create-plant-read-error/);
    expect(PLANT).toMatch(/create-plant-tent-pending/);
    expect(PLANT).toMatch(/tentRetry\.gate\.disabled/);
    expect(PLANT).toMatch(/grow_id:\s*targetGrowId/);
    expect(PLANT).toMatch(/plantCreateAllowsTentless/);
    // Background refetch must not authorize a stale supplied tent write.
    expect(PLANT).toMatch(/isFetching:\s*tentsFetching/);
    expect(PLANT).toMatch(/tentsFetching:\s*!!defaultTentId\s*&&\s*tentsFetching/);
    // Unavailable/orphan/mismatch clear only after verified compatible replacement.
    expect(PLANT).toMatch(/explicitCompatiblePick/);
    expect(PLANT).toMatch(
      /kind === "unavailable"[\s\S]*!explicitCompatiblePick|!explicitCompatiblePick[\s\S]*kind === "unavailable"/,
    );
  });
});
