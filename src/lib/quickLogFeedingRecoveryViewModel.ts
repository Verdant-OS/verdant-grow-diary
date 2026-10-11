import type { PendingQuickLogFeeding } from "./quickLogPendingFeedingStore";
import { EMPTY_QUICKLOG_V2_FORM, type QuickLogV2FormState } from "./quickLogV2Rules";
import {
  EMPTY_QUICKLOG_FEEDING_FORM,
  type QuickLogFeedingFormState,
} from "./quickLogFeedingFormViewModel";

const numberText = (value: number | null | undefined): string =>
  typeof value === "number" && Number.isFinite(value) ? String(value) : "";

/** Present a validated frozen Feed. Temperature stays canonical Celsius. */
export function buildFeedingRecoveryForm(record: PendingQuickLogFeeding): {
  form: QuickLogV2FormState;
  feedingForm: QuickLogFeedingFormState;
} {
  const p = record.payload;
  const products = p.products as Array<{ name: string; amount?: number; unit?: string }>;
  return {
    form: {
      ...EMPTY_QUICKLOG_V2_FORM,
      selectedKey: `${record.resolved.targetType}:${record.resolved.targetId}`,
      action: "feed",
      note: p.note ?? "",
    },
    feedingForm: {
      ...EMPTY_QUICKLOG_FEEDING_FORM,
      lineId: p.nutrient_line_id ?? "",
      products: products.map((product) => ({
        name: product.name,
        amount: numberText(product.amount),
        unit: product.unit ?? "",
      })),
      volumeMl: numberText(p.volume_ml),
      ph: numberText(p.ph),
      ecIn: numberText(p.ec_in),
      ecOut: numberText(p.ec_out),
      runoffMl: numberText(p.runoff_ml),
      runoffPh: numberText(p.runoff_ph),
      runoffEc: numberText(p.runoff_ec),
      waterTempC: numberText(p.water_temp_c),
      note: p.note ?? "",
    },
  };
}
