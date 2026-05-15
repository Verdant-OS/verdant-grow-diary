// React Query-style hooks over mock data. Replace with Supabase queries to go live.
import { useQuery } from "@tanstack/react-query";
import { tents, plants, sensorReadings, cameras, tasks, alerts, aiInsights } from "@/mock";

const sleep = (ms = 120) => new Promise((r) => setTimeout(r, ms));

export const useTents = () => useQuery({ queryKey: ["tents"], queryFn: async () => { await sleep(); return tents; } });
export const useTent = (id?: string) => useQuery({ queryKey: ["tent", id], enabled: !!id, queryFn: async () => { await sleep(); return tents.find((t) => t.id === id) ?? null; } });
export const usePlants = (tentId?: string) => useQuery({ queryKey: ["plants", tentId ?? "all"], queryFn: async () => { await sleep(); return tentId ? plants.filter((p) => p.tentId === tentId) : plants; } });
export const usePlant = (id?: string) => useQuery({ queryKey: ["plant", id], enabled: !!id, queryFn: async () => { await sleep(); return plants.find((p) => p.id === id) ?? null; } });
export const useSensorReadings = (tentId?: string) => useQuery({ queryKey: ["sensors", tentId ?? "all"], queryFn: async () => { await sleep(); return tentId ? sensorReadings.filter((r) => r.tentId === tentId) : sensorReadings; } });
export const useCameras = () => useQuery({ queryKey: ["cameras"], queryFn: async () => { await sleep(); return cameras; } });
export const useCamera = (id?: string) => useQuery({ queryKey: ["camera", id], enabled: !!id, queryFn: async () => { await sleep(); return cameras.find((c) => c.id === id) ?? null; } });
export const useTasks = () => useQuery({ queryKey: ["tasks"], queryFn: async () => { await sleep(); return tasks; } });
export const useAlerts = () => useQuery({ queryKey: ["alerts"], queryFn: async () => { await sleep(); return alerts; } });
export const useAIInsights = () => useQuery({ queryKey: ["ai-insights"], queryFn: async () => { await sleep(); return aiInsights; } });
