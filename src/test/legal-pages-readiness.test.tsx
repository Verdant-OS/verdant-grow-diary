/**
 * Paddle legal-page readiness: /terms, /privacy, /refund.
 *
 * Pins the disclosures Paddle review and users must be able to find
 * (seller, Merchant of Record, 30-day money-back guarantee, paddle.net
 * instructions), the redirect aliases, footer discoverability on every
 * public/app/customer surface, sitemap/robots discoverability, forbidden
 * claims, and a frontend secret scan over the new files.
 *
 * Not legal advice — these tests pin product copy, not legal sufficiency.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Navigate, Route, Routes } from "react-router-dom";
import TermsOfService from "@/pages/TermsOfService";
import PrivacyPolicy from "@/pages/PrivacyPolicy";
import RefundPolicy from "@/pages/RefundPolicy";
import { VERDANT_FORBIDDEN_PUBLIC_PHRASES } from "@/constants/verdantSeoCopy";

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

const TERMS_SRC = read("src/pages/TermsOfService.tsx");
const PRIVACY_SRC = read("src/pages/PrivacyPolicy.tsx");
const REFUND_SRC = read("src/pages/RefundPolicy.tsx");
const SHELL_SRC = read("src/pages/legal/LegalPageShell.tsx");
const FOOTER_SRC = read("src/components/LegalFooterLinks.tsx");
const APP_SRC = read("src/App.tsx");
const SITEMAP = read("public/sitemap.xml");
const ROBOTS = read("public/robots.txt");
const NEW_FILES = [
  { name: "TermsOfService", src: TERMS_SRC },
  { name: "PrivacyPolicy", src: PRIVACY_SRC },
  { name: "RefundPolicy", src: REFUND_SRC },
  { name: "LegalPageShell", src: SHELL_SRC },
  { name: "LegalFooterLinks", src: FOOTER_SRC },
];

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/terms" element={<TermsOfService />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/refund" element={<RefundPolicy />} />
        <Route path="/terms-of-service" element={<Navigate to="/terms" replace />} />
        <Route path="/privacy-policy" element={<Navigate to="/privacy" replace />} />
        <Route path="/refunds" element={<Navigate to="/refund" replace />} />
        <Route path="/refund-policy" element={<Navigate to="/refund" replace />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("/terms disclosures", () => {
  it("loads and names the seller Matthew Tyler Cheek", () => {
    renderAt("/terms");
    expect(screen.getByRole("heading", { name: /terms of service/i, level: 1 })).toBeInTheDocument();
    expect(screen.getAllByText(/Matthew Tyler Cheek/).length).toBeGreaterThan(0);
  });

  it("includes the Paddle Merchant of Record disclosure", () => {
    renderAt("/terms");
    expect(screen.getAllByText(/Merchant of Record/i).length).toBeGreaterThan(0);
    expect(TERMS_SRC).toMatch(/Merchant of Record for all our orders/i);
  });

  it("includes the software-only / no regulated goods disclaimer", () => {
    renderAt("/terms");
    expect(TERMS_SRC).toMatch(/software-only/i);
    expect(TERMS_SRC).toMatch(/does not sell\s+cannabis, seeds, or cultivation equipment/i);
  });

  it("covers acceptance, account, acceptable use, AI caution, no equipment-control promise, IP, availability, termination, liability", () => {
    for (const re of [
      /Acceptance/i,
      /Account credentials/i,
      /Acceptable use/i,
      /AI features and cautious guidance/i,
      /not a\s+substitute for professional/i,
      /will not execute automated device\s+actions without your explicit approval/i,
      /Intellectual property/i,
      /Service level/i,
      /Suspension and termination/i,
      /Liability/i,
    ]) {
      expect(TERMS_SRC).toMatch(re);
    }
  });

  it("links to /privacy and /refund (via the shared legal shell nav)", () => {
    expect(SHELL_SRC).toMatch(/to="\/privacy"/);
    expect(SHELL_SRC).toMatch(/to="\/refund"/);
    expect(TERMS_SRC).toMatch(/LegalPageShell/);
  });
});

describe("/privacy disclosures", () => {
  it("loads and names Matthew Tyler Cheek as controller/operator", () => {
    renderAt("/privacy");
    expect(screen.getByRole("heading", { name: /privacy policy/i, level: 1 })).toBeInTheDocument();
    expect(screen.getAllByText(/Matthew Tyler Cheek/).length).toBeGreaterThan(0);
    expect(PRIVACY_SRC).toMatch(/data controller|the "Seller"/i);
  });

  it("explicitly names Paddle as processor / Merchant of Record and never claims card storage", () => {
    renderAt("/privacy");
    expect(screen.getAllByText(/Merchant of Record/i).length).toBeGreaterThan(0);
    expect(PRIVACY_SRC).toMatch(/Paddle/);
    expect(PRIVACY_SRC).not.toMatch(/we (receive|store) your (full )?card/i);
  });

  it("covers data categories, purposes, legal bases, retention, rights, security, cookies, transfers", () => {
    for (const re of [
      /What personal data we collect/i,
      /Why we process it \(purposes and legal bases\)/i,
      /Who we share data with/i,
      /International transfers/i,
      /Data retention/i,
      /Your rights/i,
      /Security/i,
      /Cookies/i,
      /Contact/i,
    ]) {
      expect(PRIVACY_SRC).toMatch(re);
    }
  });

  it("links to /terms and /refund (via the shared legal shell nav)", () => {
    expect(SHELL_SRC).toMatch(/to="\/terms"/);
    expect(SHELL_SRC).toMatch(/to="\/refund"/);
    expect(PRIVACY_SRC).toMatch(/LegalPageShell/);
  });
});

describe("/refund disclosures", () => {
  it("loads and includes the 30-day money-back guarantee", () => {
    renderAt("/refund");
    expect(screen.getByRole("heading", { name: /refund policy/i })).toBeInTheDocument();
    expect(screen.getAllByText(/30-day money-back guarantee/i).length).toBeGreaterThan(0);
  });

  it("gives Paddle / paddle.net refund instructions", () => {
    renderAt("/refund");
    expect(screen.getByText(/paddle\.net/i)).toBeInTheDocument();
    expect(REFUND_SRC).toMatch(/Merchant of Record/);
  });

  it("explains cancellation vs refund and covers Founder Lifetime consistently", () => {
    expect(REFUND_SRC).toMatch(/Subscription cancellation/i);
    expect(REFUND_SRC).toMatch(/Founder Lifetime/);
    expect(REFUND_SRC).toMatch(/within the 30-day window/i);
  });

  it("links to /terms and /privacy (via the shared legal shell nav)", () => {
    expect(SHELL_SRC).toMatch(/to="\/terms"/);
    expect(SHELL_SRC).toMatch(/to="\/privacy"/);
    expect(REFUND_SRC).toMatch(/LegalPageShell/);
  });
});

describe("redirect aliases", () => {
  const cases: Array<[string, RegExp]> = [
    ["/terms-of-service", /terms of service/i],
    ["/privacy-policy", /privacy policy/i],
    ["/refunds", /refund policy/i],
    ["/refund-policy", /refund policy/i],
  ];
  for (const [alias, heading] of cases) {
    it(`${alias} resolves to its canonical legal page`, () => {
      renderAt(alias);
      expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
    });
  }

  it("App.tsx wires all four aliases as Navigate redirects", () => {
    expect(APP_SRC).toMatch(/path="\/terms-of-service" element=\{<Navigate to="\/terms" replace/);
    expect(APP_SRC).toMatch(/path="\/privacy-policy" element=\{<Navigate to="\/privacy" replace/);
    expect(APP_SRC).toMatch(/path="\/refunds" element=\{<Navigate to="\/refund" replace/);
    expect(APP_SRC).toMatch(/path="\/refund-policy" element=\{<Navigate to="\/refund" replace/);
  });

  it("App.tsx mounts /terms /privacy /refund as public routes", () => {
    expect(APP_SRC).toMatch(/path="\/terms" element=\{<Terms/);
    expect(APP_SRC).toMatch(/path="\/privacy" element=\{<Privacy/);
    expect(APP_SRC).toMatch(/path="\/refund" element=\{<Refund/);
  });
});

describe("footer discoverability", () => {
  it("shared LegalFooterLinks component links all three legal pages", () => {
    expect(FOOTER_SRC).toMatch(/\{ to: "\/terms", label: "Terms" \}/);
    expect(FOOTER_SRC).toMatch(/\{ to: "\/privacy", label: "Privacy" \}/);
    expect(FOOTER_SRC).toMatch(/\{ to: "\/refund", label: "Refunds" \}/);
  });

  // Landing/Pricing carry inline legal navs; the remaining surfaces render
  // the shared component. Either way every surface must link all three.
  for (const [surface, file] of [
    ["Landing", "src/pages/Landing.tsx"],
    ["Pricing", "src/pages/Pricing.tsx"],
    ["HardwareIntegrations", "src/pages/HardwareIntegrations.tsx"],
    ["AppShell", "src/components/AppShell.tsx"],
    ["CustomerModeGuide", "src/pages/CustomerModeGuide.tsx"],
  ] as const) {
    it(`${surface} footer links /terms /privacy /refund`, () => {
      const src = read(file);
      const linksAllThree =
        /to="\/terms"/.test(src) && /to="\/privacy"/.test(src) && /to="\/refund"/.test(src);
      const usesShared = /<LegalFooterLinks/.test(src);
      expect(linksAllThree || usesShared, `${surface} must link the legal pages`).toBe(true);
    });
  }
});

describe("sitemap + robots discoverability", () => {
  it("sitemap contains canonical /terms /privacy /refund entries", () => {
    expect(SITEMAP).toContain("<loc>https://verdantgrowdiary.com/terms</loc>");
    expect(SITEMAP).toContain("<loc>https://verdantgrowdiary.com/privacy</loc>");
    expect(SITEMAP).toContain("<loc>https://verdantgrowdiary.com/refund</loc>");
  });

  it("sitemap keeps /welcome and /pricing discoverable", () => {
    expect(SITEMAP).toContain("<loc>https://verdantgrowdiary.com/welcome</loc>");
    expect(SITEMAP).toContain("<loc>https://verdantgrowdiary.com/pricing</loc>");
  });

  it("robots references the sitemap and never disallows the legal pages", () => {
    expect(ROBOTS).toMatch(/Sitemap: https:\/\/verdantgrowdiary\.com\/sitemap\.xml/);
    expect(ROBOTS).not.toMatch(/Disallow: \/terms/);
    expect(ROBOTS).not.toMatch(/Disallow: \/privacy/);
    expect(ROBOTS).not.toMatch(/Disallow: \/refund/);
  });
});

describe("forbidden claims + secret scan", () => {
  it("legal pages never say all sales final / autopilot / guaranteed yield / AI grows for you", () => {
    for (const f of NEW_FILES) {
      expect(f.src, f.name).not.toMatch(/all sales final/i);
      expect(f.src, f.name).not.toMatch(/autopilot/i);
      expect(f.src, f.name).not.toMatch(/guaranteed yield/i);
      expect(f.src, f.name).not.toMatch(/AI grows for you/i);
    }
  });

  it("legal pages never claim Verdant sells cannabis/seeds/equipment (only negations)", () => {
    for (const f of [TERMS_SRC, PRIVACY_SRC, REFUND_SRC]) {
      const hits = [...f.matchAll(/sell(s|ing)? cannabis/gi)];
      for (const m of hits) {
        const before = f.slice(Math.max(0, m.index! - 60), m.index!);
        expect(/not|never/i.test(before), `non-negated sales claim: …${before}[${m[0]}]`).toBe(true);
      }
    }
  });

  it("legal pages avoid every forbidden public phrase", () => {
    for (const f of NEW_FILES) {
      for (const phrase of VERDANT_FORBIDDEN_PUBLIC_PHRASES) {
        expect(f.src.toLowerCase(), `${f.name}: ${phrase}`).not.toContain(phrase.toLowerCase());
      }
    }
  });

  it("no secrets in the new frontend files", () => {
    for (const f of NEW_FILES) {
      expect(f.src, f.name).not.toMatch(/service_role/i);
      expect(f.src, f.name).not.toMatch(/PADDLE_(API|WEBHOOK|SECRET)/i);
      expect(f.src, f.name).not.toMatch(/webhook.secret/i);
      expect(f.src, f.name).not.toMatch(/bearer\s+[A-Za-z0-9._-]{10,}/i);
      expect(f.src, f.name).not.toMatch(/vbt_[A-Za-z0-9]/);
      expect(f.src, f.name).not.toMatch(/eyJ[A-Za-z0-9_-]{8,}\./);
      expect(f.src, f.name).not.toMatch(/pri_[a-z0-9]{6,}/);
    }
  });
});
