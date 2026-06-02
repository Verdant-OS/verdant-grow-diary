// Mock data layer. Swap to Supabase later by replacing `src/hooks/useMockData.ts`.

export type Stage = "seedling" | "veg" | "flower" | "flush" | "harvest" | "cure";

export interface Tent {
  id: string;
  name: string;
  brand: string;
  size: string;
  /** null when the source row has no stage or an unmapped value. */
  stage: Stage | null;
  light: { on: boolean; schedule: string; wattage: number };
  alertCount: number;
  growId?: string | null;
}

export interface Plant {
  id: string;
  name: string;
  strain: string;
  tentId: string;
  /** null when the source row has no stage or an unmapped value. */
  stage: Stage | null;
  startedAt: string;
  health: "healthy" | "watch" | "issue";
  photo: string;
  lastNote: string;
  growId?: string | null;
  isArchived?: boolean;
}

/**
 * Provenance of a sensor reading as displayed to the grower. Distinct
 * from {@link SensorReadingHealthStatus} (which is the contract status).
 *
 * - "live"    real-time bridge / device telemetry
 * - "manual"  grower-entered snapshot
 * - "csv"     bulk imported from a CSV
 * - "demo"    synthetic mock data — MUST be visibly labeled
 * - "stale"   provenance known but outside freshness window
 * - "invalid" provenance known but the payload failed validation
 */
export type SensorReadingSource =
  | "live"
  | "manual"
  | "csv"
  | "demo"
  | "stale"
  | "invalid";

/**
 * Re-exported canonical SnapshotStatus so consumers don't reach into the
 * contract module for the type — keeps duplication out of JSX.
 */
export type SensorReadingHealthStatus =
  | "usable"
  | "stale"
  | "invalid"
  | "needs_review"
  | "no_data";

export interface SensorReading {
  ts: string;
  tentId: string;
  temp: number;
  rh: number;
  vpd: number;
  co2: number;
  soil: number;
  /** Provenance label. Demo data must always carry "demo". */
  source: SensorReadingSource;
  /**
   * Canonical Sensor Snapshot Status Contract v1 status for this reading.
   * Never default to "usable" for unknown/synthetic data — use
   * "needs_review" or "no_data" instead.
   */
  status: SensorReadingHealthStatus;
  /** ISO timestamp the reading was actually captured at the source. */
  capturedAt: string;
  /** Optional confidence in the value (0..1). */
  confidence?: number;
}

export interface Camera {
  id: string;
  tentId: string;
  name: string;
  online: boolean;
  thumbnail: string;
  lastFrameAt: string;
}

export interface Task {
  id: string;
  title: string;
  type: "water" | "feed" | "training" | "defoliation" | "flush" | "inspect";
  tentId?: string;
  plantId?: string;
  dueAt: string;
  status: "today" | "upcoming" | "done";
  recurring?: string;
}

export interface Alert {
  id: string;
  severity: "critical" | "warning" | "info";
  source: "sensor" | "task" | "ai";
  tentId?: string;
  title: string;
  detail: string;
  createdAt: string;
  acknowledged: boolean;
}

export interface AIInsight {
  id: string;
  tentId?: string;
  plantId?: string;
  title: string;
  summary: string;
  confidence: number;
  recommendations: string[];
}

const PHOTO = (seed: string) =>
  `https://images.unsplash.com/photo-${seed}?auto=format&fit=crop&w=600&q=70`;

export const tents: Tent[] = [
  { id: "t1", name: "Tent A", brand: "Spider Farmer", size: "4x4", stage: "flower", light: { on: true, schedule: "12/12", wattage: 450 }, alertCount: 1 },
  { id: "t2", name: "Tent B", brand: "AC Infinity", size: "3x3", stage: "veg", light: { on: true, schedule: "18/6", wattage: 240 }, alertCount: 0 },
  { id: "t3", name: "Tent C", brand: "Vivosun", size: "2x2", stage: "seedling", light: { on: true, schedule: "20/4", wattage: 100 }, alertCount: 0 },
  { id: "t4", name: "Tent D", brand: "Spider Farmer", size: "5x5", stage: "flush", light: { on: false, schedule: "12/12", wattage: 650 }, alertCount: 2 },
];

export const plants: Plant[] = [
  { id: "p1", name: "GG #1", strain: "Gorilla Glue #4", tentId: "t1", stage: "flower", startedAt: "2026-02-10", health: "healthy", photo: PHOTO("1536819114556-1c10c4b1cf8a"), lastNote: "Trichomes turning cloudy" },
  { id: "p2", name: "GG #2", strain: "Gorilla Glue #4", tentId: "t1", stage: "flower", startedAt: "2026-02-10", health: "watch", photo: PHOTO("1503262028195-93c528f03218"), lastNote: "Slight nute burn on tips" },
  { id: "p3", name: "ZK #1", strain: "Zkittlez", tentId: "t2", stage: "veg", startedAt: "2026-03-15", health: "healthy", photo: PHOTO("1518915334520-5cb1c1f8e123"), lastNote: "LST applied" },
  { id: "p4", name: "ZK #2", strain: "Zkittlez", tentId: "t2", stage: "veg", startedAt: "2026-03-15", health: "healthy", photo: PHOTO("1530836369250-ef72a3f5cda8"), lastNote: "Topped at node 5" },
  { id: "p5", name: "WW Auto", strain: "White Widow Auto", tentId: "t3", stage: "seedling", startedAt: "2026-04-28", health: "healthy", photo: PHOTO("1466692476868-aef1dfb1e735"), lastNote: "First true leaves" },
  { id: "p6", name: "BD #1", strain: "Blue Dream", tentId: "t4", stage: "flush", startedAt: "2026-01-20", health: "issue", photo: PHOTO("1507371341162-763b5e419408"), lastNote: "Late-flower yellowing" },
];

// 7 days * 24 hourly readings per tent.
function genReadings(): SensorReading[] {
  const now = Date.now();
  const out: SensorReading[] = [];
  for (const t of tents) {
    const tempBase = t.stage === "flower" || t.stage === "flush" ? 24 : 26;
    const rhBase = t.stage === "flower" || t.stage === "flush" ? 48 : 62;
    for (let h = 24 * 7; h >= 0; h--) {
      const ts = new Date(now - h * 3600 * 1000).toISOString();
      const phase = (h / 24) * Math.PI * 2;
      const temp = +(tempBase + Math.sin(phase) * 2 + (Math.random() - 0.5)).toFixed(1);
      const rh = +(rhBase + Math.cos(phase) * 6 + (Math.random() - 0.5) * 2).toFixed(1);
      const vpd = +Math.max(0.4, ((1 - rh / 100) * (0.6108 * Math.exp((17.27 * temp) / (temp + 237.3))))).toFixed(2);
      const co2 = Math.round(700 + Math.sin(phase) * 150 + (Math.random() - 0.5) * 40);
      const soil = +(38 + Math.sin(phase / 3) * 10 + (Math.random() - 0.5) * 4).toFixed(1);
      out.push({
        ts,
        tentId: t.id,
        temp,
        rh,
        vpd,
        co2,
        soil,
        // Mock fixtures are NEVER live data. They are tagged demo and
        // explicitly classified as needs_review so the contract gate in
        // countsAsHealthyEvidence() cannot ever treat them as healthy.
        source: "demo",
        status: "needs_review",
        capturedAt: ts,
      });
    }
  }
  return out;
}

export const sensorReadings: SensorReading[] = genReadings();

export const cameras: Camera[] = [
  { id: "c1", tentId: "t1", name: "Tent A · Front", online: true, thumbnail: PHOTO("1536819114556-1c10c4b1cf8a"), lastFrameAt: new Date(Date.now() - 60_000).toISOString() },
  { id: "c2", tentId: "t2", name: "Tent B · Top", online: true, thumbnail: PHOTO("1518915334520-5cb1c1f8e123"), lastFrameAt: new Date(Date.now() - 90_000).toISOString() },
  { id: "c3", tentId: "t3", name: "Tent C · Side", online: false, thumbnail: PHOTO("1466692476868-aef1dfb1e735"), lastFrameAt: new Date(Date.now() - 6 * 3600_000).toISOString() },
  { id: "c4", tentId: "t4", name: "Tent D · Front", online: true, thumbnail: PHOTO("1507371341162-763b5e419408"), lastFrameAt: new Date(Date.now() - 120_000).toISOString() },
];

const today = new Date();
const addDays = (d: number) => new Date(today.getTime() + d * 86400_000).toISOString();

export const tasks: Task[] = [
  { id: "k1", title: "Water Tent A", type: "water", tentId: "t1", dueAt: addDays(0), status: "today", recurring: "every 2 days" },
  { id: "k2", title: "Feed Tent B (Bloom A+B)", type: "feed", tentId: "t2", dueAt: addDays(0), status: "today" },
  { id: "k3", title: "Defoliate lower fans (Tent A)", type: "defoliation", tentId: "t1", dueAt: addDays(1), status: "upcoming" },
  { id: "k4", title: "Flush Tent D", type: "flush", tentId: "t4", dueAt: addDays(2), status: "upcoming" },
  { id: "k5", title: "Inspect trichomes (GG #1)", type: "inspect", tentId: "t1", plantId: "p1", dueAt: addDays(3), status: "upcoming" },
  { id: "k6", title: "Water Tent C", type: "water", tentId: "t3", dueAt: addDays(-1), status: "done" },
  { id: "k7", title: "LST Tent B plants", type: "training", tentId: "t2", dueAt: addDays(-2), status: "done" },
];

export const alerts: Alert[] = [
  { id: "a1", severity: "critical", source: "sensor", tentId: "t4", title: "RH spike in Tent D", detail: "Humidity at 71% for 90 minutes during flush.", createdAt: new Date(Date.now() - 30 * 60_000).toISOString(), acknowledged: false },
  { id: "a2", severity: "warning", source: "sensor", tentId: "t1", title: "VPD outside target", detail: "VPD 1.7 kPa — above 1.5 ceiling for flower.", createdAt: new Date(Date.now() - 2 * 3600_000).toISOString(), acknowledged: false },
  { id: "a3", severity: "warning", source: "task", tentId: "t3", title: "Watering overdue", detail: "Tent C watering was scheduled 18h ago.", createdAt: new Date(Date.now() - 18 * 3600_000).toISOString(), acknowledged: false },
  { id: "a4", severity: "info", source: "ai", tentId: "t1", title: "Harvest window approaching", detail: "GG #1 trichomes likely 10–14 days from peak ripeness.", createdAt: new Date(Date.now() - 6 * 3600_000).toISOString(), acknowledged: true },
];

export const aiInsights: AIInsight[] = [
  { id: "i1", tentId: "t4", title: "Mold risk rising in Tent D", summary: "Sustained 65%+ RH during late flower combined with lights-off temp drops.", confidence: 0.82, recommendations: ["Increase exhaust fan to 70%", "Add a small dehumidifier targeting 45–50% RH", "Defoliate inner-canopy fans for airflow"] },
  { id: "i2", tentId: "t1", plantId: "p2", title: "Mild nute burn on GG #2", summary: "Tip burn on upper colas suggests EC slightly high for flower stage.", confidence: 0.74, recommendations: ["Drop EC to 1.6 next feed", "Plain-water flush at next watering", "Re-test runoff EC after 2 cycles"] },
  { id: "i3", tentId: "t2", title: "Optimal training window", summary: "Tent B nodes 4–6 ideal for low-stress training to flatten the canopy.", confidence: 0.91, recommendations: ["Apply LST to side branches", "Tuck dominant cola tips", "Re-evaluate canopy in 5 days"] },
];
