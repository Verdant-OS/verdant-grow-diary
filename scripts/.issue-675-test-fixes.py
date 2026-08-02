from pathlib import Path


def replace(path: str, old: str, new: str, expected: int = 1) -> None:
    file = Path(path)
    text = file.read_text()
    count = text.count(old)
    if count != expected:
        raise SystemExit(
            f"{path}: expected {expected} exact match(es), found {count}\n"
            f"--- expected seam ---\n{old[:1800]}"
        )
    file.write_text(text.replace(old, new))


INTEGRATION = "src/test/quick-log-timeline-cta-integration.test.tsx"

replace(
    INTEGRATION,
    'import { beforeEach, describe, expect, vi } from "vitest";\n',
    'import { afterEach, beforeEach, describe, expect, vi } from "vitest";\n',
)
replace(
    INTEGRATION,
    '''import { fireEvent as rtlFireEvent, render as rtlRender, screen as rtlScreen, waitFor as rtlWaitFor } from "@testing-library/react";
''',
    '''import {
  cleanup,
  fireEvent as rtlFireEvent,
  render as rtlRender,
  screen as rtlScreen,
  waitFor as rtlWaitFor,
  within as rtlWithin,
} from "@testing-library/react";
''',
)
replace(
    INTEGRATION,
    '''beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
''',
    '''afterEach(() => cleanup());

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
''',
)
replace(
    INTEGRATION,
    '  document.body.innerHTML = "";\n',
    "",
)
replace(
    INTEGRATION,
    '''    rtlFireEvent.change(rtlScreen.getByLabelText("Volume (ml)"), {
      target: { value: "500" },
    });
''',
    '''    const wateringForm = rtlScreen.getByTestId("qlv2-watering-form");
    rtlFireEvent.change(rtlWithin(wateringForm).getByLabelText("Volume (ml)"), {
      target: { value: "500" },
    });
''',
)
replace(
    INTEGRATION,
    '''    rtlFireEvent.change(rtlScreen.getByLabelText("Nutrient line"), {
      target: { value: "veg-line" },
    });
    rtlFireEvent.change(rtlScreen.getByLabelText("Product 1 name"), {
      target: { value: "Base A" },
    });
    rtlFireEvent.change(rtlScreen.getByLabelText("Product 1 amount"), {
      target: { value: "2" },
    });
    rtlFireEvent.change(rtlScreen.getByLabelText("Applied volume (ml)"), {
      target: { value: "750" },
    });
''',
    '''    const feedingForm = rtlScreen.getByTestId("qlv2-feeding-form");
    rtlFireEvent.change(rtlWithin(feedingForm).getByLabelText("Nutrient line"), {
      target: { value: "veg-line" },
    });
    rtlFireEvent.change(rtlWithin(feedingForm).getByLabelText("Product 1 name"), {
      target: { value: "Base A" },
    });
    rtlFireEvent.change(rtlWithin(feedingForm).getByLabelText("Product 1 amount"), {
      target: { value: "2" },
    });
    rtlFireEvent.change(rtlWithin(feedingForm).getByLabelText("Applied volume (ml)"), {
      target: { value: "750" },
    });
''',
)

FEEDING_STATIC = "src/test/quick-log-v2-sheet-feeding.test.tsx"
replace(
    FEEDING_STATIC,
    '''    expect(source).toMatch(
      /showTimelineConfirmation\\(FEEDING_SAVE_SUCCESS_MESSAGE,[\\s\\S]*?growId:\\s*resolved\\.growId,[\\s\\S]*?targetType:\\s*resolved\\.targetType,[\\s\\S]*?targetId:\\s*resolved\\.targetId,[\\s\\S]*?growEventId/,
    );
''',
    '''    expect(source).toContain("showTimelineConfirmation(FEEDING_SAVE_SUCCESS_MESSAGE, {");
    expect(source).toContain("growId: resolved.growId,");
    expect(source).toContain('targetType: resolved.targetType as "plant" | "tent",');
    expect(source).toContain("targetId: resolved.targetId as string,");
    expect(source).toContain("growEventId,");
''',
)

print("Issue 675 focused test fixes applied.")
