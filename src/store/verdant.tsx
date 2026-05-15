import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from "react";

// ---------------- Types ----------------
export type Stage = "seedling" | "veg" | "preflower" | "flower" | "late-flower" | "harvest";
export type SeedType = "autoflower" | "feminized" | "regular";
export type Medium = "soil" | "coco" | "peat" | "hydro";
export type DataSource = "demo" | "manual" | "live" | "stale";
export type Confidence = "good" | "suspicious" | "stale" | "missing";
export type EventType =
  | "note" | "watering" | "feeding" | "training" | "photo"
  | "diagnosis" | "environment" | "transplant" | "harvest" | "reminder";

export interface Plant {
  id: string;
  name: string;
  strain: string;
  seedType: SeedType;
  startDate: string;     // ISO
  stage: Stage;
  potSize: string;
  medium: Medium;
  lightSchedule: string; // "18/6", "12/12"
  notes: string;
  archived?: boolean;
}

export interface SensorSnapshot {
  id: string;
  plantId?: string;
  timestamp: string;
  source: DataSource;
  tempF?: number;
  humidity?: number;
  vpd?: number;
  soilTempF?: number;
  soilMoisture?: number;
  soilEC?: number;
  ppfd?: number;
  resEC?: number;
  resPH?: number;
  confidence: Confidence;
  warnings: string[];
}

export interface DiaryEntry {
  id: string;
  plantId: string;
  timestamp: string;
  type: EventType;
  stage?: Stage;
  note: string;
  symptoms?: string;
  actions?: string;
  envNotes?: string;
  photoIds: string[];
  snapshotId?: string;
  refId?: string; // points to source event (watering/feeding/etc)
}

export interface WateringEvent {
  id: string; plantId: string; timestamp: string;
  amount?: number; ph?: number; ec?: number;
  runoffAmount?: number; runoffPh?: number; runoffEc?: number;
  soilMoistureBefore?: number; soilMoistureAfter?: number;
  nutrientsAdded?: boolean; notes?: string;
  photoIds?: string[]; snapshotId?: string;
}

export interface FeedingEvent {
  id: string; plantId: string; timestamp: string;
  brand?: string; products?: string; dosePerUnit?: string;
  totalVolume?: number; startEc?: number; finalEc?: number;
  phAfterMix?: number; runoffEc?: number; runoffPh?: number;
  response?: string;
  photoIds?: string[]; snapshotId?: string;
}

export type TrainingType = "topping" | "defoliation" | "LST" | "HST" | "pruning" | "leaf-tucking" | "transplant";
export interface TrainingEvent {
  id: string; plantId: string; timestamp: string;
  trainingType: TrainingType; areas?: string;
  stress?: "low" | "med" | "high";
  recoveryNotes?: string; followup24?: string; followup72?: string;
  photoIds?: string[]; snapshotId?: string;
}

export interface Photo {
  id: string; plantId: string; timestamp: string;
  stage?: Stage; angle?: string; notes?: string;
  symptoms?: string;
  diagnosisId?: string;
  diaryEntryId?: string;
  dataUrl: string;
}

export interface Diagnosis {
  id: string; plantId: string; timestamp: string;
  photoIds: string[]; context: Record<string, string>;
  symptoms?: string;
  snapshotId?: string;
  result?: {
    likelyIssue: string; confidence: "low" | "medium" | "high";
    visualClues: string[]; possibleCauses: string[];
    immediateAction: string; doNot: string;
    followup24: string; followup72: string;
    category: string;
  };
  placeholder?: boolean;
}

export interface Harvest {
  id: string; plantId: string; date: string;
  wetWeight?: number; dryWeight?: number; trimWeight?: number;
  daysFromSprout?: number; yieldPerPlant?: number;
  aroma?: string; density?: string; bagAppeal?: number;
  smokeQuality?: string; mistakes?: string;
  growAgainScore?: number; finalNotes?: string;
  photoIds?: string[]; snapshotId?: string;
}

export interface CalendarEvent {
  id: string; plantId?: string; date: string;
  type: EventType; title: string; sourceId?: string;
}

export interface SMSOptIn {
  id: string; name: string; phone: string;
  plantStrain?: string; growWeek?: number;
  preference?: string; consent: boolean; notes?: string; createdAt: string;
}

export interface ActionQueueItem {
  id: string; plantId?: string; createdAt: string;
  title: string; detail?: string;
  status: "pending" | "approved" | "done" | "rejected";
}

export type SafetyMode = "observe" | "approval" | "guardrailed";

interface State {
  plants: Plant[];
  diary: DiaryEntry[];
  watering: WateringEvent[];
  feeding: FeedingEvent[];
  training: TrainingEvent[];
  photos: Photo[];
  diagnoses: Diagnosis[];
  harvests: Harvest[];
  snapshots: SensorSnapshot[];
  events: CalendarEvent[];
  optIns: SMSOptIn[];
  queue: ActionQueueItem[];
  safetyMode: SafetyMode;
  workspaceName: string;
}

interface Ctx extends State {
  upsertPlant: (p: Plant) => void;
  deletePlant: (id: string) => void;
  addDiary: (e: Omit<DiaryEntry, "id">) => DiaryEntry;
  addWatering: (w: Omit<WateringEvent, "id">) => void;
  addFeeding: (f: Omit<FeedingEvent, "id">) => void;
  addTraining: (t: Omit<TrainingEvent, "id">) => void;
  addPhoto: (p: Omit<Photo, "id">) => Photo;
  logPhoto: (p: Omit<Photo, "id" | "diaryEntryId">, opts?: { snapshotId?: string; note?: string }) => { photo: Photo; diaryEntry: DiaryEntry };
  addDiagnosis: (d: Omit<Diagnosis, "id">) => Diagnosis;
  addHarvest: (h: Omit<Harvest, "id">) => void;
  addSnapshot: (s: Omit<SensorSnapshot, "id" | "warnings" | "confidence">) => SensorSnapshot;
  addEvent: (e: Omit<CalendarEvent, "id">) => void;
  addOptIn: (o: Omit<SMSOptIn, "id" | "createdAt">) => void;
  addQueueItem: (q: Omit<ActionQueueItem, "id" | "createdAt" | "status">) => void;
  updateQueueItem: (id: string, patch: Partial<ActionQueueItem>) => void;
  setSafetyMode: (m: SafetyMode) => void;
  exportAll: () => string;
  reset: () => void;
}

const KEY = "verdant.state.v1";

function uid() { return Math.random().toString(36).slice(2, 10); }

function validateSnapshot(s: Omit<SensorSnapshot, "id" | "warnings" | "confidence">): { warnings: string[]; confidence: Confidence } {
  const w: string[] = [];
  if (s.tempF !== undefined) {
    if (s.tempF > 0 && s.tempF < 50) w.push("Temp around " + s.tempF + "°F looks low — possible Celsius value entered.");
    if (s.tempF > 100) w.push("Temp above 100°F is risky for canopy.");
  }
  if (s.humidity !== undefined) {
    if ([0, 1, 100].includes(Math.round(s.humidity))) w.push("Humidity reading at extreme value (" + s.humidity + "%) — sensor may be faulty.");
  }
  if (s.soilMoisture !== undefined && (s.soilMoisture === 0 || s.soilMoisture === 100)) {
    w.push("Soil moisture at " + s.soilMoisture + "% — sensor likely disconnected or saturated.");
  }
  if (s.soilEC !== undefined && s.soilEC > 1000) {
    w.push("Soil EC raw value " + s.soilEC + " looks like raw (µS) — please confirm units.");
  }
  if (s.resPH !== undefined && (s.resPH < 4 || s.resPH > 9)) w.push("pH " + s.resPH + " is outside realistic range.");
  if (s.source === "demo") w.push("Demo data — not a real reading.");
  const ageHrs = (Date.now() - new Date(s.timestamp).getTime()) / 36e5;
  let confidence: Confidence = "good";
  if (s.source === "stale" || ageHrs > 6) { confidence = "stale"; w.push("Snapshot is stale (" + ageHrs.toFixed(1) + "h old)."); }
  if (w.length > 1 && confidence === "good") confidence = "suspicious";
  if (s.tempF === undefined && s.humidity === undefined) confidence = "missing";
  return { warnings: w, confidence };
}

function seed(): State {
  const today = new Date();
  const iso = (d: Date) => d.toISOString();
  const daysAgo = (n: number) => { const d = new Date(today); d.setDate(d.getDate() - n); return d; };

  const og: Plant = {
    id: "demo-og", name: "OG Kush Auto #1", strain: "OG Kush Auto", seedType: "autoflower",
    startDate: iso(daysAgo(38)), stage: "preflower", potSize: "5 gal", medium: "coco",
    lightSchedule: "20/4", notes: "Sample demo plant. Replace with your own.",
  };
  const sd: Plant = {
    id: "demo-sd", name: "Sour Diesel Auto #1", strain: "Sour Diesel Auto", seedType: "autoflower",
    startDate: iso(daysAgo(22)), stage: "veg", potSize: "3 gal", medium: "soil",
    lightSchedule: "18/6", notes: "Sample demo plant.",
  };

  const snap: SensorSnapshot = {
    id: "demo-snap", timestamp: iso(daysAgo(0)), source: "demo",
    tempF: 76, humidity: 55, vpd: 1.1, soilMoisture: 38, soilEC: 1.8, ppfd: 620,
    confidence: "good", warnings: ["Demo data — not a real reading."],
  };

  const diary: DiaryEntry[] = [
    { id: "d1", plantId: og.id, timestamp: iso(daysAgo(2)), type: "watering", stage: "preflower",
      note: "Watered to 15% runoff, runoff pH 6.0", photoIds: [], snapshotId: snap.id },
    { id: "d2", plantId: og.id, timestamp: iso(daysAgo(1)), type: "training", stage: "preflower",
      note: "Light leaf tucking — exposed two lower bud sites.", photoIds: [] },
    { id: "d3", plantId: sd.id, timestamp: iso(daysAgo(3)), type: "feeding", stage: "veg",
      note: "Half-strength veg nutes, EC 1.4, pH 6.2", photoIds: [] },
    { id: "d4", plantId: sd.id, timestamp: iso(daysAgo(0)), type: "note", stage: "veg",
      note: "Slight clawing on top fan leaves — watching nitrogen.", symptoms: "Leaf claw", photoIds: [] },
  ];

  return {
    plants: [og, sd],
    diary,
    watering: [], feeding: [], training: [], photos: [], diagnoses: [], harvests: [],
    snapshots: [snap],
    events: [
      { id: "e1", plantId: og.id, date: iso(daysAgo(-1)), type: "watering", title: "Water OG Kush" },
      { id: "e2", plantId: sd.id, date: iso(daysAgo(-2)), type: "feeding", title: "Feed Sour Diesel" },
    ],
    optIns: [],
    queue: [],
    safetyMode: "approval",
    workspaceName: "My Verdant Workspace",
  };
}

function load(): State {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return seed();
    return { ...seed(), ...JSON.parse(raw) };
  } catch { return seed(); }
}

const Context = createContext<Ctx | null>(null);

export function VerdantProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(() => load());

  useEffect(() => { localStorage.setItem(KEY, JSON.stringify(state)); }, [state]);

  const ctx: Ctx = useMemo(() => ({
    ...state,
    upsertPlant: (p) => setState(s => {
      const exists = s.plants.find(x => x.id === p.id);
      return { ...s, plants: exists ? s.plants.map(x => x.id === p.id ? p : x) : [...s.plants, p] };
    }),
    deletePlant: (id) => setState(s => ({ ...s, plants: s.plants.filter(p => p.id !== id) })),
    addDiary: (e) => {
      const entry: DiaryEntry = { id: uid(), ...e };
      setState(s => ({ ...s, diary: [entry, ...s.diary] }));
      return entry;
    },
    addWatering: (w) => {
      const id = uid();
      setState(s => {
        const snapshotId = w.snapshotId ?? s.snapshots[0]?.id;
        const photoIds = w.photoIds ?? [];
        return { ...s, watering: [{ id, ...w, snapshotId, photoIds }, ...s.watering],
          diary: [{ id: uid(), plantId: w.plantId, timestamp: w.timestamp, type: "watering",
            note: `Watered ${w.amount ?? "?"} ${w.runoffAmount ? `· runoff ${w.runoffAmount}` : ""}`,
            photoIds, snapshotId, refId: id }, ...s.diary] };
      });
    },
    addFeeding: (f) => {
      const id = uid();
      setState(s => {
        const snapshotId = f.snapshotId ?? s.snapshots[0]?.id;
        const photoIds = f.photoIds ?? [];
        return { ...s, feeding: [{ id, ...f, snapshotId, photoIds }, ...s.feeding],
          diary: [{ id: uid(), plantId: f.plantId, timestamp: f.timestamp, type: "feeding",
            note: `Fed ${f.brand ?? ""} EC ${f.finalEc ?? "?"} pH ${f.phAfterMix ?? "?"}`,
            photoIds, snapshotId, refId: id }, ...s.diary] };
      });
    },
    addTraining: (t) => {
      const id = uid();
      setState(s => {
        const snapshotId = t.snapshotId ?? s.snapshots[0]?.id;
        const photoIds = t.photoIds ?? [];
        return { ...s, training: [{ id, ...t, snapshotId, photoIds }, ...s.training],
          diary: [{ id: uid(), plantId: t.plantId, timestamp: t.timestamp, type: "training",
            note: `${t.trainingType} · ${t.areas ?? ""}`, photoIds, snapshotId, refId: id }, ...s.diary] };
      });
    },
    addPhoto: (p) => {
      const photo: Photo = { id: uid(), ...p };
      setState(s => ({ ...s, photos: [photo, ...s.photos] }));
      return photo;
    },
    logPhoto: (p, opts) => {
      // Adds photo AND a linked diary entry of type "photo"
      const photoId = uid();
      const diaryId = uid();
      let result: { photo: Photo; diaryEntry: DiaryEntry } | null = null;
      setState(s => {
        const snapshotId = opts?.snapshotId ?? s.snapshots[0]?.id;
        const photo: Photo = { id: photoId, ...p, diaryEntryId: diaryId };
        const diaryEntry: DiaryEntry = {
          id: diaryId, plantId: p.plantId, timestamp: p.timestamp, type: "photo",
          stage: p.stage, note: opts?.note || `Photo · ${p.angle || "captured"}`,
          symptoms: p.symptoms, photoIds: [photoId], snapshotId, refId: photoId,
        };
        result = { photo, diaryEntry };
        return { ...s, photos: [photo, ...s.photos], diary: [diaryEntry, ...s.diary] };
      });
      return result!;
    },
    addDiagnosis: (d) => {
      const diag: Diagnosis = { id: uid(), ...d };
      setState(s => {
        const snapshotId = d.snapshotId ?? s.snapshots[0]?.id;
        const merged = { ...diag, snapshotId };
        return { ...s, diagnoses: [merged, ...s.diagnoses],
          diary: [{ id: uid(), plantId: d.plantId, timestamp: d.timestamp, type: "diagnosis",
            note: d.result?.likelyIssue ?? "Diagnosis requested · AI provider not connected",
            symptoms: d.symptoms,
            photoIds: d.photoIds, snapshotId, refId: diag.id }, ...s.diary] };
      });
      return diag;
    },
    addHarvest: (h) => {
      const id = uid();
      setState(s => {
        const snapshotId = h.snapshotId ?? s.snapshots[0]?.id;
        const photoIds = h.photoIds ?? [];
        return { ...s, harvests: [{ id, ...h, snapshotId, photoIds }, ...s.harvests],
          diary: [{ id: uid(), plantId: h.plantId, timestamp: h.date, type: "harvest",
            note: `Harvest · wet ${h.wetWeight ?? "?"}g`, photoIds, snapshotId, refId: id }, ...s.diary] };
      });
    },
    addSnapshot: (raw) => {
      const v = validateSnapshot(raw);
      const snap: SensorSnapshot = { id: uid(), ...raw, ...v };
      setState(s => {
        const next: State = { ...s, snapshots: [snap, ...s.snapshots] };
        if (raw.plantId) {
          const noteParts = [
            raw.tempF !== undefined ? `${raw.tempF}°F` : null,
            raw.humidity !== undefined ? `${raw.humidity}% RH` : null,
            raw.vpd !== undefined ? `VPD ${raw.vpd}` : null,
          ].filter(Boolean);
          next.diary = [{
            id: uid(), plantId: raw.plantId, timestamp: raw.timestamp,
            type: "environment", note: `Snapshot · ${noteParts.join(" · ") || "captured"}`,
            photoIds: [], snapshotId: snap.id, refId: snap.id,
          }, ...s.diary];
        }
        return next;
      });
      return snap;
    },
    addEvent: (e) => {
      const id = uid();
      setState(s => {
        const ev: CalendarEvent = { id, ...e };
        const next: State = { ...s, events: [ev, ...s.events] };
        // If event has plantId, also create a paired diary entry of matching type for round-trip
        if (e.plantId) {
          const diaryId = uid();
          next.diary = [{
            id: diaryId, plantId: e.plantId, timestamp: e.date,
            type: e.type, note: e.title, photoIds: [], refId: e.sourceId || id,
          }, ...s.diary];
        }
        return next;
      });
    },
    addOptIn: (o) => setState(s => ({ ...s, optIns: [{ id: uid(), createdAt: new Date().toISOString(), ...o }, ...s.optIns] })),
    addQueueItem: (q) => setState(s => ({ ...s, queue: [{ id: uid(), createdAt: new Date().toISOString(), status: "pending", ...q }, ...s.queue] })),
    updateQueueItem: (id, patch) => setState(s => ({ ...s, queue: s.queue.map(q => q.id === id ? { ...q, ...patch } : q) })),
    setSafetyMode: (m) => setState(s => ({ ...s, safetyMode: m })),
    exportAll: () => {
      const { ...rest } = state;
      return JSON.stringify(rest, null, 2);
    },
    reset: () => setState(seed()),
  }), [state]);

  return <Context.Provider value={ctx}>{children}</Context.Provider>;
}

export function useVerdant() {
  const c = useContext(Context);
  if (!c) throw new Error("useVerdant must be used within VerdantProvider");
  return c;
}

// ---------------- Helpers ----------------
export function dayOfPlant(p: Plant) {
  return Math.floor((Date.now() - new Date(p.startDate).getTime()) / 86400000) + 1;
}
export function weekOfPlant(p: Plant) { return Math.ceil(dayOfPlant(p) / 7); }
export function plantById(plants: Plant[], id?: string) { return plants.find(p => p.id === id); }

export type RefKind = "watering" | "feeding" | "training" | "photo" | "diagnosis" | "harvest" | "snapshot";

export interface ResolvedRef { kind: RefKind; record: any; tab: string; }

export function resolveRef(entry: DiaryEntry, state: Pick<State, "watering" | "feeding" | "training" | "photos" | "diagnoses" | "harvests" | "snapshots">): ResolvedRef | null {
  if (!entry.refId) return null;
  const map: Array<[EventType, RefKind, any[], string]> = [
    ["watering", "watering", state.watering, "watering"],
    ["feeding", "feeding", state.feeding, "feeding"],
    ["training", "training", state.training, "training"],
    ["photo", "photo", state.photos, "photos"],
    ["diagnosis", "diagnosis", state.diagnoses, "diagnosis"],
    ["harvest", "harvest", state.harvests, "harvest"],
    ["environment", "snapshot", state.snapshots, "snapshots"],
  ];
  for (const [type, kind, arr, tab] of map) {
    if (entry.type === type) {
      const rec = arr.find((r: any) => r.id === entry.refId);
      if (rec) return { kind, record: rec, tab };
    }
  }
  return null;
}

export interface RelationshipIssue { kind: string; id: string; issue: string; }

export function validateRelationships(state: Pick<State, "diary" | "watering" | "feeding" | "training" | "photos" | "diagnoses" | "harvests" | "snapshots">): RelationshipIssue[] {
  const issues: RelationshipIssue[] = [];
  for (const d of state.diary) {
    if (d.refId && !resolveRef(d, state)) issues.push({ kind: "diary", id: d.id, issue: `refId ${d.refId} not found for type ${d.type}` });
    if (d.snapshotId && !state.snapshots.find(s => s.id === d.snapshotId)) issues.push({ kind: "diary", id: d.id, issue: `snapshotId ${d.snapshotId} missing` });
    for (const pid of d.photoIds || []) {
      if (!state.photos.find(p => p.id === pid)) issues.push({ kind: "diary", id: d.id, issue: `photo ${pid} missing` });
    }
  }
  const hasBacklink = (refId: string, type: EventType) => state.diary.some(d => d.refId === refId && d.type === type);
  for (const w of state.watering) if (!hasBacklink(w.id, "watering")) issues.push({ kind: "watering", id: w.id, issue: "no diary back-link" });
  for (const f of state.feeding) if (!hasBacklink(f.id, "feeding")) issues.push({ kind: "feeding", id: f.id, issue: "no diary back-link" });
  for (const t of state.training) if (!hasBacklink(t.id, "training")) issues.push({ kind: "training", id: t.id, issue: "no diary back-link" });
  for (const dx of state.diagnoses) if (!hasBacklink(dx.id, "diagnosis")) issues.push({ kind: "diagnosis", id: dx.id, issue: "no diary back-link" });
  for (const h of state.harvests) if (!hasBacklink(h.id, "harvest")) issues.push({ kind: "harvest", id: h.id, issue: "no diary back-link" });
  for (const p of state.photos) if (!p.diaryEntryId) issues.push({ kind: "photo", id: p.id, issue: "no diaryEntryId" });
  return issues;
}
