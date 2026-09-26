/**
 * AlertReasonText — presenter for a persisted alert reason, shown with a
 * local timestamp and the grower's temperature unit. Formatting logic lives
 * in `alertReasonDisplayRules`; the stored reason is never modified.
 */
import { useTemperatureUnitPreference } from "@/hooks/useTemperatureUnitPreference";
import { formatAlertReasonForDisplay } from "@/lib/alertReasonDisplayRules";

interface Props {
  reason: string | null | undefined;
  className?: string;
  testId?: string;
}

export default function AlertReasonText({ reason, className, testId }: Props) {
  const temperatureUnit = useTemperatureUnitPreference();
  return (
    <p className={className} data-testid={testId}>
      {formatAlertReasonForDisplay(reason, { temperatureUnit })}
    </p>
  );
}
