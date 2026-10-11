import { useDiaryEntries } from "@/hooks/use-diary-entries";
import { useSensorReadings } from "@/hooks/use-sensor-readings";
import { usePlants } from "@/hooks/use-plants";

/** A missing read cannot establish an unchecked day, even when another source succeeded. */
export function useDailyGrowCheckReads(currentTentId: string | null) {
  const diary = useDiaryEntries();
  // null disables this query; undefined would read every tent.
  const sensors = useSensorReadings(currentTentId);
  const plants = usePlants();
  // Without an assigned tent, the diary alone determines the plant's check history.
  const required = currentTentId ? [diary, sensors, plants] : [diary];
  const failed = required.some(
    (read) => read.isError || (!read.isPending && !read.isLoading && !Array.isArray(read.data)),
  );
  const pending = required.some((read) => read.isPending || read.isLoading);
  const paused = required.some((read) => read.isPending && read.fetchStatus === "paused");
  const state = failed ? "error" : pending ? (paused ? "paused" : "loading") : "ready";

  return {
    state,
    isFetching: required.some((read) => read.isFetching),
    rawDiary: diary.data ?? [],
    rawReadings: currentTentId ? (sensors.data ?? []) : [],
    plants: currentTentId ? (plants.data ?? []) : [],
    // Refetch every contributing source, including the plant count used to assign tent evidence.
    retry: () => Promise.allSettled(required.map((read) => read.refetch())),
  };
}

export type DailyGrowCheckReadState = ReturnType<typeof useDailyGrowCheckReads>["state"];
