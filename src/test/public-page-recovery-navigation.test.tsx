import type { ReactElement } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";

import Glossary from "@/pages/Glossary";
import PartnerCsvPreviewLanding from "@/pages/PartnerCsvPreviewLanding";
import PhenoComparison from "@/pages/PhenoComparison";
import PhenoExpressionShowcase from "@/pages/PhenoExpressionShowcase";
import SensorCsvPreview from "@/pages/SensorCsvPreview";

interface PublicPageCase {
  label: string;
  path: string;
  page: ReactElement;
}

const PUBLIC_PAGES: PublicPageCase[] = [
  { label: "Glossary", path: "/glossary", page: <Glossary /> },
  { label: "Pheno Comparison", path: "/pheno-comparison", page: <PhenoComparison /> },
  {
    label: "Pheno Expression Showcase",
    path: "/pheno-expression-showcase",
    page: <PhenoExpressionShowcase />,
  },
  {
    label: "Partner CSV Preview",
    path: "/partners/csv-preview",
    page: <PartnerCsvPreviewLanding />,
  },
  {
    label: "Sensor CSV Preview",
    path: "/sensors/csv-preview",
    page: <SensorCsvPreview />,
  },
];

function renderPublicPage(testCase: PublicPageCase) {
  return render(
    <MemoryRouter initialEntries={[testCase.path]}>
      <Routes>
        <Route path={testCase.path} element={testCase.page} />
        <Route path="/welcome" element={<p data-testid="recovered-home">Verdant home</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("standalone public page recovery navigation", () => {
  it.each(PUBLIC_PAGES)(
    "$label exposes focusable Home, Terms, and Privacy links on initial render",
    async (testCase) => {
      const user = userEvent.setup();
      renderPublicPage(testCase);

      const recovery = screen.getByTestId("public-page-recovery");
      const home = within(recovery).getByRole("link", { name: "Home" });
      const terms = within(recovery).getByRole("link", { name: "Terms" });
      const privacy = within(recovery).getByRole("link", { name: "Privacy" });

      expect(home).toHaveAttribute("href", "/welcome");
      expect(terms).toHaveAttribute("href", "/terms");
      expect(privacy).toHaveAttribute("href", "/privacy");

      home.focus();
      expect(home).toHaveFocus();

      await user.click(home);
      expect(screen.getByTestId("recovered-home")).toBeInTheDocument();
    },
  );
});
