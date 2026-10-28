/**
 * Strain Reference Library V1.1 — read-only reference service.
 *
 * The only I/O on the public cultivar read path. It issues SELECTs against the
 * published reference surface with the caller's client (the publishable key
 * under RLS), using the exact column lists the read model understands. It never
 * writes, never calls Edge Functions or RPCs, never uses the service role, and
 * never reads private grow data. Mapping and validation live in
 * `cultivarDatabaseReadModel.ts`.
 */
import {
  CULTIVAR_DATABASE_READ_SURFACE,
  CULTIVAR_DATABASE_TABLES,
  type CultivarDatabaseRow,
  type CultivarDatabaseSnapshot,
  type CultivarDatabaseTable,
} from "@/lib/cultivarDatabaseReadModel";

interface QueryResult {
  data: readonly CultivarDatabaseRow[] | null;
  error: { message: string } | null;
}

/** The SELECT-only slice of a Supabase client this service may touch. */
export interface CultivarReferenceReadClient {
  from(table: string): {
    select(columns: string): PromiseLike<QueryResult> & {
      eq(column: string, value: string): PromiseLike<QueryResult>;
    };
  };
}

/** PostgREST's default max-rows. A full page means the read may be truncated. */
export const CULTIVAR_READ_ROW_CEILING = 1000;

/** Tables whose rows carry their own publication status and are filtered server-side too. */
const PUBLISHED_FILTERS: Partial<Record<CultivarDatabaseTable, string>> = {
  cultivars: "publication_status",
  cultivar_guides: "publication_status",
};

export type CultivarSnapshotResult =
  { ok: true; snapshot: CultivarDatabaseSnapshot } | { ok: false; error: string };

export async function fetchPublishedCultivarSnapshot(
  client: CultivarReferenceReadClient,
): Promise<CultivarSnapshotResult> {
  try {
    const results = await Promise.all(
      CULTIVAR_DATABASE_TABLES.map(async (table) => {
        const query = client.from(table).select(CULTIVAR_DATABASE_READ_SURFACE[table]);
        const filter = PUBLISHED_FILTERS[table];
        const { data, error } = await (filter ? query.eq(filter, "published") : query);
        return { table, data, error };
      }),
    );
    const snapshot = {} as Record<CultivarDatabaseTable, readonly CultivarDatabaseRow[]>;
    for (const { table, data, error } of results) {
      if (error) return { ok: false, error: `${table}: ${error.message}` };
      if (!Array.isArray(data)) return { ok: false, error: `${table}: no rows array returned` };
      if (data.length >= CULTIVAR_READ_ROW_CEILING) {
        return { ok: false, error: `${table}: read may be truncated at ${data.length} rows` };
      }
      snapshot[table] = data;
    }
    return { ok: true, snapshot };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
