/**
 * Deterministic per-route OpenGraph card renderer.
 *
 * Builds a 1200×630 SVG document from route metadata (title, description,
 * category derived from the URL path). No JSX, no runtime data — pure text in,
 * SVG string out. The Vite build plugin rasterizes the SVG to PNG with
 * `@resvg/resvg-js` and emits it as `og/<slug>.png`.
 *
 * The card is intentionally restrained: dark leaf-tinted surface, primary
 * accent chip, Verdant wordmark, category badge, wrapped title, wrapped
 * description, and the canonical domain footer. No stock illustration, no
 * generated imagery, no hype copy.
 */

export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;

/** Approximate glyph-width factor for sans-serif fonts (0.55 * font size). */
const CHAR_WIDTH_FACTOR = 0.55;

export interface OgCardInput {
  readonly title: string;
  readonly description: string;
  readonly path: string;
  readonly category?: string;
}

/**
 * Derives a filename-safe slug from a route path.
 * `/` is not allowed; other routes flatten with `--`.
 */
export function ogImageSlugForPath(path: string): string {
  if (!path.startsWith("/") || path === "/") {
    throw new Error(`ogImageSlugForPath requires a non-root absolute path: ${path}`);
  }
  return path
    .slice(1)
    .replace(/[^a-zA-Z0-9/_-]/g, "-")
    .replace(/\//g, "--")
    .toLowerCase();
}

/** Returns a stable category label based on the route path. */
export function categoryForPath(path: string): string {
  if (path === "/founder") return "Founder Lifetime";
  if (path === "/pricing") return "Pricing";
  if (path === "/welcome") return "Grow OS";
  if (path.startsWith("/guides/")) return "Grower Guide";
  if (path === "/guides") return "Guides";
  if (path.startsWith("/cultivars/")) return "Cultivar Guide";
  if (path === "/cultivars") return "Cultivar Library";
  if (path.startsWith("/tools/")) return "Free Tool";
  if (path === "/hardware-integrations") return "Hardware";
  if (path === "/how-ai-doctor-works") return "AI Doctor";
  if (path === "/ai-doctor-readiness-check") return "Readiness Check";
  if (path === "/quick-log") return "Quick Log";
  if (path === "/glossary") return "Reference";
  if (path === "/breeder-beta" || path === "/creator-beta") return "Beta Program";
  if (path.startsWith("/pheno-")) return "Pheno Preview";
  if (path === "/privacy" || path === "/terms" || path === "/refund") return "Legal";
  return "Verdant";
}

/**
 * Greedy word-wrap by approximate character width. Deterministic and dependency-free.
 * Falls back to hard-breaking a single word that exceeds the line budget.
 */
export function wrapText(text: string, maxWidth: number, fontSize: number, maxLines: number): string[] {
  const budget = Math.max(1, Math.floor(maxWidth / (fontSize * CHAR_WIDTH_FACTOR)));
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= budget) {
      current = candidate;
      continue;
    }
    if (current) {
      lines.push(current);
      if (lines.length === maxLines) {
        current = "";
        break;
      }
    }
    if (word.length <= budget) {
      current = word;
    } else {
      // Hard break oversize word
      let remaining = word;
      while (remaining.length > budget) {
        lines.push(remaining.slice(0, budget - 1) + "-");
        remaining = remaining.slice(budget - 1);
        if (lines.length === maxLines) {
          remaining = "";
          break;
        }
      }
      current = remaining;
    }
  }
  if (current && lines.length < maxLines) {
    lines.push(current);
  }
  // If we exhausted lines but text remained, ellipsize the last one.
  if (lines.length === maxLines) {
    const joinedLen = lines.join(" ").length;
    if (joinedLen < text.length) {
      const last = lines[maxLines - 1];
      const trimmed = last.length > budget - 1 ? last.slice(0, budget - 1) : last;
      lines[maxLines - 1] = `${trimmed.replace(/[\s,;:.!?-]+$/u, "")}…`;
    }
  }
  return lines;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Builds the deterministic OG card SVG string. Uses a generic sans-serif
 * family so the raster step falls back to the host's default sans font.
 */
export function buildOgCardSvg(input: OgCardInput): string {
  const category = input.category ?? categoryForPath(input.path);
  const titleFontSize = input.title.length > 70 ? 60 : 72;
  const titleLines = wrapText(input.title, 1040, titleFontSize, 3);
  const descriptionLines = wrapText(input.description, 1040, 30, 3);

  const titleStartY = 260;
  const titleLineHeight = Math.round(titleFontSize * 1.15);
  const descriptionStartY = titleStartY + titleLines.length * titleLineHeight + 40;
  const descriptionLineHeight = 42;

  const titleTspans = titleLines
    .map(
      (line, index) =>
        `<tspan x="80" dy="${index === 0 ? 0 : titleLineHeight}">${escapeXml(line)}</tspan>`,
    )
    .join("");
  const descriptionTspans = descriptionLines
    .map(
      (line, index) =>
        `<tspan x="80" dy="${index === 0 ? 0 : descriptionLineHeight}">${escapeXml(line)}</tspan>`,
    )
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${OG_IMAGE_WIDTH}" height="${OG_IMAGE_HEIGHT}" viewBox="0 0 ${OG_IMAGE_WIDTH} ${OG_IMAGE_HEIGHT}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0b1f16"/>
      <stop offset="1" stop-color="#04120c"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#4ade80"/>
      <stop offset="1" stop-color="#22c55e"/>
    </linearGradient>
  </defs>
  <rect width="${OG_IMAGE_WIDTH}" height="${OG_IMAGE_HEIGHT}" fill="url(#bg)"/>
  <rect x="0" y="0" width="8" height="${OG_IMAGE_HEIGHT}" fill="url(#accent)"/>
  <circle cx="1080" cy="120" r="220" fill="#22c55e" fill-opacity="0.06"/>
  <circle cx="1140" cy="560" r="180" fill="#4ade80" fill-opacity="0.05"/>

  <g font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif" fill="#f0fdf4">
    <text x="80" y="110" font-size="28" font-weight="700" letter-spacing="4" fill="#4ade80">VERDANT</text>
    <text x="80" y="150" font-size="20" fill="#86efac" opacity="0.9">Grow Diary · Sensor Truth · Cautious AI</text>

    <g transform="translate(80, 190)">
      <rect x="0" y="-28" rx="14" ry="14" width="${Math.max(120, category.length * 14 + 32)}" height="40" fill="#22c55e" fill-opacity="0.18" stroke="#4ade80" stroke-opacity="0.4"/>
      <text x="16" y="0" font-size="20" font-weight="600" fill="#bbf7d0">${escapeXml(category)}</text>
    </g>

    <text x="80" y="${titleStartY}" font-size="${titleFontSize}" font-weight="700" fill="#ffffff">${titleTspans}</text>
    <text x="80" y="${descriptionStartY}" font-size="30" fill="#d1fae5" opacity="0.92">${descriptionTspans}</text>

    <text x="80" y="580" font-size="22" fill="#86efac" opacity="0.85">verdantgrowdiary.com</text>
    <text x="1120" y="580" font-size="22" text-anchor="end" fill="#86efac" opacity="0.6">Plant memory. Sensor truth.</text>
  </g>
</svg>`;
}
