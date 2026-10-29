import { createRoot } from "react-dom/client";
import { MemoryRouter } from "../../src/test/helpers/reactRouterCompat.vitest";
import PlantDetailSectionNav from "../../src/components/PlantDetailSectionNav";
import { usePlantDetailDisclosureNavigation } from "../../src/hooks/usePlantDetailDisclosureNavigation";

// Layout-only fixture: real navigation components, no auth, data, or network IO.
export function OverviewJumpFixture() {
  const { openGroups, revealAndNavigate } = usePlantDetailDisclosureNavigation({
    plantId: "overview-jump-layout-fixture",
  });
  return (
    <>
      <header>Navigation test fixture — no grow data</header>
      <div className="lead-in" />
      <PlantDetailSectionNav hasAssignedTent onRevealAndNavigate={revealAndNavigate} />
      <section id="plant-overview" tabIndex={-1}>
        <h2>Overview fixture</h2>
        <div className="overview-content">Tall Overview content</div>
      </section>
      {openGroups.history && <section id="plant-relative-timeline">Timeline fixture</section>}
      <section id="plant-alerts">Alerts fixture</section>
      <section id="plant-actions">Actions fixture</section>
      {openGroups.ai && <section id="plant-doctor">Doctor fixture</section>}
      <section id="plant-ai-doctor-review">Doctor review fixture</section>
      <div className="tail" />
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <MemoryRouter initialEntries={[`/plants/overview-jump-layout-fixture${window.location.hash}`]}>
    <OverviewJumpFixture />
  </MemoryRouter>,
);
