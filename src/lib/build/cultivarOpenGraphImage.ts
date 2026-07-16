import type { VerdantCultivarProfile } from "../../constants/verdantCultivars";
import {
  CULTIVAR_OG_IMAGE_HEIGHT,
  CULTIVAR_OG_IMAGE_WIDTH,
} from "../cultivarSeoRules";

export interface CultivarOpenGraphCard {
  eyebrow: string;
  name: string;
  lineage: string;
  detail: string;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function limit(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function wrap(value: string, maxLineLength: number, maxLines: number): string[] {
  const words = value.trim().split(/\s+/);
  const lines: string[] = [];

  for (const word of words) {
    const current = lines.at(-1);
    if (!current || current.length + word.length + 1 > maxLineLength) {
      if (lines.length === maxLines) {
        lines[maxLines - 1] = limit(`${lines[maxLines - 1]} ${word}`, maxLineLength);
        break;
      }
      lines.push(limit(word, maxLineLength));
      continue;
    }
    lines[lines.length - 1] = `${current} ${word}`;
  }

  return lines;
}

export function buildCultivarOpenGraphCard(
  cultivar: VerdantCultivarProfile,
): CultivarOpenGraphCard {
  return {
    eyebrow: "CULTIVAR GUIDE",
    name: cultivar.name,
    lineage: `Lineage: ${cultivar.lineage}`,
    detail: `${cultivar.flowerWeeks}  •  ${cultivar.difficulty}`,
  };
}

export const CULTIVARS_INDEX_OPEN_GRAPH_CARD: CultivarOpenGraphCard = Object.freeze({
  eyebrow: "VERDANT GROW DIARY",
  name: "Cultivar Guides",
  lineage: "Environment ranges, flower windows, and grower evidence",
  detail: "Plant memory  •  Sensor truth  •  Better decisions",
});

/**
 * Deterministic 1200x630 Verdant card rendered to PNG by the build plugin.
 * Text comes only from the curated cultivar constants, never user input.
 */
export function buildCultivarOpenGraphSvg(card: CultivarOpenGraphCard): string {
  const eyebrow = escapeXml(limit(card.eyebrow, 40));
  const name = escapeXml(limit(card.name, 32));
  const lineageLines = wrap(card.lineage, 48, 2).map(escapeXml);
  const lineageY = lineageLines.length > 1 ? 340 : 356;
  const lineage = lineageLines
    .map((line, index) => `<tspan x="108" dy="${index === 0 ? 0 : 36}">${line}</tspan>`)
    .join("");
  const detail = escapeXml(limit(card.detail, 70));

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CULTIVAR_OG_IMAGE_WIDTH}" height="${CULTIVAR_OG_IMAGE_HEIGHT}" viewBox="0 0 ${CULTIVAR_OG_IMAGE_WIDTH} ${CULTIVAR_OG_IMAGE_HEIGHT}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#08140d"/>
      <stop offset="0.58" stop-color="#0d2116"/>
      <stop offset="1" stop-color="#12351f"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#75d693" stop-opacity="0.32"/>
      <stop offset="1" stop-color="#75d693" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <circle cx="1035" cy="130" r="330" fill="url(#glow)"/>
  <circle cx="1100" cy="555" r="210" fill="none" stroke="#75d693" stroke-opacity="0.18" stroke-width="2"/>
  <path d="M982 444c72-79 111-171 115-279-89 51-151 130-184 237 23-92 4-172-55-240-24 105-4 198 60 279" fill="none" stroke="#75d693" stroke-opacity="0.32" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/>
  <rect x="72" y="66" width="1056" height="498" rx="28" fill="none" stroke="#d6f3df" stroke-opacity="0.14"/>
  <text x="104" y="133" fill="#83df9f" font-family="Inter, Arial, sans-serif" font-size="24" font-weight="700" letter-spacing="6">${eyebrow}</text>
  <text x="104" y="278" fill="#f4fbf6" font-family="Inter, Arial, sans-serif" font-size="76" font-weight="700" letter-spacing="-2">${name}</text>
  <text x="108" y="${lineageY}" fill="#c7ddce" font-family="Inter, Arial, sans-serif" font-size="30" font-weight="500">${lineage}</text>
  <rect x="104" y="412" width="720" height="1" fill="#d6f3df" fill-opacity="0.2"/>
  <text x="108" y="466" fill="#e3f1e7" font-family="Inter, Arial, sans-serif" font-size="28" font-weight="600">${detail}</text>
  <text x="104" y="526" fill="#83df9f" font-family="Inter, Arial, sans-serif" font-size="22" font-weight="700" letter-spacing="2">VERDANTGROWDIARY.COM</text>
</svg>`;
}
