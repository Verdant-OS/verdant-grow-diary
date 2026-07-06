/**
 * PR A — public trust & SEO surface tests.
 *
 * Covers:
 *   1. Bottom "Explore the public demo" CTA on every /guides/:slug page.
 *   2. Visible sensor-source legend on /hardware-integrations with all six
 *      canonical labels + safety copy.
 *   3. Public /how-ai-doctor-works page: 12-field output contract, missing
 *      information section, grower-approved decisions block, no forbidden
 *      autopilot/device-control phrases, sitemap + manifest registration.
 *
 * Presenter-only assertions. No Supabase, no AI, no writes.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import GuidePage from "@/pages/GuidePage";
import HardwareIntegrations from "@/pages/HardwareIntegrations";
import HowAiDoctorWorks, {
  AI_DOCTOR_OUTPUT_FIELDS,
  AI_DOCTOR_MISSING_INFO_EXAMPLES,
  HOW_AI_DOCTOR_WORKS_PATH,
} from "@/pages/HowAiDoctorWorks";
import { VERDANT_SEO_GUIDES } from "@/constants/verdantSeoContent";
import { SENSOR_SOURCE_KINDS, SENSOR_SOURCE_SHORT_LABEL } from "@/constants/sensorSourceLabels";
import { APP_ROUTES } from "@/lib/appRouteManifest";

const FORBIDDEN = [
  "autopilot",
  "fully automated grow control",
  "ai controls your equipment",
  "automatic device control",
  "autonomous device control",
  "hands-free grow control",
  "set-and-forget automation",
  "controls your lights",
  "controls your fans",
  "controls irrigation",
  "controls humidifiers",
  "controls your equipment",
];

function renderGuide(slug: string) {
  return render(
    <MemoryRouter initialEntries={[`/guides/${slug}`]}>
      <Routes>
        <Route path="/guides/:slug" element={<GuidePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("PR A · guide bottom CTA to public demo", () => {
  it.each(VERDANT_SEO_GUIDES.map((g) => g.slug))(
    "renders the demo CTA on /guides/%s",
    (slug) => {
      const { getByTestId } = renderGuide(slug);
      const cta = getByTestId("guide-demo-cta");
      expect(cta.textContent).toMatch(/See a real One-Tent Loop before signing up/i);
      expect(cta.textContent).toMatch(/Quick Log/);
      expect(cta.textContent).toMatch(/grower-approved action queue/i);
      const link = getByTestId("guide-demo-cta-link") as HTMLAnchorElement;
      // Public route only. Never a protected app route.
      expect(link.getAttribute("href")).toBe("/welcome");
      for (const protectedPath of ["/dashboard", "/diary", "/plants", "/tents", "/actions"]) {
        expect(link.getAttribute("href")).not.toContain(protectedPath);
      }
      const lower = cta.textContent!.toLowerCase();
      for (const phrase of FORBIDDEN) {
        expect(lower.includes(phrase), `CTA copy contains "${phrase}"`).toBe(false);
      }
    },
  );
});

describe("PR A · sensor source legend on hardware integrations", () => {
  it("renders the section with all six canonical labels", () => {
    const { getByTestId } = render(
      <MemoryRouter>
        <HardwareIntegrations />
      </MemoryRouter>,
    );
    const legend = getByTestId("sensor-source-legend");
    for (const kind of SENSOR_SOURCE_KINDS) {
      const item = getByTestId(`sensor-source-legend-item-${kind}`);
      expect(item.textContent).toContain(SENSOR_SOURCE_SHORT_LABEL[kind]);
    }
    const text = legend.textContent!.toLowerCase();
    expect(text).toContain("csv");
    expect(text).toContain("demo");
    expect(text).toContain("never");
    expect(text).toMatch(/stale/);
    expect(text).toMatch(/invalid/);
    for (const phrase of FORBIDDEN) {
      expect(text.includes(phrase), `legend contains "${phrase}"`).toBe(false);
    }
  });
});

describe("PR A · /how-ai-doctor-works public page", () => {
  it("renders without auth (public route)", () => {
    const { getByTestId } = render(
      <MemoryRouter initialEntries={[HOW_AI_DOCTOR_WORKS_PATH]}>
        <Routes>
          <Route path={HOW_AI_DOCTOR_WORKS_PATH} element={<HowAiDoctorWorks />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(getByTestId("how-ai-doctor-works-page")).toBeTruthy();
  });

  it("renders all 12 AI Doctor output-contract fields", () => {
    expect(AI_DOCTOR_OUTPUT_FIELDS).toHaveLength(12);
    const { getByTestId } = render(
      <MemoryRouter>
        <HowAiDoctorWorks />
      </MemoryRouter>,
    );
    const list = getByTestId("ai-doctor-output-fields");
    for (const field of AI_DOCTOR_OUTPUT_FIELDS) {
      expect(list.textContent).toContain(field.title);
    }
  });

  it("renders the missing-information examples", () => {
    const { getByTestId } = render(
      <MemoryRouter>
        <HowAiDoctorWorks />
      </MemoryRouter>,
    );
    const list = getByTestId("ai-doctor-missing-info-examples");
    for (const example of AI_DOCTOR_MISSING_INFO_EXAMPLES) {
      expect(list.textContent).toContain(example);
    }
  });

  it("renders the grower-approved-decisions block and says AI does not control equipment", () => {
    const { getByTestId } = render(
      <MemoryRouter>
        <HowAiDoctorWorks />
      </MemoryRouter>,
    );
    const block = getByTestId("grower-approved-decisions");
    expect(block.textContent).toMatch(/grower decides/i);
    expect(block.textContent).toMatch(/approval-required/i);
    expect(block.textContent!.toLowerCase()).toContain("does not control");
    expect(block.textContent!.toLowerCase()).toContain("cannot touch equipment");
  });

  it("carries no forbidden autopilot/device-control language", () => {
    const { container } = render(
      <MemoryRouter>
        <HowAiDoctorWorks />
      </MemoryRouter>,
    );
    const lower = container.textContent!.toLowerCase();
    for (const phrase of FORBIDDEN) {
      expect(lower.includes(phrase), `page contains "${phrase}"`).toBe(false);
    }
  });

  it("route is registered in the app route manifest as public", () => {
    const entry = APP_ROUTES.find((r) => r.path === HOW_AI_DOCTOR_WORKS_PATH);
    expect(entry).toBeDefined();
    expect(entry?.access).toBe("public");
  });

  it("route is listed in sitemap.xml", () => {
    const sitemap = readFileSync(
      resolve(__dirname, "../../public/sitemap.xml"),
      "utf8",
    );
    expect(sitemap).toContain(
      `<loc>https://verdantgrowdiary.com${HOW_AI_DOCTOR_WORKS_PATH}</loc>`,
    );
  });

  it("robots.txt does not disallow /how-ai-doctor-works", () => {
    const robots = readFileSync(
      resolve(__dirname, "../../public/robots.txt"),
      "utf8",
    );
    const disallows = robots
      .split(/\r?\n/)
      .map((l) => l.replace(/#.*$/, "").trim())
      .filter((l) => /^Disallow:/i.test(l))
      .map((l) => l.replace(/^Disallow:\s*/i, "").trim());
    for (const rule of disallows) {
      if (!rule) continue;
      const trimmed = rule.replace(/\*$/, "");
      expect(
        HOW_AI_DOCTOR_WORKS_PATH === trimmed ||
          HOW_AI_DOCTOR_WORKS_PATH.startsWith(trimmed + "/") ||
          (trimmed !== "/" && HOW_AI_DOCTOR_WORKS_PATH.startsWith(trimmed)),
        `robots blocks ${HOW_AI_DOCTOR_WORKS_PATH} via "${rule}"`,
      ).toBe(false);
    }
  });
});
