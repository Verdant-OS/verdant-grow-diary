#!/usr/bin/env -S bunx tsx
/**
 * validate-static-document-jsonld
 *
 * Binds the postbuild JSON-LD validator to the static public document
 * registry. The generic `validate-jsonld-rich-results` validator walks
 * every emitted `.html` in `dist/`; this validator narrows to the
 * documents Verdant advertises as canonical public routes and asserts:
 *
 *   1. Every registry entry emits at least one JSON-LD block
 *      (a static public document with zero schema markup is a regression).
 *   2. Every JSON-LD block declares a recognized @type
 *      (guards against a new @type slipping in without a validator).
 *   3. Every JSON-LD block satisfies its @type's required-field contract
 *      (delegated to `validateHtmlDocument`).
 *
 * Fails the build on any error. Pure module + thin CLI so the vitest
 * spec can drive it directly against the real project `dist/`.
 */
import { readFileSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  extractJsonLdBlocks,
  validateHtmlDocument,
} from "./validate-jsonld-rich-results.mjs";
import { STATIC_PUBLIC_SEO_DOCUMENTS } from "../src/lib/build/staticPublicSeoDocuments";

export interface StaticDocumentIssue {
  readonly path: string;
  readonly fileName: string;
  readonly message: string;
}

export interface StaticDocumentValidationResult {
  readonly documents: number;
  readonly issues: ReadonlyArray<StaticDocumentIssue>;
}

function pathExists(p: string): boolean {
  try {
    statSync(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate JSON-LD across every static public document under `distDir`.
 * If a registry entry is absent from `distDir`, that is itself an issue —
 * static hosting relies on the file being present.
 */
export function validateStaticDocumentJsonLd(
  distDir: string,
): StaticDocumentValidationResult {
  const issues: StaticDocumentIssue[] = [];
  for (const doc of STATIC_PUBLIC_SEO_DOCUMENTS) {
    const full = join(distDir, doc.fileName);
    if (!pathExists(full)) {
      issues.push({
        path: doc.path,
        fileName: doc.fileName,
        message: `static document file not found at ${doc.fileName}`,
      });
      continue;
    }
    const html = readFileSync(full, "utf8");
    const blocks = extractJsonLdBlocks(html);
    if (blocks.length === 0) {
      issues.push({
        path: doc.path,
        fileName: doc.fileName,
        message: "no <script type=\"application/ld+json\"> block emitted",
      });
      continue;
    }
    const { issues: fieldIssues } = validateHtmlDocument(html, doc.fileName);
    for (const fi of fieldIssues) {
      issues.push({
        path: doc.path,
        fileName: doc.fileName,
        message: `[block ${fi.index}] ${fi.path}: ${fi.message}`,
      });
    }
  }
  return { documents: STATIC_PUBLIC_SEO_DOCUMENTS.length, issues };
}

function isCli(): boolean {
  return Boolean(
    process.argv[1] &&
      resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url)),
  );
}

if (isCli()) {
  const distArg = process.argv[2] ?? "dist";
  const distDir = resolve(process.cwd(), distArg);
  if (!pathExists(distDir)) {
    console.error(
      `validate-static-document-jsonld: dist directory not found at ${distDir}`,
    );
    console.error("Run `bun run build` first, or pass the dist path as an argument.");
    process.exit(2);
  }
  const { documents, issues } = validateStaticDocumentJsonLd(distDir);
  if (issues.length > 0) {
    console.error(
      `validate-static-document-jsonld: ${issues.length} error(s) across ${documents} registered static document(s):`,
    );
    for (const i of issues) {
      console.error(`✗ ${i.path} (${i.fileName}): ${i.message}`);
    }
    process.exit(1);
  }
  console.log(
    `validate-static-document-jsonld: OK — ${documents} static public document(s) validated.`,
  );
}
