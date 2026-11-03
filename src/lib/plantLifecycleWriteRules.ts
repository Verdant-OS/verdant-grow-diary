/**
 * Outcomes for plant archive, restore, delete, and merge writes.
 * The database remains the authority; an update that matches no row is a failure.
 */

export interface PlantWriteResult {
  data?: unknown;
  error?: { message?: string } | null;
}

export interface PlantDeleteFilter {
  eq(column: "id" | "user_id", value: string): PlantDeleteFilter;
  select(columns: "id"): PromiseLike<PlantWriteResult>;
}

export interface PlantDeleteClient {
  from(table: "plants"): {
    delete(): PlantDeleteFilter;
  };
}

export class PlantLifecycleWriteRules {
  static rowWasWritten(result: PlantWriteResult): boolean {
    if (result.error) return false;
    if (Array.isArray(result.data)) return result.data.length > 0;
    if (result.data && typeof result.data === "object") return true;
    return false;
  }

  static failureMessage(result: PlantWriteResult, fallback: string): string {
    const message = result.error?.message?.trim();
    if (message) return message;
    return fallback;
  }

  static readonly DELETE_CONFIRM_COPY =
    "This removes the plant. Diary entries, grow events, and AI Doctor sessions stay and keep this plant id. Photo files stay in storage. Pheno and origin records are deleted with the plant. If the database refuses, the plant stays and you will see the error.";

  static deleteOwnedPlant(
    client: PlantDeleteClient,
    plantId: string,
    userId: string,
  ): PromiseLike<PlantWriteResult> {
    return client.from("plants").delete().eq("id", plantId).eq("user_id", userId).select("id");
  }

  /** Nested merge confirm must not dismiss the parent dialog before the write runs. */
  static holdMergeDialog(state: { confirming: boolean; busy: boolean }): boolean {
    return state.confirming || state.busy;
  }
}

/** Label for a diary or timeline row whose plant id no longer has a plant. */
export class DeletedPlantDisplayRules {
  static readonly LABEL = "Deleted plant";

  static nameOrDeleted(
    plantId: string | null | undefined,
    knownName: string | null | undefined,
  ): string | null {
    const name = typeof knownName === "string" ? knownName.trim() : "";
    if (name) return name;
    const id = typeof plantId === "string" ? plantId.trim() : "";
    return id ? DeletedPlantDisplayRules.LABEL : null;
  }
}
