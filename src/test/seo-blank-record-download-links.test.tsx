/**
 * Blank observation record downloads (#2260 assets) linked from the grower
 * guides. Each link must point at a shipped public file, offer the file's own
 * name for download, and say plainly that the files are blank local records,
 * not Verdant imports or account saves. Static no-JS HTML and the hydrated
 * page must agree.
 */
import { createElement } from "react";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import GuidePage from "@/pages/GuidePage";
import {
  BLANK_OBSERVATION_RECORD_DOWNLOADS,
  VERDANT_SEO_GUIDES,
  findGuideBySlug,
} from "@/constants/verdantSeoContent";
import { STATIC_PUBLIC_SEO_DOCUMENTS } from "@/lib/build/staticPublicSeoDocuments";

const routeState = vi.hoisted(() => ({ slug: "" }));

vi.mock("@/lib/react-router-compat", () => ({
  Link: ({ to, children, ...props }: { to: string; children?: React.ReactNode }) =>
    createElement("a", { href: to, ...props }, children),
  Navigate: ({ to }: { to: string }) => createElement("span", { "data-redirect-to": to }),
  useLocation: () => ({ hash: "" }),
  useParams: () => ({ slug: routeState.slug }),
}));
vi.mock("@/components/DiaryFaqLinkStatsPanel", () => ({ default: () => null }));
vi.mock("@/components/customer/CustomerComparisonGuideQrOption", () => ({
  default: () => null,
}));

afterEach(() => {
  cleanup();
  document.querySelectorAll('script[type="application/ld+json"]').forEach((el) => el.remove());
});

const EXPECTED = [
  { href: "/downloads/blank-observation-record.csv", fileName: "blank-observation-record.csv" },
  { href: "/downloads/blank-observation-record.pdf", fileName: "blank-observation-record.pdf" },
  {
    href: "/downloads/blank-observation-record-instructions.txt",
    fileName: "blank-observation-record-instructions.txt",
  },
];

const LOCAL_RECORD_NOTICE = "not automatic Verdant imports";

function publicFile(href: string): string {
  return resolve(process.cwd(), "public", href.replace(/^\//, ""));
}

function guidesWithDownloads() {
  return VERDANT_SEO_GUIDES.filter((guide) =>
    guide.sections.some((section) => (section.downloads ?? []).length > 0),
  );
}

describe("blank observation record download data", () => {
  it("lists the three #2260 files with their own names", () => {
    expect(
      BLANK_OBSERVATION_RECORD_DOWNLOADS.map(({ href, fileName }) => ({ href, fileName })),
    ).toEqual(EXPECTED);
  });

  it("points only at files that ship in public/", () => {
    for (const { href } of BLANK_OBSERVATION_RECORD_DOWNLOADS) {
      expect(existsSync(publicFile(href)), href).toBe(true);
    }
  });

  it("describes the files the way they actually are", () => {
    const csv = readFileSync(publicFile(EXPECTED[0].href), "utf8").split("\r\n");
    expect(csv[0]).toBe(
      "date,local_time,time_zone,record_identifier,observation,photo_file_reference,source_reference,follow_up_note",
    );
    expect(csv[1]).toBe(",,,,,,,");
    expect(readFileSync(publicFile(EXPECTED[1].href)).subarray(0, 5).toString()).toBe("%PDF-");
    expect(readFileSync(publicFile(EXPECTED[2].href), "utf8")).toContain(
      "These are local records, not automatic Verdant imports.",
    );
  });

  it("only the template, no-account guides carry the files, each with the local-record notice", () => {
    expect(guidesWithDownloads().map((guide) => guide.slug)).toEqual([
      "grow-journal-template",
      "grow-journal-app-without-account",
    ]);
    for (const guide of guidesWithDownloads()) {
      const section = guide.sections.find((s) => (s.downloads ?? []).length > 0)!;
      expect(section.body).toContain(LOCAL_RECORD_NOTICE);
      expect(section.body).toMatch(/does not (add|save)/);
    }
  });

  it("drops the template guide's old 'not a download' wording", () => {
    const guide = findGuideBySlug("grow-journal-template")!;
    const copy = JSON.stringify(guide);
    expect(copy).not.toMatch(/not a download|no download/i);
    expect(copy).toContain("printable PDF");
  });

  it("links the app and checklist guides to the template page, not straight to files", () => {
    for (const slug of ["grow-diary-app", "daily-grow-log-checklist"]) {
      const links = findGuideBySlug(slug)!.sections.flatMap((s) => s.links ?? []);
      expect(links.map((link) => link.to)).toContain("/guides/grow-journal-template");
    }
  });
});

describe("blank observation record links in the static no-JS body", () => {
  it.each(["grow-journal-template", "grow-journal-app-without-account"])(
    "%s emits download anchors with filenames",
    (slug) => {
      const doc = STATIC_PUBLIC_SEO_DOCUMENTS.find((d) => d.path === `/guides/${slug}`);
      const html = new DOMParser().parseFromString(
        doc?.metadata.bodyFallbackHtml ?? "",
        "text/html",
      );
      for (const { href, fileName } of EXPECTED) {
        const anchor = html.querySelector(`a[href="${href}"]`);
        expect(anchor, href).not.toBeNull();
        expect(anchor?.getAttribute("download")).toBe(fileName);
      }
      expect(html.body.textContent).toContain(LOCAL_RECORD_NOTICE);
    },
  );
});

describe("blank observation record links on the hydrated guide", () => {
  it.each(["grow-journal-template", "grow-journal-app-without-account"])(
    "%s renders labelled download anchors",
    (slug) => {
      routeState.slug = slug;
      render(<GuidePage />);
      const list = screen.getByRole("list", { name: /blank record downloads/i });
      for (const { href, fileName } of EXPECTED) {
        const anchor = within(list)
          .getAllByRole("link")
          .find((a) => a.getAttribute("href") === href);
        expect(anchor, href).toBeDefined();
        expect(anchor).toHaveAttribute("download", fileName);
      }
      expect(within(list).getByRole("link", { name: /printable PDF/i })).toBeInTheDocument();
      expect(within(list).getByRole("link", { name: /blank CSV/i })).toBeInTheDocument();
    },
  );
});
