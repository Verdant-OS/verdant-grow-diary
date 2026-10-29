/**
 * growRenameService — rename one of the signed-in grower's grows (I/O layer).
 *
 * Suggested setup names ("My grow", "Starter Grow") are editable; this is the
 * write behind that offer. It goes through the existing owner-scoped grows
 * update (RLS: "Users update own grows"), confirms the server's read-back
 * carries the new name, and never claims a save it cannot confirm.
 */
import { updateGrowRow } from "@/lib/db";
import { isValidGrowName, SIMPLE_HOME_SETUP_COPY } from "@/lib/simpleHomeSetupRules";

export type GrowRenameResult = { ok: true; name: string } | { ok: false; message: string };

export async function renameGrow(growId: string, rawName: unknown): Promise<GrowRenameResult> {
  const name = typeof rawName === "string" ? rawName.trim() : "";
  if (!growId || !isValidGrowName(name)) {
    return { ok: false, message: SIMPLE_HOME_SETUP_COPY.renameInvalid };
  }
  try {
    const row = await updateGrowRow(growId, { name });
    if (row?.name !== name) {
      return { ok: false, message: SIMPLE_HOME_SETUP_COPY.renameUnconfirmed };
    }
    return { ok: true, name };
  } catch {
    return { ok: false, message: SIMPLE_HOME_SETUP_COPY.renameFailed };
  }
}
