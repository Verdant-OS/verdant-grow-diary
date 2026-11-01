import { useLocation, useNavigate } from "@/lib/react-router-compat";
import {
  SENSOR_CSV_IMPORT_ENTRY_LABEL,
  focusSensorCsvImportAnchor,
  sensorCsvImportEntryHref,
  sensorCsvImportEntryShouldNavigate,
} from "@/lib/sensorHashAnchorRules";

/**
 * Top-of-page Import CSV control. Navigates to #csv-import so the Sensors
 * hash effect scrolls once the anchor is mounted. When that hash is already
 * committed, focuses the anchor directly because the effect will not re-fire.
 */
export function useSensorCsvImportEntry() {
  const location = useLocation();
  const navigate = useNavigate();

  const open = () => {
    if (sensorCsvImportEntryShouldNavigate(location.hash)) {
      navigate(sensorCsvImportEntryHref(location.pathname, location.search));
      return;
    }
    focusSensorCsvImportAnchor(document);
  };

  return { label: SENSOR_CSV_IMPORT_ENTRY_LABEL, open };
}
