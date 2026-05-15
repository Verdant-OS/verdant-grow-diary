import {
  Plant, DiaryEntry, WateringEvent, FeedingEvent, TrainingEvent,
  Photo, SensorSnapshot, Diagnosis, Harvest,
} from "@/store/verdant";

export interface AskBundle {
  plant: Pick<Plant, "id" | "name" | "strain" | "seedType" | "medium" | "stage" | "lightSchedule" | "startDate"> | null;
  diary: Array<Pick<DiaryEntry, "id" | "type" | "timestamp" | "note" | "symptoms">>;
  watering: Array<Pick<WateringEvent, "id" | "timestamp" | "amount" | "ph" | "ec" | "runoffPh" | "runoffEc">>;
  feeding: Array<Pick<FeedingEvent, "id" | "timestamp" | "brand" | "finalEc" | "phAfterMix">>;
  training: Array<Pick<TrainingEvent, "id" | "timestamp" | "trainingType" | "areas" | "stress">>;
  photos: Array<{ id: string; timestamp: string; angle?: string; symptoms?: string; notes?: string }>;
  snapshots: Array<Pick<SensorSnapshot, "id" | "timestamp" | "source" | "confidence" | "tempF" | "humidity" | "vpd" | "soilMoisture" | "soilEC" | "ppfd" | "resEC" | "resPH">>;
  diagnosis: Array<Pick<Diagnosis, "id" | "timestamp" | "symptoms"> & { likelyIssue?: string; confidence?: string }>;
  harvest: Array<Pick<Harvest, "id" | "date" | "wetWeight" | "dryWeight" | "growAgainScore" | "finalNotes">>;
}

interface Sources {
  plants: Plant[];
  diary: DiaryEntry[];
  watering: WateringEvent[];
  feeding: FeedingEvent[];
  training: TrainingEvent[];
  photos: Photo[];
  snapshots: SensorSnapshot[];
  diagnoses: Diagnosis[];
  harvests: Harvest[];
}

const N = { diary: 5, watering: 5, feeding: 5, training: 5, photos: 3, snapshots: 3, diagnosis: 3 };

export function assembleContext(plantId: string, selected: string[], src: Sources): AskBundle {
  const plant = src.plants.find(p => p.id === plantId);
  const has = (k: string) => selected.includes(k);
  return {
    plant: plant ? {
      id: plant.id, name: plant.name, strain: plant.strain, seedType: plant.seedType,
      medium: plant.medium, stage: plant.stage, lightSchedule: plant.lightSchedule, startDate: plant.startDate,
    } : null,
    diary: has("diary") ? src.diary.filter(d => d.plantId === plantId).slice(0, N.diary)
      .map(d => ({ id: d.id, type: d.type, timestamp: d.timestamp, note: d.note, symptoms: d.symptoms })) : [],
    watering: has("watering") ? src.watering.filter(w => w.plantId === plantId).slice(0, N.watering)
      .map(w => ({ id: w.id, timestamp: w.timestamp, amount: w.amount, ph: w.ph, ec: w.ec, runoffPh: w.runoffPh, runoffEc: w.runoffEc })) : [],
    feeding: has("feeding") ? src.feeding.filter(f => f.plantId === plantId).slice(0, N.feeding)
      .map(f => ({ id: f.id, timestamp: f.timestamp, brand: f.brand, finalEc: f.finalEc, phAfterMix: f.phAfterMix })) : [],
    training: has("training") ? src.training.filter(t => t.plantId === plantId).slice(0, N.training)
      .map(t => ({ id: t.id, timestamp: t.timestamp, trainingType: t.trainingType, areas: t.areas, stress: t.stress })) : [],
    photos: has("photos") ? src.photos.filter(p => p.plantId === plantId).slice(0, N.photos)
      .map(p => ({ id: p.id, timestamp: p.timestamp, angle: p.angle, symptoms: p.symptoms, notes: p.notes })) : [],
    snapshots: has("snapshots") ? src.snapshots.filter(s => !s.plantId || s.plantId === plantId).slice(0, N.snapshots)
      .map(s => ({ id: s.id, timestamp: s.timestamp, source: s.source, confidence: s.confidence,
        tempF: s.tempF, humidity: s.humidity, vpd: s.vpd, soilMoisture: s.soilMoisture, soilEC: s.soilEC,
        ppfd: s.ppfd, resEC: s.resEC, resPH: s.resPH })) : [],
    diagnosis: has("diagnosis") ? src.diagnoses.filter(d => d.plantId === plantId).slice(0, N.diagnosis)
      .map(d => ({ id: d.id, timestamp: d.timestamp, symptoms: d.symptoms,
        likelyIssue: d.result?.likelyIssue, confidence: d.result?.confidence })) : [],
    harvest: has("harvest") ? src.harvests.filter(h => h.plantId === plantId)
      .map(h => ({ id: h.id, date: h.date, wetWeight: h.wetWeight, dryWeight: h.dryWeight,
        growAgainScore: h.growAgainScore, finalNotes: h.finalNotes })) : [],
  };
}
