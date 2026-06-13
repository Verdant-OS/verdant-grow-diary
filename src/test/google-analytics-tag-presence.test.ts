import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const INDEX_HTML_PATH = resolve(__dirname, "../../index.html");

describe("Google Analytics tag presence in index.html", () => {
  const html = readFileSync(INDEX_HTML_PATH, "utf8");

  it("contains the Google tag comment", () => {
    expect(html).toContain("Google tag (gtag.js)");
  });

  it("loads gtag.js with the measurement ID", () => {
    expect(html).toContain(
      'https://www.googletagmanager.com/gtag/js?id=G-B3QRSZEM9S'
    );
  });

  it("initializes dataLayer", () => {
    expect(html).toContain("window.dataLayer = window.dataLayer || []");
  });

  it("defines gtag function", () => {
    expect(html).toContain("function gtag(){dataLayer.push(arguments);}");
  });

  it("configures the measurement ID", () => {
    expect(html).toContain("gtag('config', 'G-B3QRSZEM9S')");
  });
});
