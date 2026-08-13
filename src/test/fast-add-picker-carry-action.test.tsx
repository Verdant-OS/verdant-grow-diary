/**
 * P3-A: pending Quick Log action survives plant/tent picker CTAs.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  FAST_ADD_ACTIONS,
  FAST_ADD_PICKER_CTAS,
  buildFastAddPickerCtas,
  fastAddPickerBannerCopy,
  readFastAddParam,
  resolveFastAddIntent,
  type FastAddActionId,
} from "@/lib/fastAddActionRules";

const ACTION_IDS = FAST_ADD_ACTIONS.map((a) => a.id) as FastAddActionId[];

describe("buildFastAddPickerCtas", () => {
  it("returns the right `to` for each of the 8 action ids", () => {
    expect(ACTION_IDS).toHaveLength(8);
    for (const id of ACTION_IDS) {
      const ctas = buildFastAddPickerCtas(id);
      expect(ctas).toHaveLength(2);
      expect(ctas[0]).toMatchObject({
        id: "choose_plant",
        label: "Choose plant",
        to: `/plants?fastAdd=${id}`,
      });
      expect(ctas[1]).toMatchObject({
        id: "choose_tent",
        label: "Choose tent",
        to: `/tents?fastAdd=${id}`,
      });
    }
  });

  it("keeps FAST_ADD_PICKER_CTAS bare paths for back-compat", () => {
    expect(FAST_ADD_PICKER_CTAS[0].to).toBe("/plants");
    expect(FAST_ADD_PICKER_CTAS[1].to).toBe("/tents");
  });
});

describe("readFastAddParam", () => {
  it("valid id -> id", () => {
    expect(readFastAddParam("?fastAdd=environment")).toBe("environment");
    expect(readFastAddParam("fastAdd=watering")).toBe("watering");
    expect(readFastAddParam("growId=x&fastAdd=feeding")).toBe("feeding");
  });

  it("unknown/empty/garbage -> null", () => {
    expect(readFastAddParam("")).toBeNull();
    expect(readFastAddParam(null)).toBeNull();
    expect(readFastAddParam(undefined)).toBeNull();
    expect(readFastAddParam("?fastAdd=")).toBeNull();
    expect(readFastAddParam("?fastAdd=not-a-real-action")).toBeNull();
    expect(readFastAddParam("?fastAdd=%00")).toBeNull();
    expect(readFastAddParam("garbage")).toBeNull();
  });
});

describe("resolveFastAddIntent needs-context carries action", () => {
  it("encodes pending action on CTAs when no plant/tent selected", () => {
    const intent = resolveFastAddIntent("environment", null);
    expect(intent.kind).toBe("needs-context");
    if (intent.kind !== "needs-context") return;
    expect(intent.ctas.map((c) => c.to)).toEqual([
      "/plants?fastAdd=environment",
      "/tents?fastAdd=environment",
    ]);
  });
});

describe("fastAddPickerBannerCopy", () => {
  it("uses action labels", () => {
    expect(fastAddPickerBannerCopy("tent", "environment")).toBe(
      "Choose a tent to log Environment.",
    );
    expect(fastAddPickerBannerCopy("plant", "environment")).toBe(
      "Choose a plant to log Environment.",
    );
  });
});

/** Lightweight banner unit — avoids full Tents/Plants data-layer mount. */
function PickerBannerStub({
  kind,
  search,
}: {
  kind: "plant" | "tent";
  search: string;
}) {
  const pending = readFastAddParam(search);
  if (!pending) return null;
  return (
    <p role="status" data-testid="fast-add-picker-banner">
      {fastAddPickerBannerCopy(kind, pending)}
    </p>
  );
}

describe("picker banner presenter", () => {
  it("renders banner when param present", () => {
    render(<PickerBannerStub kind="tent" search="?fastAdd=environment" />);
    expect(screen.getByTestId("fast-add-picker-banner")).toHaveTextContent(
      "Choose a tent to log Environment.",
    );
  });

  it("renders nothing when param absent or invalid", () => {
    const { container: a } = render(
      <PickerBannerStub kind="tent" search="" />,
    );
    expect(a.querySelector("[data-testid=fast-add-picker-banner]")).toBeNull();
    const { container: b } = render(
      <PickerBannerStub kind="plant" search="?fastAdd=nope" />,
    );
    expect(b.querySelector("[data-testid=fast-add-picker-banner]")).toBeNull();
  });
});
