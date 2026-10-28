/**
 * Tents and Tent Detail pass resource="tents". The live help must use the
 * fixed sentence for that plural form, not "Plants, tents, and tents".
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import GrowDataSourceDisclosure from "@/components/GrowDataSourceDisclosure";

const liveMeta = { dataSource: "supabase" as const, isDemoData: false, sourceReason: "supabase" };

describe("GrowDataSourceDisclosure tent help", () => {
  it("uses the fixed sentence when the resource is tents", async () => {
    const user = userEvent.setup();
    render(<GrowDataSourceDisclosure resource="tents" hasAnyData metas={[liveMeta]} />);
    await user.click(screen.getByTestId("info-popover-trigger-grow-data-source-disclosure-source"));
    const help = screen.getByTestId("info-popover-content-grow-data-source-disclosure-source");
    expect(help).toHaveTextContent(
      "Plants and tents saved in your Verdant workspace — not a live sensor reading.",
    );
    expect(help.textContent ?? "").not.toContain("Plants, tents, and tents");
  });
});
