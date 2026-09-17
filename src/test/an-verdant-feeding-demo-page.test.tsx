/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import AnVerdantFeedingDemo from "@/pages/AnVerdantFeedingDemo";
import { resetAnVerdantDemoSaveCache } from "@/lib/partners/advancedNutrients/anVerdantFeedingDemoRules";
import { AN_DEMO_CATALOG_DISCLOSURE } from "@/lib/partners/advancedNutrients/demoCatalog";
import {
  AN_VERDANT_DEMO_DISCLOSURE,
  AN_VERDANT_DEMO_HEADER,
  AN_VERDANT_MISSING_SENSOR_COPY,
} from "@/lib/partners/advancedNutrients/anVerdantFeedingDemoCopy";

describe("AnVerdantFeedingDemo page", () => {
  beforeEach(() => {
    resetAnVerdantDemoSaveCache();
  });

  it("renders disclosure, catalog label, and real Quick Log feeding form", () => {
    render(<AnVerdantFeedingDemo />);
    expect(screen.getByTestId("an-verdant-feeding-demo-page")).toBeTruthy();
    expect(screen.getByText(AN_VERDANT_DEMO_HEADER)).toBeTruthy();
    expect(screen.getByTestId("an-verdant-demo-disclosure").textContent).toBe(
      AN_VERDANT_DEMO_DISCLOSURE,
    );
    expect(screen.getByTestId("an-verdant-demo-plant-label").textContent).toMatch(/Demo Plant/);
    expect(screen.getByTestId("qlv2-feeding-form")).toBeTruthy();
    expect(screen.getByTestId("an-verdant-demo-catalog-disclosure").textContent).toBe(
      AN_DEMO_CATALOG_DISCLOSURE,
    );
  });

  it("happy path: select product, enter amount/volume, save, show AI + AQ approval", () => {
    render(<AnVerdantFeedingDemo />);

    fireEvent.click(screen.getByTestId("an-verdant-catalog-product-an-demo-ph-perfect-grow"));

    fireEvent.change(screen.getByLabelText(/Applied volume/i), { target: { value: "800" } });
    fireEvent.change(screen.getByLabelText(/Product 1 amount/i), { target: { value: "4" } });

    fireEvent.click(screen.getByTestId("an-verdant-demo-save"));

    expect(screen.getByTestId("an-verdant-demo-timeline-summary").textContent).toMatch(
      /pH Perfect Grow/,
    );
    expect(screen.getByTestId("an-verdant-demo-evidence-summary")).toBeTruthy();

    fireEvent.click(screen.getByTestId("an-verdant-demo-open-ai"));
    expect(screen.getByTestId("an-verdant-ai-observed")).toBeTruthy();
    expect(screen.getByTestId("an-verdant-ai-inferred")).toBeTruthy();
    expect(screen.getByTestId("an-verdant-ai-unknown")).toBeTruthy();
    expect(screen.getByTestId("an-verdant-ai-causation-fence").textContent).toMatch(/causation/i);

    fireEvent.click(screen.getByTestId("an-verdant-demo-open-aq"));
    expect(screen.getByTestId("an-verdant-aq-status").textContent).toMatch(/pending_approval/);
    expect(screen.getByTestId("ai-doctor-action-suggestion-review-gate")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /execute|run device|approve & run/i })).toBeNull();
  });

  it("missing sensor path shows honest missing copy on event detail", () => {
    render(<AnVerdantFeedingDemo />);
    fireEvent.click(screen.getByTestId("an-verdant-catalog-product-an-demo-big-bud"));
    fireEvent.change(screen.getByLabelText(/Applied volume/i), { target: { value: "500" } });
    fireEvent.change(screen.getByLabelText(/Product 1 amount/i), { target: { value: "2" } });
    fireEvent.click(screen.getByTestId("an-verdant-sensor-missing"));
    fireEvent.click(screen.getByTestId("an-verdant-demo-save"));

    expect(screen.getByTestId("an-verdant-event-sensor").textContent).toBe(
      AN_VERDANT_MISSING_SENSOR_COPY,
    );
  });

  it("stale sensor path is labeled stale, not healthy", () => {
    render(<AnVerdantFeedingDemo />);
    fireEvent.click(screen.getByTestId("an-verdant-catalog-product-an-demo-overdrive"));
    fireEvent.change(screen.getByLabelText(/Applied volume/i), { target: { value: "450" } });
    fireEvent.change(screen.getByLabelText(/Product 1 amount/i), { target: { value: "1" } });
    fireEvent.click(screen.getByTestId("an-verdant-sensor-stale"));
    fireEvent.click(screen.getByTestId("an-verdant-demo-save"));

    const sensor = screen.getByTestId("an-verdant-event-sensor").textContent ?? "";
    expect(sensor).toMatch(/stale/i);
    expect(sensor).toMatch(/not treated as current or healthy/i);
    expect(sensor).not.toMatch(/\blive\b/i);
  });

  it("non-catalog typed product still saves without treating catalog as the event source", () => {
    render(<AnVerdantFeedingDemo />);
    fireEvent.change(screen.getByLabelText(/Nutrient line/i), {
      target: { value: "manual-line" },
    });
    fireEvent.change(screen.getByLabelText(/Applied volume/i), { target: { value: "300" } });
    fireEvent.change(screen.getByLabelText(/Product 1 name/i), {
      target: { value: "House CalMag" },
    });
    fireEvent.change(screen.getByLabelText(/Product 1 amount/i), { target: { value: "5" } });
    fireEvent.click(screen.getByTestId("an-verdant-demo-save"));

    const detail = screen.getByTestId("an-verdant-demo-event-detail");
    expect(within(detail).getByText(/House CalMag/)).toBeTruthy();
    expect(within(detail).getByText(/user_entered/)).toBeTruthy();
  });
});
