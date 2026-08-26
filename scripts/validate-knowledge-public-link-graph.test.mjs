import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  KNOWLEDGE_GRAPH_REPORT_FILE,
  extractCrawlableInternalLinks,
  loadBuiltPublicPages,
  normalizePublicPath,
  validateBuiltKnowledgePublicLinkGraph,
  validateKnowledgePublicLinkGraph,
} from "./validate-knowledge-public-link-graph.mjs";

const ORIGIN = "https://verdantgrowdiary.com";

function anchor(href, extra = "") {
  return `<a ${extra} href="${href}">destination</a>`;
}

function page(path, links = [], overrides = {}) {
  return {
    path,
    canonical: `${ORIGIN}${path}`,
    robots: "index, follow",
    html: `<!doctype html><html><body>${links.join("")}</body></html>`,
    ...overrides,
  };
}

function passingPages() {
  return [
    page("/", [anchor("/guides")]),
    page("/welcome", [anchor("/guides"), anchor("/glossary"), anchor("/tools/blueprint-targets")]),
    page("/guides", [anchor("/welcome"), anchor("/cultivars"), anchor("/tools/vpd-calculator")]),
    page("/glossary", [anchor("/guides")]),
    page("/tools/blueprint-targets", [anchor("/guides")]),
    page("/tools/vpd-calculator", [anchor("/guides")]),
    page("/cultivars", [anchor("/cultivars/oreoz")]),
    page("/cultivars/oreoz", [anchor("/cultivars")]),
  ];
}

test("accepts an SSR graph with zero Knowledge orphans and bounded root reachability", () => {
  const report = validateKnowledgePublicLinkGraph({ origin: ORIGIN, pages: passingPages() });
  assert.equal(report.status, "PASS");
  assert.deepEqual(report.problems, []);
  assert.equal(report.totals.knowledgeDocuments, 6);
  assert.equal(report.totals.reachableKnowledgeDocuments, 6);
  assert.equal(report.pages.find((entry) => entry.path === "/glossary")?.depth, 2);
  assert.equal(report.pages.find((entry) => entry.path === "/tools/blueprint-targets")?.depth, 2);
});

test("fails the pre-repair graph when glossary and target bands have no rendered inbound links", () => {
  const pages = passingPages().map((entry) =>
    entry.path === "/welcome" ? page("/welcome", []) : entry,
  );
  const report = validateKnowledgePublicLinkGraph({ origin: ORIGIN, pages });
  assert.equal(report.status, "FAIL");
  assert.deepEqual(
    report.problems.filter((problem) => /(?:glossary|blueprint-targets)/.test(problem)),
    [
      "ORPHAN /glossary inbound=0 root=/guides",
      "ORPHAN /tools/blueprint-targets inbound=0 root=/guides",
      "UNREACHABLE /glossary root=/guides",
      "UNREACHABLE /tools/blueprint-targets root=/guides",
    ],
  );
});

test("normalizes same-origin paths and rejects non-crawlable destinations", () => {
  assert.equal(normalizePublicPath("/glossary/?q=vpd#term", "/guides", ORIGIN), "/glossary");
  assert.equal(
    normalizePublicPath(
      "https://verdantgrowdiary.com/tools/blueprint-targets?stage=veg",
      "/",
      ORIGIN,
    ),
    "/tools/blueprint-targets",
  );
  assert.equal(
    normalizePublicPath("../cultivars/oreoz", "/guides/topic", ORIGIN),
    "/cultivars/oreoz",
  );
  assert.equal(normalizePublicPath("https://example.com/glossary", "/guides", ORIGIN), null);
  assert.equal(normalizePublicPath("mailto:grower@example.com", "/guides", ORIGIN), null);
  assert.equal(normalizePublicPath("tel:+15555550123", "/guides", ORIGIN), null);
  assert.equal(normalizePublicPath("javascript:void(0)", "/guides", ORIGIN), null);
  assert.equal(normalizePublicPath("http://[", "/guides", ORIGIN), null);
  assert.equal(normalizePublicPath("", "/guides", ORIGIN), null);
});

test("deduplicates anchors and excludes self, fragment-only, external, and nofollow links", () => {
  const html = [
    anchor("/glossary"),
    anchor("/glossary?from=guides#vpd"),
    anchor("#same-document"),
    anchor("https://example.com/glossary"),
    anchor("/tools/blueprint-targets", 'rel="ugc nofollow"'),
    '<span data-href="/tools/blueprint-targets">not an anchor</span>',
    '<script>const hidden = `<a href="/tools/blueprint-targets">hidden</a>`;</script>',
    '<template><a href="/tools/blueprint-targets">inert</a></template>',
    anchor("mailto:grower@example.com"),
  ].join("");
  assert.deepEqual(extractCrawlableInternalLinks(html, "/guides", ORIGIN), ["/glossary"]);
});

test("fails when a published Knowledge page exceeds the four-click root ceiling", () => {
  const pages = passingPages();
  const guides = pages.find((entry) => entry.path === "/guides");
  guides.html = anchor("/bridge-1");
  pages.push(
    page("/bridge-1", [anchor("/bridge-2")]),
    page("/bridge-2", [anchor("/bridge-3")]),
    page("/bridge-3", [anchor("/bridge-4")]),
    page("/bridge-4", [anchor("/welcome")]),
  );
  const report = validateKnowledgePublicLinkGraph({ origin: ORIGIN, pages });
  assert.ok(report.problems.includes("TOO_DEEP /glossary depth=6 max=4"));
  assert.ok(report.problems.includes("TOO_DEEP /tools/blueprint-targets depth=6 max=4"));
});

test("distinguishes missing, noindex, and cross-canonical Knowledge destinations", () => {
  const pages = passingPages()
    .filter((entry) => entry.path !== "/tools/blueprint-targets")
    .map((entry) =>
      entry.path === "/glossary"
        ? { ...entry, canonical: `${ORIGIN}/guides` }
        : entry.path === "/guides"
          ? page("/guides", [
              anchor("/welcome"),
              anchor("/guides/missing"),
              anchor("/cultivars"),
              anchor("/tools/vpd-calculator"),
            ])
          : entry,
    );
  pages.push(page("/tools/blueprint-targets", [anchor("/guides")], { robots: "noindex, follow" }));
  const report = validateKnowledgePublicLinkGraph({ origin: ORIGIN, pages });
  assert.ok(
    report.problems.includes(
      "UNPUBLISHED_KNOWLEDGE_DOCUMENT /glossary reason=canonical_path:/guides",
    ),
  );
  assert.ok(
    report.problems.includes(
      "UNPUBLISHED_KNOWLEDGE_DOCUMENT /tools/blueprint-targets reason=noindex",
    ),
  );
  assert.ok(
    report.problems.includes(
      "BROKEN_KNOWLEDGE_LINK /guides -> /guides/missing reason=missing_built_document",
    ),
  );
  assert.ok(
    report.problems.includes(
      "UNCRAWLABLE_KNOWLEDGE_LINK /welcome -> /glossary reason=canonical_path:/guides",
    ),
  );
});

test("fails closed when required Knowledge documents disappear", () => {
  const pages = passingPages().filter((entry) => entry.path !== "/glossary");
  const report = validateKnowledgePublicLinkGraph({ origin: ORIGIN, pages });
  assert.ok(report.problems.includes("MISSING_REQUIRED_KNOWLEDGE_DOCUMENT /glossary"));
  assert.ok(
    report.problems.includes(
      "BROKEN_KNOWLEDGE_LINK /welcome -> /glossary reason=missing_built_document",
    ),
  );
});

test("fails closed when page-level robots directives suppress link following", () => {
  for (const robots of ["index, nofollow", "none"]) {
    const pages = passingPages().map((entry) =>
      entry.path === "/guides" ? { ...entry, robots } : entry,
    );
    const report = validateKnowledgePublicLinkGraph({ origin: ORIGIN, pages });
    const reason = robots === "none" ? "noindex" : "nofollow";
    assert.ok(report.problems.includes(`UNPUBLISHED_KNOWLEDGE_DOCUMENT /guides reason=${reason}`));
    assert.ok(report.problems.includes("MISSING_DISCOVERY_ROOT /guides"));
    assert.ok(report.problems.includes("UNREACHABLE /glossary root=/guides"));
  }
});

test("returns byte-stable page and problem ordering for shuffled input", () => {
  const forward = validateKnowledgePublicLinkGraph({ origin: ORIGIN, pages: passingPages() });
  const reverse = validateKnowledgePublicLinkGraph({
    origin: ORIGIN,
    pages: [...passingPages()].reverse(),
  });
  assert.equal(JSON.stringify(reverse), JSON.stringify(forward));
});

test("loads regular manifest-declared HTML and writes a deterministic report", () => {
  const dir = mkdtempSync(join(tmpdir(), "verdant-knowledge-graph-"));
  try {
    const documents = passingPages().map((entry, index) => {
      const fileName = `page-${index}/index.html`;
      mkdirSync(join(dir, `page-${index}`), { recursive: true });
      writeFileSync(join(dir, fileName), entry.html);
      return {
        path: entry.path,
        fileName,
        metadata: {
          url: entry.canonical,
          robots: entry.robots,
          title: entry.path,
          description: entry.path,
        },
      };
    });
    writeFileSync(join(dir, "seo-manifest.json"), JSON.stringify({ origin: ORIGIN, documents }));

    const loaded = loadBuiltPublicPages(dir);
    assert.equal(loaded.pages.length, documents.length);
    const report = validateBuiltKnowledgePublicLinkGraph(dir);
    assert.equal(report.status, "PASS");
    assert.equal(
      readFileSync(join(dir, KNOWLEDGE_GRAPH_REPORT_FILE), "utf8"),
      `${JSON.stringify(report, null, 2)}\n`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("rejects a manifest path escape and a missing built HTML file", () => {
  const dir = mkdtempSync(join(tmpdir(), "verdant-knowledge-graph-invalid-"));
  try {
    writeFileSync(
      join(dir, "seo-manifest.json"),
      JSON.stringify({
        origin: ORIGIN,
        documents: [
          {
            path: "/guides",
            fileName: "../outside.html",
            metadata: { url: `${ORIGIN}/guides` },
          },
        ],
      }),
    );
    assert.throws(() => loadBuiltPublicPages(dir), /escapes dist/);

    writeFileSync(
      join(dir, "seo-manifest.json"),
      JSON.stringify({
        origin: ORIGIN,
        documents: [
          {
            path: "/guides",
            fileName: "missing/index.html",
            metadata: { url: `${ORIGIN}/guides` },
          },
        ],
      }),
    );
    assert.throws(() => loadBuiltPublicPages(dir), /built HTML file missing or not regular/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
