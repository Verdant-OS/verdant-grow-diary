/**
 * Search-to-first-value guide cluster — contract tests.
 *
 * Six guides funnel organic search traffic to the public Quick Log starter
 * (/quick-log). This file pins the cluster's load-bearing contract:
 *  - the six slugs exist as published guides,
 *  - every guide→starter CTA href carries EXACTLY the fixed attribution
 *    (utm_source=organic_guide, utm_medium=owned,
 *    utm_campaign=search_to_first_value, utm_content=<slug>),
 *  - the builder can never emit params outside the UTM allow-list (PII-free
 *    by construction — values are static constants + the static guide slug),
 *  - GuidePage renders the starter CTA from the builder for every guide,
 *  - cluster copy holds the capability-truth line: claims about the starter
 *    pair "no account" with the on-device draft truth, and no guide implies
 *    an automatic draft import (the authed handoff is not wired).
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import GuidePage from "@/pages/GuidePage";
import {
  findGuideBySlug,
  VERDANT_GUIDE_SLUGS,
  VERDANT_SEO_GUIDES,
} from "@/constants/verdantSeoContent";
import {
  buildGuideQuickLogStarterHref,
  GUIDE_TO_STARTER_UTM,
  PUBLIC_QUICK_LOG_STARTER_PATH,
} from "@/lib/quickLogStarterLinks";
import { SAFE_UTM_KEYS } from "@/lib/utm/preserveUtm";

const CLUSTER_SLUGS = [
  "how-to-start-a-grow-journal",
  "what-to-log-in-a-grow-journal",
  "grow-journal-template",
  "plant-watering-log",
  "grow-journal-app-without-account",
  "daily-grow-log-checklist",
] as const;

function renderGuide(slug: string) {
  return render(
    <MemoryRouter initialEntries={[`/guides/${slug}`]}>
      <Routes>
        <Route path="/guides/:slug" element={<GuidePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("cluster slugs", () => {
  it("all six cluster guides are published", () => {
    for (const slug of CLUSTER_SLUGS) {
      expect(VERDANT_GUIDE_SLUGS, `slug ${slug} published`).toContain(slug);
      expect(findGuideBySlug(slug)).not.toBeNull();
    }
  });

  it("every cluster guide's body mentions the starter path", () => {
    for (const slug of CLUSTER_SLUGS) {
      const g = findGuideBySlug(slug)!;
      const text = [g.intro, ...g.sections.map((s) => s.body), ...g.faq.map((f) => f.answer)].join(
        "\n",
      );
      expect(text, `${slug} references /quick-log`).toContain("/quick-log");
    }
  });
});

describe("fixed attribution contract (the exact literals the funnel reports on)", () => {
  it("pins the campaign constants", () => {
    expect(GUIDE_TO_STARTER_UTM).toEqual({
      utm_source: "organic_guide",
      utm_medium: "owned",
      utm_campaign: "search_to_first_value",
    });
  });

  it("emits the exact href for every cluster slug", () => {
    for (const slug of CLUSTER_SLUGS) {
      expect(buildGuideQuickLogStarterHref(slug)).toBe(
        `/quick-log?utm_source=organic_guide&utm_medium=owned&utm_campaign=search_to_first_value&utm_content=${slug}`,
      );
    }
  });

  it("targets the starter's pinned public path", () => {
    expect(buildGuideQuickLogStarterHref("x").startsWith(`${PUBLIC_QUICK_LOG_STARTER_PATH}?`)).toBe(
      true,
    );
  });

  it("never emits params outside the UTM allow-list (PII-free by construction)", () => {
    for (const slug of VERDANT_GUIDE_SLUGS) {
      const href = buildGuideQuickLogStarterHref(slug);
      const params = new URLSearchParams(href.split("?")[1]);
      for (const key of params.keys()) {
        expect(
          (SAFE_UTM_KEYS as ReadonlyArray<string>).includes(key),
          `param ${key} must be an allow-listed UTM key`,
        ).toBe(true);
      }
      expect(params.get("utm_content")).toBe(slug);
    }
  });
});

describe("GuidePage renders the starter CTA from the builder", () => {
  // One cluster guide + one pre-existing guide: the CTA is the shared
  // funnel step on every guide page, attributed per-slug.
  for (const slug of ["how-to-start-a-grow-journal", "grow-diary-app"]) {
    it(`${slug}: starter CTA links with per-slug attribution`, () => {
      renderGuide(slug);
      const cta = screen.getByTestId("guide-starter-cta-link");
      expect(cta).toHaveAttribute("href", buildGuideQuickLogStarterHref(slug));
      // Honest CTA copy: no-account claim rides with the on-device truth.
      const block = screen.getByTestId("guide-starter-cta");
      expect(block.textContent).toMatch(/no account needed/i);
      expect(block.textContent).toMatch(/stays on your device/i);
    });
  }
});

describe("capability-truth: cluster copy never overpromises", () => {
  it("no cluster guide implies an automatic draft import into an account", () => {
    for (const slug of CLUSTER_SLUGS) {
      const g = findGuideBySlug(slug)!;
      const text = [
        g.title,
        g.description,
        g.intro,
        ...g.sections.map((s) => `${s.heading} ${s.body}`),
        ...g.faq.map((f) => `${f.question} ${f.answer}`),
      ]
        .join("\n")
        .toLowerCase();
      for (const banned of [
        "automatically import",
        "imports your draft",
        "draft is imported",
        "auto-import",
        "synced to your account",
        "backed up to your account",
        // Transfer language that implies a 1:1 field handoff or a
        // signup-terminated draft lifecycle (neither is shipped behavior).
        "carry straight into",
        "carries straight into",
        "carries over",
        "transfers automatically",
        "until you sign up",
      ]) {
        expect(text, `${slug} must not claim "${banned}"`).not.toContain(banned);
      }
    }
  });

  it("guides pairing the draft with signup state the explicit review-and-save posture", () => {
    // Positive counterpart to the denylist above: whenever cluster copy
    // mentions both the local draft and signing up, it must state that the
    // grower acts explicitly (review/save/keep/decide) — the draft never
    // moves on its own.
    for (const slug of CLUSTER_SLUGS) {
      const g = findGuideBySlug(slug)!;
      const text = [
        g.description,
        g.intro,
        ...g.sections.map((s) => s.body),
        ...g.faq.map((f) => `${f.question} ${f.answer}`),
      ]
        .join("\n")
        .toLowerCase();
      const mentionsDraft = text.includes("draft");
      const mentionsSignup =
        /sign up|signing up|signup|sign in|create a free|creating an account|free account/.test(
          text,
        );
      if (mentionsDraft && mentionsSignup) {
        expect(
          /you decide|until you keep it|you choose to|choose to add|review and save|save it into your diary yourself|nothing transfers on its own/.test(
            text,
          ),
          `${slug}: draft+signup copy must state the explicit review/save posture`,
        ).toBe(true);
      }
    }
  });

  it("every no-account claim pairs with the on-device truth in the same passage", () => {
    // Per-passage, not per-guide: descriptions render standalone on the
    // guides index and as SEO metadata, and FAQ answers render standalone
    // in FAQPage JSON-LD — a device disclosure elsewhere in the guide
    // cannot rescue a passage that omits it.
    for (const slug of CLUSTER_SLUGS) {
      const g = findGuideBySlug(slug)!;
      const passages: Array<[string, string]> = [
        ["description", g.description],
        ["intro", g.intro],
        ...g.sections.map(
          (s, i) => [`section[${i}]`, `${s.heading} ${s.body}`] as [string, string],
        ),
        ...g.faq.map(
          (f, i) => [`faq[${i}]`, `${f.question} ${f.answer}`] as [string, string],
        ),
      ];
      for (const [label, raw] of passages) {
        const text = raw.toLowerCase();
        if (/no account|no-account|without an account|account-less/.test(text)) {
          expect(
            /your device|your browser|this browser|this device|local storage/.test(text),
            `${slug} ${label}: a no-account claim must state where the draft lives in the same passage`,
          ).toBe(true);
        }
      }
    }
  });

  it("cluster guides keep the grower-decides posture when mentioning AI", () => {
    for (const slug of CLUSTER_SLUGS) {
      const g = findGuideBySlug(slug)!;
      const text = [g.intro, ...g.sections.map((s) => s.body), ...g.faq.map((f) => f.answer)]
        .join("\n")
        .toLowerCase();
      if (text.includes("ai doctor")) {
        expect(
          /approval|grower decides|you stay the one who decides|waits for your approval/.test(text),
          `${slug}: AI Doctor mentions must carry the approval-required posture`,
        ).toBe(true);
      }
    }
  });
});
