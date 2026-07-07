/**
 * PhenoProductSamplingSection — PHENOHUNT product sampling
 *
 * Structured tester feedback form for comparable phenotype sampling.
 * Local state only: no persistence, no AI, no Action Queue, no automation,
 * no device control, no sensor ingest, no schema writes. The form gives
 * breeders a coherent 1–10 rating and observation fields so tester feedback
 * stays comparable across candidates.
 */
import { useState } from "react";
import { usePhenoSamplingOptional } from "@/context/PhenoSamplingContext";
import {
  PHENO_SAMPLING_HEADING,
  PHENO_SAMPLING_INTRO_PARAGRAPHS,
  PHENO_SAMPLING_COMPARISON_POINTS,
  PHENO_SAMPLING_RATING_MIN,
  PHENO_SAMPLING_RATING_MAX,
  PHENO_SAMPLING_RATING_HINT,
  PHENO_SAMPLING_SAMPLE_FORMATS,
  PHENO_SAMPLING_BURN_QUALITY_OPTIONS,
  PHENO_SAMPLING_ASH_COLOR_OPTIONS,
  PHENO_SAMPLING_OIL_RING_OPTIONS,
  PHENO_SAMPLING_OBSERVATION_DISCLAIMER,
} from "@/constants/phenoProductSamplingCopy";

interface FieldProps {
  id: string;
  label: string;
  children: React.ReactNode;
  hint?: string;
}

function Field({ id, label, children, hint }: FieldProps) {
  return (
    <label htmlFor={id} className="block text-sm">
      <span className="mb-1 block font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

const inputClass =
  "w-full rounded border border-border bg-background px-2 py-1 text-sm";

export default function PhenoProductSamplingSection() {
  const [testerCode, setTesterCode] = useState("");
  const [candidateId, setCandidateId] = useState("");
  const [sampleFormat, setSampleFormat] = useState(PHENO_SAMPLING_SAMPLE_FORMATS[0]);
  const [dryHit, setDryHit] = useState("");
  const [flavor, setFlavor] = useState("");
  const [burnQuality, setBurnQuality] = useState(PHENO_SAMPLING_BURN_QUALITY_OPTIONS[0]);
  const [ashColor, setAshColor] = useState(PHENO_SAMPLING_ASH_COLOR_OPTIONS[0]);
  const [oilRing, setOilRing] = useState(PHENO_SAMPLING_OIL_RING_OPTIONS[0]);
  const [effect, setEffect] = useState("");
  const [overall, setOverall] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [recorded, setRecorded] = useState(false);

  return (
    <section
      data-testid="pheno-product-sampling"
      aria-labelledby="pheno-product-sampling-heading"
      className="space-y-4 rounded-lg border border-border bg-card p-4"
    >
      <header className="space-y-2">
        <h2
          id="pheno-product-sampling-heading"
          className="text-lg font-semibold"
        >
          {PHENO_SAMPLING_HEADING}
        </h2>
        {PHENO_SAMPLING_INTRO_PARAGRAPHS.map((p, i) => (
          <p key={i} className="text-sm text-muted-foreground">
            {p}
          </p>
        ))}
      </header>

      <div>
        <h3 className="text-sm font-semibold">Sampling comparison points</h3>
        <ul
          data-testid="pheno-sampling-comparison-points"
          className="mt-2 space-y-2 text-sm"
        >
          {PHENO_SAMPLING_COMPARISON_POINTS.map((point) => (
            <li
              key={point.key}
              data-testid={`pheno-sampling-point-${point.key}`}
              className="rounded border border-border/60 bg-background/60 p-2"
            >
              <span className="font-medium">{point.label}: </span>
              <span className="text-muted-foreground">{point.description}</span>
            </li>
          ))}
        </ul>
        <p
          data-testid="pheno-sampling-disclaimer"
          className="mt-2 text-xs text-muted-foreground"
        >
          {PHENO_SAMPLING_OBSERVATION_DISCLAIMER}
        </p>
      </div>

      <form
        data-testid="pheno-sampling-form"
        className="grid gap-3 md:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          setRecorded(true);
        }}
      >
        <Field id="pheno-sampling-tester" label="Tester name or code">
          <input
            id="pheno-sampling-tester"
            data-testid="pheno-sampling-tester"
            value={testerCode}
            onChange={(e) => {
              setRecorded(false);
              setTesterCode(e.target.value);
            }}
            className={inputClass}
            placeholder="e.g. T-04"
          />
        </Field>

        <Field id="pheno-sampling-candidate" label="Sample / candidate ID">
          <input
            id="pheno-sampling-candidate"
            data-testid="pheno-sampling-candidate"
            value={candidateId}
            onChange={(e) => {
              setRecorded(false);
              setCandidateId(e.target.value);
            }}
            className={inputClass}
            placeholder="e.g. PH-12-A"
          />
        </Field>

        <Field id="pheno-sampling-format" label="Sample format">
          <select
            id="pheno-sampling-format"
            data-testid="pheno-sampling-format"
            value={sampleFormat}
            onChange={(e) => {
              setRecorded(false);
              setSampleFormat(e.target.value);
            }}
            className={inputClass}
          >
            {PHENO_SAMPLING_SAMPLE_FORMATS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </Field>

        <Field id="pheno-sampling-burn" label="Burn quality">
          <select
            id="pheno-sampling-burn"
            data-testid="pheno-sampling-burn"
            value={burnQuality}
            onChange={(e) => {
              setRecorded(false);
              setBurnQuality(e.target.value);
            }}
            className={inputClass}
          >
            {PHENO_SAMPLING_BURN_QUALITY_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </Field>

        <Field
          id="pheno-sampling-dry-hit"
          label="Dry hit aroma notes"
          hint="Aroma / flavor impressions before lighting."
        >
          <textarea
            id="pheno-sampling-dry-hit"
            data-testid="pheno-sampling-dry-hit"
            rows={2}
            value={dryHit}
            onChange={(e) => {
              setRecorded(false);
              setDryHit(e.target.value);
            }}
            className={inputClass}
          />
        </Field>

        <Field id="pheno-sampling-flavor" label="Flavor notes">
          <textarea
            id="pheno-sampling-flavor"
            data-testid="pheno-sampling-flavor"
            rows={2}
            value={flavor}
            onChange={(e) => {
              setRecorded(false);
              setFlavor(e.target.value);
            }}
            className={inputClass}
          />
        </Field>

        <Field
          id="pheno-sampling-ash"
          label="Ash color"
          hint="Observation only — ash color alone is not proof of quality."
        >
          <select
            id="pheno-sampling-ash"
            data-testid="pheno-sampling-ash"
            value={ashColor}
            onChange={(e) => {
              setRecorded(false);
              setAshColor(e.target.value);
            }}
            className={inputClass}
          >
            {PHENO_SAMPLING_ASH_COLOR_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </Field>

        <Field
          id="pheno-sampling-oil-ring"
          label="Oil ring observation"
          hint="Observation only — oil ring alone is not proof of superiority."
        >
          <select
            id="pheno-sampling-oil-ring"
            data-testid="pheno-sampling-oil-ring"
            value={oilRing}
            onChange={(e) => {
              setRecorded(false);
              setOilRing(e.target.value);
            }}
            className={inputClass}
          >
            {PHENO_SAMPLING_OIL_RING_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </Field>

        <Field id="pheno-sampling-effect" label="Effect notes">
          <textarea
            id="pheno-sampling-effect"
            data-testid="pheno-sampling-effect"
            rows={2}
            value={effect}
            onChange={(e) => {
              setRecorded(false);
              setEffect(e.target.value);
            }}
            className={inputClass}
          />
        </Field>

        <Field
          id="pheno-sampling-overall"
          label={`Overall rating (${PHENO_SAMPLING_RATING_MIN}–${PHENO_SAMPLING_RATING_MAX})`}
          hint={PHENO_SAMPLING_RATING_HINT}
        >
          <input
            id="pheno-sampling-overall"
            data-testid="pheno-sampling-overall"
            type="number"
            min={PHENO_SAMPLING_RATING_MIN}
            max={PHENO_SAMPLING_RATING_MAX}
            step={1}
            value={overall}
            onChange={(e) => {
              setRecorded(false);
              setOverall(e.target.value);
            }}
            className={inputClass}
          />
        </Field>

        <div className="md:col-span-2">
          <Field id="pheno-sampling-notes" label="Freeform notes">
            <textarea
              id="pheno-sampling-notes"
              data-testid="pheno-sampling-notes"
              rows={3}
              value={notes}
              onChange={(e) => {
                setRecorded(false);
                setNotes(e.target.value);
              }}
              className={inputClass}
            />
          </Field>
        </div>

        <div className="md:col-span-2 flex items-center gap-3">
          <button
            type="submit"
            data-testid="pheno-sampling-record"
            className="rounded border border-border bg-secondary px-3 py-1.5 text-sm font-medium"
          >
            Record tester feedback
          </button>
          {recorded && (
            <span
              data-testid="pheno-sampling-recorded"
              className="text-xs text-emerald-600"
            >
              Recorded locally — feedback stays with this session.
            </span>
          )}
        </div>
      </form>
    </section>
  );
}
