/**
 * LightStressTroubleshooter — read-only, in-diary evidence comparison.
 *
 * Local component state is not persisted or sent anywhere. The pure rules in
 * lightStressTroubleshootingRules own ranking, confidence, and next-log copy.
 */

import { useMemo, useState } from "react";
import { ClipboardList, Lightbulb } from "lucide-react";
import {
  evaluateLightStressEvidence,
  type LightStressLocationPattern,
  type LightStressSupportLevel,
  type LightStressVisiblePattern,
} from "@/lib/lightStressTroubleshootingRules";
import { cn } from "@/lib/utils";

export interface LightStressTroubleshooterProps {
  readonly className?: string;
}

const SUPPORT_LABELS: Readonly<Record<LightStressSupportLevel, string>> = {
  more_supported: "More supported by what you selected",
  possible: "Still possible",
  not_enough_evidence: "Not enough evidence yet",
};

export default function LightStressTroubleshooter({ className }: LightStressTroubleshooterProps) {
  const [visiblePattern, setVisiblePattern] = useState<LightStressVisiblePattern>("unknown");
  const [locationPattern, setLocationPattern] = useState<LightStressLocationPattern>("unknown");
  const [recentLightChange, setRecentLightChange] = useState(false);
  const [highCanopyTemperature, setHighCanopyTemperature] = useState(false);
  const [ppfdOrDliAboveUsual, setPpfdOrDliAboveUsual] = useState(false);
  const [recentFeedOrEcChange, setRecentFeedOrEcChange] = useState(false);

  const result = useMemo(
    () =>
      evaluateLightStressEvidence({
        visiblePattern,
        locationPattern,
        recentLightChange,
        highCanopyTemperature,
        ppfdOrDliAboveUsual,
        recentFeedOrEcChange,
      }),
    [
      visiblePattern,
      locationPattern,
      recentLightChange,
      highCanopyTemperature,
      ppfdOrDliAboveUsual,
      recentFeedOrEcChange,
    ],
  );

  return (
    <details
      data-testid="light-stress-troubleshooter"
      className={cn(
        "mt-3 basis-full rounded-lg border border-amber-500/25 bg-amber-500/5 text-sm",
        className,
      )}
    >
      <summary
        data-testid="light-stress-troubleshooter-trigger"
        className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 py-2 font-medium text-foreground marker:hidden"
      >
        <Lightbulb className="h-4 w-4 text-amber-300" aria-hidden="true" />
        Compare light burn, bleaching, and heat stress
      </summary>

      <div className="space-y-5 border-t border-amber-500/20 px-3 py-4">
        <p className="text-xs leading-5 text-muted-foreground">
          Select only what you actually observed. This comparison stays in your browser, does not
          save or call AI, and cannot control equipment.
        </p>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1 text-xs font-medium">
            <span>1. What pattern do you see?</span>
            <select
              value={visiblePattern}
              onChange={(event) =>
                setVisiblePattern(event.target.value as LightStressVisiblePattern)
              }
              data-testid="light-stress-visible-pattern"
              className="min-h-11 w-full rounded-md border border-border bg-background px-2 text-sm"
            >
              <option value="unknown">Not sure yet</option>
              <option value="bleached_top">Pale or white tissue near the top</option>
              <option value="curled_crispy_top">Curled or crispy top leaves</option>
              <option value="whole_canopy_curl_droop">Curl or droop across the canopy</option>
              <option value="tip_first_across_levels">Brown tips across canopy levels</option>
            </select>
          </label>

          <label className="space-y-1 text-xs font-medium">
            <span>2. Where is it strongest?</span>
            <select
              value={locationPattern}
              onChange={(event) =>
                setLocationPattern(event.target.value as LightStressLocationPattern)
              }
              data-testid="light-stress-location-pattern"
              className="min-h-11 w-full rounded-md border border-border bg-background px-2 text-sm"
            >
              <option value="unknown">Not sure yet</option>
              <option value="top_under_fixture">Top or directly under the fixture</option>
              <option value="whole_canopy">Across the whole canopy</option>
              <option value="tips_across_levels">Leaf tips across multiple levels</option>
            </select>
          </label>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-xs font-medium">3. Which evidence is confirmed?</legend>
          {[
            {
              id: "recent-light-change",
              label: "Light height, dimmer, or schedule changed recently",
              checked: recentLightChange,
              set: setRecentLightChange,
            },
            {
              id: "high-canopy-temperature",
              label: "A canopy or leaf-temperature reading was high",
              checked: highCanopyTemperature,
              set: setHighCanopyTemperature,
            },
            {
              id: "high-ppfd-dli",
              label: "Measured PPFD or calculated DLI was above the recent baseline",
              checked: ppfdOrDliAboveUsual,
              set: setPpfdOrDliAboveUsual,
            },
            {
              id: "recent-feed-ec-change",
              label: "Feed strength or EC changed recently",
              checked: recentFeedOrEcChange,
              set: setRecentFeedOrEcChange,
            },
          ].map((option) => (
            <label
              key={option.id}
              className="flex min-h-10 items-start gap-2 rounded-md border border-border/50 px-2 py-2 text-xs"
            >
              <input
                type="checkbox"
                checked={option.checked}
                onChange={(event) => option.set(event.target.checked)}
                data-testid={`light-stress-evidence-${option.id}`}
                className="mt-0.5 h-4 w-4"
              />
              <span>{option.label}</span>
            </label>
          ))}
        </fieldset>

        <section
          aria-live="polite"
          data-testid="light-stress-comparison-result"
          className="rounded-md border border-border/60 bg-background/70 p-3"
        >
          <p className="font-medium">{result.headline}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Confidence ceiling: {result.confidence}
          </p>
          <ul className="mt-3 space-y-2">
            {result.comparisons.map((comparison) => (
              <li key={comparison.id} data-hypothesis={comparison.id}>
                <p className="text-xs font-medium">
                  {comparison.label} · {SUPPORT_LABELS[comparison.support]}
                </p>
                {comparison.reasons.length > 0 ? (
                  <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
                    {comparison.reasons.join(" ")}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>

        <section data-testid="light-stress-next-data">
          <h4 className="flex items-center gap-2 text-xs font-semibold">
            <ClipboardList className="h-4 w-4 text-primary" aria-hidden="true" />
            Log next
          </h4>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs leading-5 text-muted-foreground">
            {result.nextDataToLog.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
        </section>

        <p
          data-testid="light-stress-caution"
          className="rounded-md border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs leading-5"
        >
          {result.caution}
        </p>
      </div>
    </details>
  );
}
