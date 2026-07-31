/**
 * aiOutputTextSafetyDetectors — the single home for prose-safety patterns
 * used to inspect AI output.
 *
 * These families previously lived privately inside `aiDoctorOutputEvaluation`
 * and `aiDoctorDiagnosisRules`. They are extracted here so the AI Doctor
 * evaluator and the Verdant Skill Policy Governor scan with ONE set of
 * detectors: two authorities with two copies of "what counts as a device
 * instruction" is two things that can disagree about the same sentence.
 *
 * SCOPE. Prose detection only. Nothing here decides what to DO about a match
 * — that is the calling authority's job, and the two callers deliberately
 * decide differently (see the reliability-tier note in
 * `aiDoctorOutputEvaluation` versus the block/floor split in
 * `verdantSkillPolicyGovernor`).
 *
 * REGEX HYGIENE. Every exported pattern is free of the `g` and `y` flags, and
 * `normalizeDetectionPattern` strips them defensively at every use site.
 * `RegExp.exec` advances `lastIndex` on a global regex, so a shared global
 * pattern would alternate between matching and not matching on identical
 * input — silently dropping every second detection. A test asserts no
 * exported pattern carries either flag.
 */

// ---------------------------------------------------------------------------
// Scanning helpers
// ---------------------------------------------------------------------------

/** Strip stateful flags so a shared pattern cannot carry `lastIndex`. */
export function normalizeDetectionPattern(re: RegExp): RegExp {
  return re.global || re.sticky ? new RegExp(re.source, re.flags.replace(/[gy]/g, "")) : re;
}

/**
 * Case-insensitive scan. Owns the lowercasing so a caller cannot forget it:
 * several of these families were written for already-lowercased input and
 * would silently never fire on raw text.
 */
export function scanProseForPatterns(text: string, patterns: readonly RegExp[]): boolean {
  if (typeof text !== "string" || text === "") return false;
  const haystack = text.toLowerCase();
  return patterns.some((re) => normalizeDetectionPattern(re).test(haystack));
}

/** Clause boundaries. Sentence enders and dashes end a clause too. */
export const CLAUSE_SPLIT_RE = /[.;,:!?\n–—]+/;

export const PROHIBITION_MARKER_RE =
  /\b(do not|do n't|don'?t|never|avoid|should not|shouldn'?t|must not|mustn'?t|will not|won'?t|cannot|can'?t|does not|doesn'?t|is not|isn'?t|are not|aren'?t|refrain from|no need to)\b/i;

/**
 * Verbs that invert a prohibition's polarity. "Do not turn on the fan"
 * forbids an action; "Do not FAIL TO turn on the fan" commands it.
 */
const POLARITY_INVERTING_RE = /\b(fail to|forget to|hesitate to|neglect to|delay|wait)\b/i;

/**
 * Words that END a prohibition's scope inside a clause. "Do not turn on the
 * fan BUT turn on the pump" pivots from a prohibition to a fresh command
 * without a clause boundary; the marker must not exempt what follows the
 * pivot. Bare "and" is deliberately absent — "do not turn on the fan and the
 * extractor" is one prohibition governing two objects.
 */
const PROHIBITION_SCOPE_BREAK_RE = /\b(but|however|instead|rather|then|yet)\b/i;

/**
 * True when `text` contains a command matching `patterns` that is NOT governed
 * by an explicit prohibition.
 *
 * A prohibition only exempts a command it actually GOVERNS: the marker must
 * OPEN the clause, must not be inverted, and its scope must reach the match
 * without a contrastive pivot in between. EVERY occurrence in a clause is
 * examined — an exempt first match must not shadow an ungoverned second one.
 *   "Do not turn on the humidifier; keep observing."   → exempt (governed)
 *   "Do not wait; turn on the humidifier."             → finding (next clause)
 *   "It is not safe. Activate the pump."               → finding (not a marker)
 *   "Do not fail to turn on the humidifier."           → finding (inverted)
 *   "Do not turn on the fan but turn on the pump."     → finding (pivot)
 * This is why we do not simply drop every clause containing "no"/"not".
 */
export function hasUngovernedCommand(text: string, patterns: readonly RegExp[]): boolean {
  if (typeof text !== "string" || text === "") return false;
  for (const rawClause of text.split(CLAUSE_SPLIT_RE)) {
    const clause = rawClause.trim();
    if (clause === "") continue;
    const marker = normalizeDetectionPattern(PROHIBITION_MARKER_RE).exec(clause);
    for (const pattern of patterns) {
      const re = normalizeDetectionPattern(pattern);
      let searchFrom = 0;
      while (searchFrom < clause.length) {
        const match = re.exec(clause.slice(searchFrom));
        if (match === null) break;
        const matchIndex = searchFrom + match.index;
        const before = clause.slice(0, matchIndex);
        // The marker need not open the clause — "You should not turn on the
        // fan" and "Please do not turn on the fan" are ordinary cautious
        // phrasing, and treating them as instructions would withhold exactly
        // the disclaimers the output should keep. What matters is that no
        // COMMAND precedes the marker (otherwise the marker belongs to a
        // later thought), that the marker is not inverted, and that its scope
        // has not been broken by a contrastive pivot.
        const markerGovernsMatch =
          marker !== null &&
          marker.index < matchIndex &&
          !re.test(clause.slice(0, marker.index)) &&
          !normalizeDetectionPattern(POLARITY_INVERTING_RE).test(before) &&
          !normalizeDetectionPattern(PROHIBITION_SCOPE_BREAK_RE).test(
            clause.slice(marker.index, matchIndex),
          );
        if (!markerGovernsMatch) return true;
        searchFrom = matchIndex + Math.max(1, match[0].length);
      }
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Families extracted from aiDoctorDiagnosisRules
// ---------------------------------------------------------------------------

/** Guarantees and promises no cultivation advice can honestly make. */
export const OVER_PROMISE_PATTERNS: readonly RegExp[] = Object.freeze([
  /\bguarantee(d|s)?\b/i,
  /\bdefinitely\b/i,
  /\bwill (fully )?recover\b/i,
  /\bfull recovery\b/i,
  /\bmaximize? (your )?yield\b/i,
  /\bguaranteed yield\b/i,
  /\b(100%|hundred percent) (sure|certain|safe)\b/i,
]);

// ---------------------------------------------------------------------------
// Families extracted from aiDoctorOutputEvaluation
// ---------------------------------------------------------------------------

/** Language asserting an action happens without the grower approving it. */
export const AUTOMATIC_AQ_PATTERNS: readonly RegExp[] = Object.freeze([
  /\bautomatically\b/i,
  /\bauto-?approve/i,
  /\bwithout approval\b/i,
  /\bno approval (needed|required)\b/i,
  /\bbypass(ing)? (the )?(approval|action queue|review)\b/i,
  /\bwill (be )?(execute|appl|run)/i,
  /\bqueue and (run|execute)\b/i,
  /\bexecutes? (the )?action\b/i,
  /\bapplied automatically\b/i,
]);

/**
 * Feed / nutrient / EC strength changes.
 *
 * REAL CULTIVATION VOCABULARY. "Increase the feed" is textbook agronomy when
 * the evidence supports it, so the governor uses this to RAISE a risk floor,
 * never to block on its own. Magnitude-blind by construction.
 */
export const AGGRESSIVE_NUTRIENT_PATTERNS: readonly RegExp[] = Object.freeze([
  /\b(increase|raise|bump|boost)\s+(the\s+)?(feed|nutrient|nutrients|ec)\b/i,
  /\bfeed more\b/i,
  /\b(reduce|lower|decrease|cut|drop)\s+(the\s+)?(feed|nutrient|nutrients|ec)\b/i,
  /\bfeed less\b/i,
  /\bless nutrients?\b/i,
  /\badd (more )?nutrient/i,
  /\bflush (immediately|now|the plant)\b/i,
  /\bdouble (the )?(feed|nutrient|ec)\b/i,
  /\bheavy feed\b/i,
]);

/** Irrigation changes. Same floor-raising treatment as nutrients. */
export const AGGRESSIVE_IRRIGATION_PATTERNS: readonly RegExp[] = Object.freeze([
  /\bwater (a lot |much )?more\b/i,
  /\bincrease (the )?(watering|irrigation)\b/i,
  /\breduce (the )?(watering|irrigation)\b/i,
  /\bwater less\b/i,
  /\birrigate now\b/i,
  /\bml of water\b/i,
  /\bsoak (the )?(medium|pot|plant)\b/i,
]);

/**
 * High-stress interventions, split by RECOVERY BUDGET.
 *
 * Tier A is time-irrecoverable: an autoflower runs on a fixed clock, so a
 * transplant or a topping in flower costs days the plant cannot make back.
 * Tier B is routine low-stress training a healthy plant absorbs.
 */
export const AUTOFLOWER_TIER_A_STRESS_PATTERNS: readonly RegExp[] = Object.freeze([
  /\bheav(y|ily) defoliat/i,
  /\bdefoliate (heavily|hard)\b/i,
  /\btop(ping)? (the|this|your)?\s?plant/i,
  /\bfim\b/i,
  /\bhigh[- ]stress training\b/i,
  /\bsevere (lst|training)\b/i,
  /\btransplant/i,
  /\baggressive flush\b/i,
]);

export const AUTOFLOWER_TIER_B_STRESS_PATTERNS: readonly RegExp[] = Object.freeze([
  /\blow[- ]stress training\b/i,
  /\blst\b/i,
  /\bleaf tuck/i,
  /\blight defoliat/i,
  /\btuck (the )?leaves\b/i,
]);

/**
 * The legacy name, kept pointing at Tier A ONLY.
 *
 * `aiDoctorOutputEvaluation` has always meant "high-stress" by this, and
 * widening it to include routine low-stress training would start flagging
 * ordinary LST advice as an autoflower safety finding. Callers that want the
 * routine tier must ask for it by name.
 */
export const AUTOFLOWER_STRESS_PATTERNS: readonly RegExp[] = AUTOFLOWER_TIER_A_STRESS_PATTERNS;

// ---------------------------------------------------------------------------
// New families — required by the governor's mandated filter categories
// ---------------------------------------------------------------------------

const NUMBER_TOKEN =
  "(?:\\d+(?:\\.\\d+)?|\\d+\\s*\\/\\s*\\d+|half|quarter|third|one|two|three|four|five|six|seven|eight|nine|ten|a couple of|a few)";
const DOSE_UNIT =
  "(?:ml|millilit(?:er|re)s?|lit(?:er|re)s?|gal|gallons?|quarts?|pints?|cups?|grams?|mg|milligrams?|tsp|teaspoons?|tbsp|tablespoons?|oz|ounces?|cc)";

/**
 * Quantities that ADMINISTER something or make an irreversible input change.
 *
 * The line is administer-versus-aim-at, not "is it a number". A target band
 * ("hold VPD near 1.1 kPa", "aim for 20% runoff") is a threshold the grower
 * measures against and can walk back at any time. An amount of a substance,
 * or a light-schedule change, is neither: pH-down overshoot is not reversible
 * by adding more base, and the app never records the alkalinity that would
 * make the volume calculable in the first place.
 *
 * `TARGET_BAND_PATTERNS` below documents the permitted side; a test asserts
 * those phrasings do not trip these.
 */
export const DOSE_QUANTITY_PATTERNS: readonly RegExp[] = Object.freeze([
  // "5 ml", "half a teaspoon", "2.5 g"
  new RegExp(`\\b${NUMBER_TOKEN}\\s*(?:of\\s+)?(?:a\\s+)?${DOSE_UNIT}\\b`, "i"),
  // per-volume ratios: "2 ml/L", "5 g per gallon"
  new RegExp(
    `\\b${NUMBER_TOKEN}\\s*${DOSE_UNIT}\\s*(?:\\/|per)\\s*(?:l\\b|lit(?:er|re)|gal|gallon)`,
    "i",
  ),
  // pH adjustment volumes
  /\bph\s*(up|down)\b[^.]{0,40}\d/i,
  /\badd\b[^.]{0,30}\bph\s*(up|down)\b/i,
  // EC/PPM/TDS step change to APPLY (not a target range)
  /\b(raise|increase|lower|reduce|cut|drop|bump|boost)\b[^.]{0,30}\b(ec|ppm|tds)\b[^.]{0,20}\d/i,
  /\b(ec|ppm|tds)\s*(by|to)\s*\d/i,
  // Foliar / crop-protection / PGR concentrations — the highest-harm class
  /\b(foliar|spray|pesticide|fungicide|insecticide|miticide|pgr)\b[^.]{0,40}\d/i,
  // Light intensity and photoperiod setpoints
  /\b(ppfd|dli)\b[^.]{0,20}\b(to|at|of)\s*\d/i,
  /\b\d{1,2}\s*\/\s*\d{1,2}\b[^.]{0,20}\b(light|schedule|photoperiod)\b/i,
  /\b(switch|change|move|flip)\b[^.]{0,25}\b\d{1,2}\s*\/\s*\d{1,2}\b/i,
]);

/**
 * Quantities that are safe and useful to state. Documentation plus a test
 * fixture: these must NOT match `DOSE_QUANTITY_PATTERNS`.
 */
export const TARGET_BAND_PATTERNS: readonly RegExp[] = Object.freeze([
  /\bvpd\b[^.]{0,20}\bkpa\b/i,
  /\b\d+(\.\d+)?\s*kpa\b/i,
  /\b\d+(\.\d+)?\s*%\s*(rh|humidity|runoff|dryback)\b/i,
  /\b(runoff|dryback)\b[^.]{0,20}\d+(\.\d+)?\s*%/i,
  /\b\d+(\.\d+)?\s*(°c|c\b|celsius)/i,
  /\b\d+\s*ppm\s*co2\b/i,
  /\bph\s*(range|target|between)\b/i,
]);

/**
 * Therapeutic claims. Deliberately requires a CONDITION term near the verb:
 * "curing" is a cultivation stage in this product, and a bare match on it
 * would flag ordinary post-harvest advice.
 */
export const MEDICAL_CLAIM_PATTERNS: readonly RegExp[] = Object.freeze([
  /\b(cures?|heals?|treats?|remed(y|ies))\b[^.]{0,40}\b(cancer|anxiety|pain|insomnia|epilepsy|seizures?|depression|ptsd|nausea|inflammation|arthritis|migraine)\b/i,
  /\b(medicinal|therapeutic|medical)\s+(benefit|value|grade|effect|use)\b/i,
  /\bwill (cure|heal|treat)\b/i,
  /\bclinically (proven|tested)\b/i,
  /\b(fda|health canada)[- ]approved\b/i,
]);

/** Quantified or guaranteed harvest promises. */
export const YIELD_CLAIM_PATTERNS: readonly RegExp[] = Object.freeze([
  /\b(increase|boost|double|triple|maximi[sz]e)\b[^.]{0,30}\byield/i,
  /\byield\b[^.]{0,25}\bby\s*\d+\s*%/i,
  /\b\d+\s*%\s*(more|higher|bigger|greater)\s+(yield|harvest|weight)\b/i,
  /\bguaranteed\s+(yield|harvest)\b/i,
  /\b(grams?|g)\s*per\s*(watt|plant|m2|square met(er|re))\b[^.]{0,20}\d/i,
]);

/**
 * Machine-to-machine payload SHAPES.
 *
 * Shape rather than vocabulary, because the device-control family is
 * deliberately bound to device nouns and cannot see a bare endpoint plus a
 * JSON body. The URL pattern is scheme-AGNOSTIC on purpose: matching any
 * `scheme://` covers transports nobody has thought of yet, and keeps this
 * module free of the specific protocol literals the repository's
 * infrastructure scanners ban on sight.
 */
export const PAYLOAD_SHAPE_PATTERNS: readonly RegExp[] = Object.freeze([
  /\b[a-z][a-z0-9+.-]*:\/\//i,
  /\b\d{1,3}(?:\.\d{1,3}){3}:\d{2,5}\b/,
  /\b[a-z0-9-]+\.(?:local|lan)\b/i,
  /\{[^{}]*"[^"]+"\s*:\s*[^{}]{0,120}\}/,
  /\b(get|post|put|patch|delete)\s+\/[a-z0-9/_-]+/i,
]);

// ---------------------------------------------------------------------------
// Intervention classification
// ---------------------------------------------------------------------------

/**
 * What KIND of intervention a proposal describes. Closed set: an
 * unrecognized proposal is `unknown`, which the governor treats as
 * unclassifiable rather than harmless.
 */
export const SKILL_INTERVENTION_CLASSES = [
  "irrigation",
  "nutrient",
  "flush",
  "training",
  "defoliation",
  "transplant",
  "foliar_application",
  "environment",
  "observation",
  "unknown",
] as const;
export type SkillInterventionClass = (typeof SKILL_INTERVENTION_CLASSES)[number];

/**
 * Ordered most-specific-first: a flush is also irrigation-shaped, and a
 * defoliation is also training-shaped, so the narrower class must win.
 */
export const INTERVENTION_CLASS_PATTERNS: readonly {
  readonly klass: SkillInterventionClass;
  readonly patterns: readonly RegExp[];
}[] = Object.freeze([
  { klass: "transplant", patterns: Object.freeze([/\btransplant/i, /\bup-?pot/i, /\brepot/i]) },
  {
    klass: "foliar_application",
    patterns: Object.freeze([
      /\bfoliar\b/i,
      /\bspray(ing)?\b/i,
      /\b(pesticide|fungicide|insecticide|miticide)\b/i,
    ]),
  },
  {
    klass: "flush",
    patterns: Object.freeze([/\bflush(ing)?\b/i, /\bplain water\b/i, /\bleach(ing)?\b/i]),
  },
  {
    klass: "defoliation",
    patterns: Object.freeze([/\bdefoliat/i, /\bstrip (the )?leaves\b/i, /\bremove (fan )?leaves/i]),
  },
  {
    klass: "training",
    patterns: Object.freeze([
      /\btop(ping)? (the|this|your)?\s?plant/i,
      /\bfim\b/i,
      /\b(low|high)[- ]stress training\b/i,
      /\blst\b/i,
      /\bscrog\b/i,
      /\bbend(ing)? (the )?(stem|branch)/i,
      /\bleaf tuck/i,
    ]),
  },
  {
    klass: "nutrient",
    patterns: Object.freeze([
      /\b(feed|feeding|nutrient|nutrients)\b/i,
      /\bec\b/i,
      /\bppm\b/i,
      /\bcal-?mag\b/i,
      /\bph\s*(up|down)\b/i,
    ]),
  },
  {
    klass: "irrigation",
    patterns: Object.freeze([
      /\b(water|watering|irrigat)/i,
      /\bdryback\b/i,
      /\brunoff\b/i,
      /\bsaturat/i,
    ]),
  },
  {
    klass: "environment",
    patterns: Object.freeze([
      /\bvpd\b/i,
      /\bhumidity\b/i,
      /\btemperature\b/i,
      /\bairflow\b/i,
      /\bco2\b/i,
      /\blight(ing)?\b/i,
    ]),
  },
  {
    klass: "observation",
    patterns: Object.freeze([
      /\b(observe|monitor|check|inspect|record|log|measure|photograph)\b/i,
      /\btake a (reading|photo|sample)\b/i,
    ]),
  },
]);

/**
 * Verbs that make a sentence an OBSERVATION regardless of what it observes.
 *
 * "Take a runoff reading at the next irrigation" is not an irrigation
 * intervention — it changes nothing about the plant. Without this, the topical
 * word wins, every reading request inherits an intervention's risk floor, and
 * routine advice gets refused for describing what it is about.
 */
const OBSERVATION_LEAD_RE =
  /^\s*(take|record|check|monitor|observe|measure|inspect|log|photograph|note|review|confirm|count|weigh)\b/i;

/**
 * What kind of intervention a proposal describes.
 *
 * The leading verb decides first, then the most-specific topical family wins.
 * Nothing matching is `unknown`, which the governor treats as unclassifiable
 * (and therefore high-risk), never as harmless.
 */
export function deriveInterventionClass(text: string): SkillInterventionClass {
  if (typeof text === "string" && normalizeDetectionPattern(OBSERVATION_LEAD_RE).test(text)) {
    return "observation";
  }
  for (const entry of INTERVENTION_CLASS_PATTERNS) {
    if (scanProseForPatterns(text, entry.patterns)) return entry.klass;
  }
  return "unknown";
}
