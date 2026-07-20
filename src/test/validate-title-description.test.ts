/**
 * Unit tests for scripts/validate-title-description.mjs.
 *
 * Locks the contract that every static public document emits exactly
 * one non-empty <title> and one non-empty <meta name="description">,
 * and neither is the Lovable template default.
 */
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  collectHtmlFiles,
  extractTitles,
  extractDescriptions,
  validateDocument,
  validateTitleDescription,
} from "../../scripts/validate-title-description.mjs";

const okDoc = (title = "VPD Guide — Verdant", description = "How to read VPD for autoflowers.") =>
  `<!doctype html><html><head>
    <title>${title}</title>
    <meta name="description" content="${description}">
  </head><body></body></html>`;

describe("extractTitles", () => {
  it("returns the single title", () => {
    expect(extractTitles(okDoc())).toEqual(["VPD Guide — Verdant"]);
  });
  it("returns every title (so callers can flag duplicates)", () => {
    expect(extractTitles("<title>a</title><title>b</title>")).toEqual(["a", "b"]);
  });
  it("returns empty when no title", () => {
    expect(extractTitles("<html></html>")).toEqual([]);
  });
});

describe("extractDescriptions", () => {
  it("extracts content in property-first order", () => {
    expect(extractDescriptions(okDoc())).toEqual(["How to read VPD for autoflowers."]);
  });
  it("extracts content in content-first order", () => {
    const html = `<meta content="hello" name="description">`;
    expect(extractDescriptions(html)).toEqual(["hello"]);
  });
  it("does not double-count a tag matched by both orderings", () => {
    const html = `<meta name="description" content="only-once">`;
    expect(extractDescriptions(html)).toEqual(["only-once"]);
  });
  it("ignores other meta tags", () => {
    expect(extractDescriptions(`<meta name="viewport" content="x">`)).toEqual([]);
  });
});

describe("validateDocument", () => {
  it("passes on a well-formed document", () => {
    expect(validateDocument({ file: "a.html", html: okDoc() })).toEqual([]);
  });

  it("flags a missing title", () => {
    const html = `<meta name="description" content="x">`;
    const issues = validateDocument({ file: "a.html", html });
    expect(issues).toHaveLength(1);
    expect(issues[0].tag).toBe("title");
    expect(issues[0].message).toContain("missing");
  });

  it("flags an empty title", () => {
    const html = `<title>   </title><meta name="description" content="x">`;
    const issues = validateDocument({ file: "a.html", html });
    expect(issues).toHaveLength(1);
    expect(issues[0].tag).toBe("title");
    expect(issues[0].message).toContain("empty");
  });

  it("flags duplicate titles", () => {
    const html = `<title>a</title><title>b</title><meta name="description" content="x">`;
    const issues = validateDocument({ file: "a.html", html });
    expect(issues).toHaveLength(1);
    expect(issues[0].tag).toBe("title");
    expect(issues[0].message).toContain("2");
  });

  it("flags Lovable template default title", () => {
    const issues = validateDocument({ file: "a.html", html: okDoc("Lovable App") });
    expect(issues).toHaveLength(1);
    expect(issues[0].tag).toBe("title");
    expect(issues[0].message).toContain("template default");
  });

  it("flags a missing description", () => {
    const issues = validateDocument({ file: "a.html", html: `<title>ok</title>` });
    expect(issues).toHaveLength(1);
    expect(issues[0].tag).toBe("description");
  });

  it("flags an empty description", () => {
    const html = `<title>ok</title><meta name="description" content="   ">`;
    const issues = validateDocument({ file: "a.html", html });
    expect(issues).toHaveLength(1);
    expect(issues[0].tag).toBe("description");
    expect(issues[0].message).toContain("empty");
  });

  it("flags duplicate descriptions", () => {
    const html = `<title>ok</title><meta name="description" content="a"><meta name="description" content="b">`;
    const issues = validateDocument({ file: "a.html", html });
    expect(issues).toHaveLength(1);
    expect(issues[0].tag).toBe("description");
    expect(issues[0].message).toContain("2");
  });

  it("flags Lovable template default description", () => {
    const issues = validateDocument({
      file: "a.html",
      html: okDoc("Real Title", "Lovable Generated Project"),
    });
    expect(issues).toHaveLength(1);
    expect(issues[0].tag).toBe("description");
    expect(issues[0].message).toContain("template default");
  });
});

describe("validateTitleDescription (dist walk)", () => {
  let dist: string;

  beforeAll(() => {
    dist = mkdtempSync(join(tmpdir(), "title-desc-"));
    mkdirSync(join(dist, "guides"), { recursive: true });
    writeFileSync(join(dist, "index.html"), okDoc("Verdant", "Plant memory for growers."));
    writeFileSync(join(dist, "guides", "vpd.html"), okDoc());
    writeFileSync(join(dist, "guides", "broken.html"), `<title></title>`);
  });

  afterAll(() => rmSync(dist, { recursive: true, force: true }));

  it("collects every .html file under dist", () => {
    expect(collectHtmlFiles(dist)).toHaveLength(3);
  });

  it("returns issues with dist-relative paths for broken documents", () => {
    const { issues, documents } = validateTitleDescription(dist);
    expect(documents).toBe(3);
    // broken.html has both empty title and missing description
    expect(issues).toHaveLength(2);
    const tags = issues.map((i) => i.tag).sort();
    expect(tags).toEqual(["description", "title"]);
    for (const issue of issues) {
      expect(issue.file.replace(/\\/g, "/")).toBe("guides/broken.html");
    }
  });
});
