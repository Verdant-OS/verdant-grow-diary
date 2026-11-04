/**
 * Contrast guard for the destructive colour (contrast spec in Verdant-OS/verdant-grow-diary#2827, D1 (a);
 * audit 2026-11-03 finding 12).
 *
 * Error text and white-on-danger fills must meet WCAG AA (4.5:1) in the dark theme
 * (:root) and the light theme (.customer-mode). One token cannot do both jobs, so
 * text uses --destructive-text and solid fills use --destructive.
 *
 * Tokens are read from the parsed declarations in src/styles.css (postcss), not from
 * a regex over the file, so a commented-out or moved value cannot pass.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import postcss, { type Rule, type AtRule } from "postcss";

import { buttonVariants } from "@/components/ui/button";
import { badgeVariants } from "@/components/ui/badge";

const AA = 4.5;
const css = postcss.parse(readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8"));

function declsOf(match: (node: Rule | AtRule) => boolean): Record<string, string> {
  const out: Record<string, string> = {};
  css.walk((node) => {
    if ((node.type === "rule" || node.type === "atrule") && match(node as Rule | AtRule)) {
      (node as Rule).each((child) => {
        if (child.type === "decl") out[child.prop] = child.value;
      });
    }
  });
  return out;
}

const root = declsOf((n) => n.type === "rule" && (n as Rule).selector === ":root");
const light = {
  ...root,
  ...declsOf((n) => n.type === "rule" && (n as Rule).selector === ".customer-mode"),
};
const theme = declsOf((n) => n.type === "atrule" && (n as AtRule).name === "theme");

type Rgb = [number, number, number];

function hslToRgb(h: number, s: number, l: number): Rgb {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)];
}

function token(vars: Record<string, string>, name: string): Rgb {
  const raw = vars[name];
  if (!raw) throw new Error(`missing token ${name}`);
  const [h, s, l] = raw.replace(/%/g, "").trim().split(/\s+/).map(Number);
  return hslToRgb(h, s, l);
}

function luminance([r, g, b]: Rgb): number {
  const lin = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** The lightest stop of --gradient-glass composited over --background. */
function glass(vars: Record<string, string>): Rgb {
  const m = /hsl\((\d+)\s+(\d+)%\s+(\d+)%\s*\/\s*([\d.]+)\)/.exec(vars["--gradient-glass"] ?? "");
  if (!m) throw new Error("cannot read --gradient-glass");
  const fg = hslToRgb(Number(m[1]), Number(m[2]), Number(m[3]));
  const alpha = Number(m[4]);
  const bg = token(vars, "--background");
  return fg.map((v, i) => v * alpha + bg[i] * (1 - alpha)) as Rgb;
}

describe("destructive colour contrast (D1 a)", () => {
  it("maps text utilities to --destructive-text and the fill utility to --destructive", () => {
    expect(theme["--color-destructive"]).toBe("hsl(var(--destructive-text))");
    expect(theme["--color-destructive-fill"]).toBe("hsl(var(--destructive))");
  });

  it("dark theme: error text meets AA on background, card and glass", () => {
    const text = token(root, "--destructive-text");
    expect(contrast(text, token(root, "--background"))).toBeGreaterThanOrEqual(AA);
    expect(contrast(text, token(root, "--card"))).toBeGreaterThanOrEqual(AA);
    expect(contrast(text, glass(root))).toBeGreaterThanOrEqual(AA);
  });

  it("dark theme: the white label on a danger fill meets AA", () => {
    expect(
      contrast(token(root, "--destructive-foreground"), token(root, "--destructive")),
    ).toBeGreaterThanOrEqual(AA);
  });

  it("light theme: error text meets AA on background and card", () => {
    const text = token(light, "--destructive-text");
    expect(contrast(text, token(light, "--background"))).toBeGreaterThanOrEqual(AA);
    expect(contrast(text, token(light, "--card"))).toBeGreaterThanOrEqual(AA);
  });

  it("light theme: the white label on a danger fill meets AA", () => {
    expect(
      contrast(token(light, "--destructive-foreground"), token(light, "--destructive")),
    ).toBeGreaterThanOrEqual(AA);
  });

  it("Button and Badge destructive variants use the fill, not the text colour", () => {
    for (const cls of [
      buttonVariants({ variant: "destructive" }),
      badgeVariants({ variant: "destructive" }),
    ]) {
      expect(cls.split(/\s+/)).toContain("bg-destructive-fill");
      expect(cls).not.toMatch(/(^|\s)bg-destructive(\s|$)/);
    }
  });

  it("no class string pairs a solid bg-destructive with a white destructive-foreground label", () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.tsx?$/.test(name)) files.push(p);
      }
    };
    walk(resolve(process.cwd(), "src/components"));
    walk(resolve(process.cwd(), "src/pages"));
    const offenders: string[] = [];
    for (const f of files) {
      for (const literal of readFileSync(f, "utf8").match(/"[^"\n]*"/g) ?? []) {
        if (
          /(^|[\s"])(\S+:)?bg-destructive([\s"])/.test(literal) &&
          /text-destructive-foreground/.test(literal)
        ) {
          offenders.push(`${f}: ${literal}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
