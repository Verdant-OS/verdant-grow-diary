import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import CustomerOreozGelonadeGuide from "@/pages/CustomerOreozGelonadeGuide";
import CustomerComparisonGuideQrOption from "@/components/customer/CustomerComparisonGuideQrOption";
import {
  NEXT_DOOR_CUSTOMER_BRAND,
  NEXT_DOOR_CUSTOMER_COMPARISON_PATH,
  OREOZ_GELONADE_CUSTOMER_SEO,
} from "@/constants/oreozGelonadeExperience";

afterEach(cleanup);

describe("ID-free Next Door Cannabis Customer Mode comparison", () => {
  it("renders static branded education without Operator controls or private identifiers", () => {
    const { container } = render(
      <MemoryRouter>
        <CustomerOreozGelonadeGuide />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("customer-oreoz-gelonade-guide")).toHaveAttribute(
      "data-mode",
      "customer",
    );
    expect(screen.getByText(NEXT_DOOR_CUSTOMER_BRAND)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: /oreoz vs gelonade: what may differ/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/does not access Operator grow data/i)).toBeInTheDocument();
    expect(screen.queryByTestId("app-shell")).toBeNull();
    expect(screen.queryByRole("button", { name: /quick log/i })).toBeNull();
    expect(container.textContent).not.toMatch(
      /shareId|plant[_ -]?id|grow[_ -]?id|tent[_ -]?id|raw_payload/i,
    );
  });

  it("sets a self-canonical noindex document identity", () => {
    render(
      <MemoryRouter>
        <CustomerOreozGelonadeGuide />
      </MemoryRouter>,
    );
    expect(document.title).toBe(OREOZ_GELONADE_CUSTOMER_SEO.title);
    expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute(
      "content",
      "noindex, follow",
    );
    expect(document.head.querySelector('link[rel="canonical"]')).toHaveAttribute(
      "href",
      `https://verdantgrowdiary.com${NEXT_DOOR_CUSTOMER_COMPARISON_PATH}`,
    );
  });

  it("encodes and opens only the exact static customer path", () => {
    render(
      <MemoryRouter>
        <CustomerComparisonGuideQrOption origin="https://verdantgrowdiary.com" />
      </MemoryRouter>,
    );
    const expected = `https://verdantgrowdiary.com${NEXT_DOOR_CUSTOMER_COMPARISON_PATH}`;
    expect(screen.getByTestId("customer-comparison-guide-qr-url")).toHaveTextContent(expected);
    expect(screen.getByRole("link", { name: "Open customer guide" })).toHaveAttribute(
      "href",
      NEXT_DOOR_CUSTOMER_COMPARISON_PATH,
    );
    expect(screen.getByTestId("customer-comparison-guide-qr").querySelector("svg")).toBeTruthy();
    const encoded = new URL(expected);
    expect(encoded.pathname).toBe(NEXT_DOOR_CUSTOMER_COMPARISON_PATH);
    expect(encoded.search).toBe("");
    expect(encoded.hash).toBe("");
    expect(encoded.pathname.split("/").filter(Boolean)).toEqual([
      "customer",
      "guide",
      "oreoz-vs-gelonade-comparison",
    ]);
  });
});
