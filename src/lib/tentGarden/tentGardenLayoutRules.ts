/**
 * Tent Garden layout rules — pure, deterministic, no side effects.
 * S1: auto-placement, footprint, overlap. Positions are never persisted.
 */

export interface PlantForLayout {
  id: string;
  created_at: string; // ISO
  pot_size: string | null;
}

export interface TentForLayout {
  id: string;
  size: string | null;
}

export interface Point {
  x: number;
  y: number;
}

export interface PotPlacement {
  plantId: string;
  position: Point;
  potRadius: number;
}

export interface Footprint {
  width: number;
  depth: number;
  isApproximate: boolean;
  message: string | null;
}

const DEFAULT_POT_RADIUS = 0.2;

export function parseTentSize(size: string | null | undefined): { width: number; depth: number } | null {
  if (!size || typeof size !== "string") return null;
  const cleaned = size.toLowerCase().replace(/['\"\s]/g, "").replace("cm", "");
  const match = cleaned.match(/^(\d+(?:\.\d+)?)[x×](\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const w = parseFloat(match[1]);
  const d = parseFloat(match[2]);
  if (isNaN(w) || isNaN(d) || w <= 0 || d <= 0) return null;
  const width = w > 20 ? w / 100 : w;
  const depth = d > 20 ? d / 100 : d;
  return { width, depth };
}

function gridDimensions(n: number): { cols: number; rows: number } {
  if (n <= 0) return { cols: 1, rows: 1 };
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  return { cols, rows };
}

export function potsOverlap(a: { position: Point; radius: number }, b: { position: Point; radius: number }): boolean {
  const dx = a.position.x - b.position.x;
  const dy = a.position.y - b.position.y;
  const minDist = a.radius + b.radius;
  return dx * dx + dy * dy < minDist * minDist - 1e-9;
}

export function clampToTent(position: Point, radius: number, footprint: { width: number; depth: number }): Point {
  const halfW = footprint.width / 2;
  const halfD = footprint.depth / 2;
  return {
    x: Math.max(-halfW + radius, Math.min(halfW - radius, position.x)),
    y: Math.max(-halfD + radius, Math.min(halfD - radius, position.y)),
  };
}

export function placePlants(plants: PlantForLayout[], tent: TentForLayout): { placements: PotPlacement[]; footprint: Footprint } {
  const sorted = [...plants].sort((a, b) => {
    const byDate = a.created_at.localeCompare(b.created_at);
    return byDate !== 0 ? byDate : a.id.localeCompare(b.id);
  });

  const parsed = parseTentSize(tent.size);
  let footprint: Footprint;
  if (parsed) {
    footprint = { width: parsed.width, depth: parsed.depth, isApproximate: false, message: null };
  } else {
    const n = Math.max(sorted.length, 1);
    const { cols, rows } = gridDimensions(n);
    const minCell = DEFAULT_POT_RADIUS * 2.8;
    const side = Math.max(cols, rows) * minCell + DEFAULT_POT_RADIUS * 4;
    footprint = {
      width: side,
      depth: side,
      isApproximate: true,
      message: "Tent size not recorded — layout is approximate",
    };
  }

  const { cols, rows } = gridDimensions(sorted.length);
  const cellW = footprint.width / (cols + 1);
  const cellD = footprint.depth / (rows + 1);

  const placements: PotPlacement[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const plant = sorted[i];
    const col = i % cols;
    const row = Math.floor(i / cols);
    const rawX = (col + 0.5 - cols / 2) * cellW;
    const rawY = (row + 0.5 - rows / 2) * cellD;
    const radius = DEFAULT_POT_RADIUS;
    const clamped = clampToTent({ x: rawX, y: rawY }, radius, footprint);
    placements.push({ plantId: plant.id, position: clamped, potRadius: radius });
  }

  for (let i = 0; i < placements.length; i++) {
    for (let j = 0; j < i; j++) {
      if (potsOverlap(placements[i], placements[j])) {
        placements[i].position.x += 0.01 * (i - j);
        placements[i].position = clampToTent(placements[i].position, placements[i].potRadius, footprint);
      }
    }
  }

  return { placements, footprint };
}
