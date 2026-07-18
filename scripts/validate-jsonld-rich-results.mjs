#!/usr/bin/env node
/**
 * validate-jsonld-rich-results
 *
 * Walks a built `dist/` directory, extracts every
 * <script type="application/ld+json"> payload from every emitted .html
 * file, and validates the payloads against schema.org / Google Rich
 * Results expectations for the @types Verdant actually ships:
 *
 *   FAQPage, Article, BreadcrumbList, SoftwareApplication,
 *   Organization, WebSite, CollectionPage.
 *
 * Errors (fail build):
 *   - malformed JSON
 *   - missing @context or wrong scheme
 *   - unknown/absent @type
 *   - missing required fields per @type
 *   - non-absolute URLs where absolute required
 *   - stringified null/undefined/NaN sneaking into output
 *   - unescaped "</script" inside a JSON-LD payload (breaks HTML parsing)
 *
 * Warnings (do not fail):
 *   - missing Google-recommended fields (e.g. Article.image, Article.dateModified)
 *
 * Pure module + thin CLI so tests can drive it directly.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

/** @typedef {{ file: string; index: number; path: string; message: string }} Issue */

const REQUIRED_CONTEXT = /^https?:\/\/schema\.org\/?$/i;

const KNOWN_TYPES = new Set([
  "FAQPage",
  "Article",
  "NewsArticle",
  "BlogPosting",
  "BreadcrumbList",
  "SoftwareApplication",
  "MobileApplication",
  "WebApplication",
  "Organization",
  "WebSite",
  "CollectionPage",
  "WebPage",
  "Thing",
]);

const ABSOLUTE_URL = /^https?:\/\/[^\s<>"']+$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function pushIssue(issues, ctx, message) {
  issues.push({ ...ctx, message });
}

function requireField(obj, field, ctx, issues) {
  const v = obj?.[field];
  if (v === undefined || v === null || (typeof v === "string" && !v.trim())) {
    pushIssue(issues, { ...ctx, path: `${ctx.path}.${field}` }, `missing required field "${field}"`);
    return false;
  }
  return true;
}

function requireAbsoluteUrl(obj, field, ctx, issues) {
  if (!requireField(obj, field, ctx, issues)) return;
  const v = obj[field];
  if (typeof v !== "string" || !ABSOLUTE_URL.test(v)) {
    pushIssue(
      issues,
      { ...ctx, path: `${ctx.path}.${field}` },
      `"${field}" must be an absolute http(s) URL (got ${JSON.stringify(v)})`,
    );
  }
}

function scanForForbiddenPrimitives(node, ctx, issues, path = ctx.path) {
  if (node === null) {
    pushIssue(issues, { ...ctx, path }, "null value in JSON-LD payload");
    return;
  }
  if (typeof node === "number" && !Number.isFinite(node)) {
    pushIssue(issues, { ...ctx, path }, `non-finite number (${node}) in JSON-LD payload`);
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((child, i) => scanForForbiddenPrimitives(child, ctx, issues, `${path}[${i}]`));
    return;
  }
  if (isPlainObject(node)) {
    for (const [k, v] of Object.entries(node)) {
      scanForForbiddenPrimitives(v, ctx, issues, `${path}.${k}`);
    }
  }
}

/** Per-@type validators return errors into `issues` and warnings into `warnings`. */
const validators = {
  FAQPage(obj, ctx, issues, warnings) {
    if (!Array.isArray(obj.mainEntity) || obj.mainEntity.length === 0) {
      pushIssue(issues, { ...ctx, path: `${ctx.path}.mainEntity` }, "FAQPage.mainEntity must be a non-empty array");
      return;
    }
    obj.mainEntity.forEach((q, i) => {
      const qctx = { ...ctx, path: `${ctx.path}.mainEntity[${i}]` };
      if (q?.["@type"] !== "Question") {
        pushIssue(issues, qctx, `mainEntity[${i}].@type must be "Question"`);
      }
      requireField(q, "name", qctx, issues);
      const ans = q?.acceptedAnswer;
      if (!isPlainObject(ans)) {
        pushIssue(issues, { ...qctx, path: `${qctx.path}.acceptedAnswer` }, "missing acceptedAnswer object");
      } else {
        if (ans["@type"] !== "Answer") {
          pushIssue(issues, { ...qctx, path: `${qctx.path}.acceptedAnswer.@type` }, 'acceptedAnswer.@type must be "Answer"');
        }
        requireField(ans, "text", { ...qctx, path: `${qctx.path}.acceptedAnswer` }, issues);
      }
    });
  },
  Article(obj, ctx, issues, warnings) {
    requireField(obj, "headline", ctx, issues);
    requireAbsoluteUrl(obj, "url", ctx, issues);
    if (requireField(obj, "datePublished", ctx, issues)) {
      if (!ISO_DATE.test(String(obj.datePublished))) {
        pushIssue(issues, { ...ctx, path: `${ctx.path}.datePublished` }, `datePublished must be ISO-8601 (got ${JSON.stringify(obj.datePublished)})`);
      }
    }
    if (obj.dateModified !== undefined && !ISO_DATE.test(String(obj.dateModified))) {
      pushIssue(issues, { ...ctx, path: `${ctx.path}.dateModified` }, `dateModified must be ISO-8601 (got ${JSON.stringify(obj.dateModified)})`);
    }
    const author = obj.author;
    if (!isPlainObject(author) && !Array.isArray(author)) {
      pushIssue(issues, { ...ctx, path: `${ctx.path}.author` }, "Article.author is required (Person or Organization object)");
    } else {
      const authors = Array.isArray(author) ? author : [author];
      authors.forEach((a, i) => {
        const actx = { ...ctx, path: `${ctx.path}.author${Array.isArray(author) ? `[${i}]` : ""}` };
        if (!isPlainObject(a) || !a["@type"]) {
          pushIssue(issues, actx, "author entry must be an object with @type");
        } else if (!["Person", "Organization"].includes(a["@type"])) {
          pushIssue(issues, { ...actx, path: `${actx.path}.@type` }, `author.@type must be "Person" or "Organization" (got ${JSON.stringify(a["@type"])})`);
        }
        requireField(a ?? {}, "name", actx, issues);
      });
    }
    if (obj.image === undefined) {
      warnings.push({ ...ctx, path: `${ctx.path}.image`, message: "Article.image is recommended by Google Rich Results" });
    }
    if (obj.dateModified === undefined) {
      warnings.push({ ...ctx, path: `${ctx.path}.dateModified`, message: "Article.dateModified is recommended" });
    }
  },
  BreadcrumbList(obj, ctx, issues) {
    if (!Array.isArray(obj.itemListElement) || obj.itemListElement.length === 0) {
      pushIssue(issues, { ...ctx, path: `${ctx.path}.itemListElement` }, "BreadcrumbList.itemListElement must be a non-empty array");
      return;
    }
    obj.itemListElement.forEach((it, i) => {
      const ictx = { ...ctx, path: `${ctx.path}.itemListElement[${i}]` };
      if (it?.["@type"] !== "ListItem") {
        pushIssue(issues, { ...ictx, path: `${ictx.path}.@type` }, '@type must be "ListItem"');
      }
      if (typeof it?.position !== "number" || it.position !== i + 1) {
        pushIssue(issues, { ...ictx, path: `${ictx.path}.position` }, `position must be ${i + 1} (got ${JSON.stringify(it?.position)})`);
      }
      requireField(it, "name", ictx, issues);
      requireAbsoluteUrl(it, "item", ictx, issues);
    });
  },
  SoftwareApplication(obj, ctx, issues, warnings) {
    requireField(obj, "name", ctx, issues);
    requireField(obj, "applicationCategory", ctx, issues);
    if (obj.offers === undefined && obj.aggregateRating === undefined) {
      warnings.push({
        ...ctx,
        path: `${ctx.path}`,
        message: "SoftwareApplication is not eligible for Google's rich result without offers or aggregateRating (intentional for Verdant — no fake reviews)",
      });
    }
  },
  Organization(obj, ctx, issues) {
    requireField(obj, "name", ctx, issues);
    if (obj.url !== undefined) requireAbsoluteUrl(obj, "url", ctx, issues);
  },
  WebSite(obj, ctx, issues) {
    requireField(obj, "name", ctx, issues);
    requireAbsoluteUrl(obj, "url", ctx, issues);
  },
  CollectionPage(obj, ctx, issues) {
    requireField(obj, "name", ctx, issues);
    requireField(obj, "description", ctx, issues);
    requireAbsoluteUrl(obj, "url", ctx, issues);
  },
  WebPage(obj, ctx, issues) {
    requireField(obj, "name", ctx, issues);
  },
  Thing() {},
};
validators.NewsArticle = validators.Article;
validators.BlogPosting = validators.Article;
validators.MobileApplication = validators.SoftwareApplication;
validators.WebApplication = validators.SoftwareApplication;

/**
 * Validate a single JSON-LD object (already parsed).
 * @returns {{ issues: Issue[]; warnings: Issue[] }}
 */
export function validateJsonLdObject(obj, ctx = { file: "<inline>", index: 0, path: "$" }) {
  const issues = [];
  const warnings = [];
  if (!isPlainObject(obj)) {
    pushIssue(issues, ctx, "JSON-LD payload must be a JSON object");
    return { issues, warnings };
  }
  const context = obj["@context"];
  const contexts = Array.isArray(context) ? context : [context];
  const contextOk = contexts.some((c) => typeof c === "string" && REQUIRED_CONTEXT.test(c));
  if (!contextOk) {
    pushIssue(issues, { ...ctx, path: `${ctx.path}.@context` }, `@context must include https://schema.org (got ${JSON.stringify(context)})`);
  }
  const type = obj["@type"];
  if (!type || typeof type !== "string") {
    pushIssue(issues, { ...ctx, path: `${ctx.path}.@type` }, `@type is required and must be a string (got ${JSON.stringify(type)})`);
    return { issues, warnings };
  }
  if (!KNOWN_TYPES.has(type)) {
    pushIssue(issues, { ...ctx, path: `${ctx.path}.@type` }, `@type "${type}" is not one of the known types this project ships (${[...KNOWN_TYPES].join(", ")})`);
    return { issues, warnings };
  }
  scanForForbiddenPrimitives(obj, ctx, issues);
  const validator = validators[type];
  if (validator) validator(obj, ctx, issues, warnings);
  return { issues, warnings };
}

/** Extract every JSON-LD script payload from an HTML string. */
export function extractJsonLdBlocks(html) {
  const blocks = [];
  const re = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    blocks.push({ raw: m[1], startIndex: m.index });
  }
  return blocks;
}

/** Validate every JSON-LD block in an HTML string. */
export function validateHtmlDocument(html, file) {
  const issues = [];
  const warnings = [];
  const blocks = extractJsonLdBlocks(html);
  blocks.forEach((block, i) => {
    const ctx = { file, index: i, path: "$" };
    const trimmed = block.raw.trim();
    if (!trimmed) {
      pushIssue(issues, ctx, "empty <script type=\"application/ld+json\"> block");
      return;
    }
    // Detect a raw `</script` sequence inside the payload — must be escaped.
    // We check the pre-parse raw text since parsing would already have failed
    // if a real </script broke the outer element.
    if (/<\/script/i.test(trimmed)) {
      pushIssue(issues, ctx, 'unescaped "</script" inside JSON-LD payload (use safeJsonLdStringify)');
    }
    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch (err) {
      pushIssue(issues, ctx, `invalid JSON: ${(err && err.message) || String(err)}`);
      return;
    }
    // Support @graph arrays. @graph children inherit @context from the parent
    // per JSON-LD 1.1 §4.9, so inject it before validating each child.
    const isGraph = Array.isArray(parsed?.["@graph"]);
    const nodes = isGraph ? parsed["@graph"] : [parsed];
    const inheritedContext = parsed?.["@context"];
    nodes.forEach((node, ni) => {
      const nctx = { ...ctx, path: isGraph ? `$.@graph[${ni}]` : "$" };
      const nodeForValidation =
        isGraph && isPlainObject(node) && node["@context"] === undefined && inheritedContext !== undefined
          ? { "@context": inheritedContext, ...node }
          : node;
      const res = validateJsonLdObject(nodeForValidation, nctx);
      issues.push(...res.issues);
      warnings.push(...res.warnings);
    });

  });
  return { issues, warnings, blockCount: blocks.length };
}

function walkHtmlFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const s = statSync(full);
    if (s.isDirectory()) out.push(...walkHtmlFiles(full));
    else if (s.isFile() && full.endsWith(".html")) out.push(full);
  }
  return out;
}

export function validateDistDirectory(distDir) {
  const files = walkHtmlFiles(distDir);
  const allIssues = [];
  const allWarnings = [];
  let totalBlocks = 0;
  let filesWithLd = 0;
  for (const file of files) {
    const rel = relative(distDir, file);
    const html = readFileSync(file, "utf8");
    const { issues, warnings, blockCount } = validateHtmlDocument(html, rel);
    totalBlocks += blockCount;
    if (blockCount > 0) filesWithLd += 1;
    allIssues.push(...issues);
    allWarnings.push(...warnings);
  }
  return { files, totalBlocks, filesWithLd, issues: allIssues, warnings: allWarnings };
}

function formatIssue(issue) {
  return `  ${issue.file} [block ${issue.index}] ${issue.path}: ${issue.message}`;
}

function isCli() {
  return process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
}

if (isCli()) {
  const distArg = process.argv[2] ?? "dist";
  const distDir = resolve(process.cwd(), distArg);
  try {
    statSync(distDir);
  } catch {
    console.error(`validate-jsonld-rich-results: dist directory not found at ${distDir}`);
    console.error(`Run \`bun run build\` first, or pass the dist path as an argument.`);
    process.exit(2);
  }
  const { files, totalBlocks, filesWithLd, issues, warnings } = validateDistDirectory(distDir);
  for (const w of warnings) console.warn(`⚠︎ ${formatIssue(w)}`);
  if (issues.length > 0) {
    console.error(
      `validate-jsonld-rich-results: ${issues.length} error(s) across ${filesWithLd}/${files.length} HTML file(s) (${totalBlocks} JSON-LD block(s)):`,
    );
    for (const e of issues) console.error(`✗ ${formatIssue(e)}`);
    process.exit(1);
  }
  console.log(
    `validate-jsonld-rich-results: OK — ${totalBlocks} JSON-LD block(s) across ${filesWithLd}/${files.length} HTML file(s), ${warnings.length} warning(s).`,
  );
}
