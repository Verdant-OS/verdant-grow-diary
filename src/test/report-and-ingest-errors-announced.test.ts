/**
 * Screen-reader guard for error messages on the post-grow report, the cultivar QA panel, the
 * sensor ingest tools and the MCP browser connect panel (audit 2026-11-03 finding 12).
 *
 * An error block counts as announced when it, an element around it, or an element inside it
 * carries role="alert"/"status" or aria-live, or passes descriptionRole to EmptyState (which
 * puts the role on the description sentence only). Announcing the sentence inside a larger
 * error block keeps the heading and the retry button out of the announcement.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { createElement } from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
import EmptyState from "@/components/EmptyState";
import { MemoryRouter } from "@/lib/react-router-compat";
import SensorsIngestNormalizer from "@/pages/SensorsIngestNormalizer";

const FILES = [
  "src/pages/PostGrowLearningReport.tsx",
  "src/components/CultivarQaPanel.tsx",
  "src/pages/IngestInspector.tsx",
  "src/pages/SensorsIngestNormalizer.tsx",
  "src/components/mcp/BrowserConnectPanel.tsx",
  "src/components/ActionFollowUpEvidenceSection.tsx",
];

const ERROR_TESTID = /errors?["'`}]*\s*\}?$/;

function attrs(el: ts.JsxOpeningLikeElement, sf: ts.SourceFile) {
  const list = el.attributes.properties.filter(ts.isJsxAttribute);
  const get = (k: string) => list.find((a) => a.name.getText(sf) === k);
  return {
    text: (k: string) => get(k)?.initializer?.getText(sf) ?? "",
    has: (k: string) => Boolean(get(k)),
  };
}

function announces(el: ts.JsxOpeningLikeElement, sf: ts.SourceFile): boolean {
  const a = attrs(el, sf);
  return (
    /alert|status/.test(a.text("role")) ||
    a.has("aria-live") ||
    /alert|status/.test(a.text("descriptionRole"))
  );
}

function openingOf(n: ts.Node): ts.JsxOpeningLikeElement | null {
  if (ts.isJsxElement(n)) return n.openingElement;
  if (ts.isJsxSelfClosingElement(n)) return n;
  return null;
}

function announcedAround(el: ts.JsxOpeningLikeElement, sf: ts.SourceFile): boolean {
  if (announces(el, sf)) return true;
  for (let p: ts.Node | undefined = el.parent; p; p = p.parent) {
    const o = openingOf(p);
    if (o && o !== el && announces(o, sf)) return true;
  }
  const body = ts.isJsxOpeningElement(el) ? el.parent : null;
  let inside = false;
  const walk = (n: ts.Node) => {
    const o = openingOf(n);
    if (o && o !== el && announces(o, sf)) inside = true;
    if (!inside) ts.forEachChild(n, walk);
  };
  if (body) ts.forEachChild(body, walk);
  return inside;
}

function offenders(): string[] {
  const found: string[] = [];
  for (const rel of FILES) {
    const sf = ts.createSourceFile(
      rel,
      readFileSync(resolve(process.cwd(), rel), "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const visit = (n: ts.Node) => {
      if (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) {
        const testId = attrs(n, sf).text("data-testid");
        if (testId && ERROR_TESTID.test(testId) && n.tagName.getText(sf) !== "Button") {
          if (!announcedAround(n, sf)) {
            const { line } = sf.getLineAndCharacterOfPosition(n.getStart(sf));
            found.push(`${rel}:${line + 1} ${testId}`);
          }
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return found;
}

describe("report and ingest error messages are announced", () => {
  it("every error block is, contains or sits inside an announced element", () => {
    expect(offenders()).toEqual([]);
  });

  it("EmptyState puts descriptionRole on the description sentence only", () => {
    render(
      createElement(EmptyState, {
        title: "Report unavailable",
        description: "This grow report could not be loaded.",
        descriptionRole: "alert",
      }),
    );
    expect(screen.getByRole("alert").textContent).toBe("This grow report could not be loaded.");
  });

  it("the ingest normalizer's payload errors appear inside an alert", () => {
    // A polite status region that mounts together with its text is often not read out, so this
    // block, which only appears after a parse, has to be an alert.
    render(createElement(MemoryRouter, null, createElement(SensorsIngestNormalizer)));
    fireEvent.change(screen.getByTestId("webhook-normalizer-textarea"), {
      target: { value: "{}" },
    });
    fireEvent.click(screen.getByTestId("webhook-normalizer-parse"));
    const block = screen.getByTestId("webhook-normalizer-payload-errors");
    expect(block.getAttribute("role")).toBe("alert");
    expect(within(block).getByText("source required")).toBeTruthy();
  });

  it("EmptyState without descriptionRole announces nothing (other callers unchanged)", () => {
    render(createElement(EmptyState, { title: "No grows yet", description: "Start one." }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });
});
