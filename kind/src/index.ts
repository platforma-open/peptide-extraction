import { assertParamsObject, defineBlockKind } from "@platforma-sdk/block-kind";
import { isPlRef, type PlRef } from "@platforma-sdk/model";
import { isBoolean, isPlainObject, isString, isUndefined } from "es-toolkit";
import { isArray, isFinite, isNumber } from "es-toolkit/compat";
import { name, version } from "../package.json" with { type: "json" };

/** The three stop codons the block can translate to an amino acid instead of a stop. */
export type StopCodonType = "amber" | "ochre" | "opal";

/** Which amino acid each selected stop codon becomes. One IUPAC letter per entry. */
export type StopCodonReplacements = {
  amber?: string;
  ochre?: string;
  opal?: string;
};

/**
 * This block's init-params contract — the shape a block of this kind receives at
 * creation, and exactly what a project template serializes for it.
 *
 * Everything the scientist authors is here. The block's `BlockData` is wider in
 * four places, and each exclusion is deliberate:
 *
 * - `patternParts` is a parse of `pattern`. The pattern editor re-derives it on
 *   mount and the args lambda parses the pattern itself, so carrying it would
 *   only create a second copy that can disagree with the first.
 * - `defaultBlockLabel` is the label of the chosen input dataset and is rewritten
 *   from `input` whenever the selection changes. Only the scientist's own
 *   `customBlockLabel` is worth restoring.
 * - `inputIsPairedEnd` is a model output the UI mirrors back into the data so the
 *   args lambda can cross-check the pattern against the input. It describes the
 *   input, not a choice.
 * - `qcTableState` and `resultsTableState` are view state.
 *
 * Every field is optional: a block may be created with no template at all, and a
 * template need not pin everything it could.
 */
export type BlockParams = {
  input?: PlRef;
  presetId?: string;
  pattern?: string;
  useWildcards?: boolean;
  unstranded?: boolean;
  minReadsPerConsensus?: number;
  minUmiQuality?: number;
  errorBudget?: number;
  maxIndels?: number;
  autoR1OnlyAssembly?: boolean;
  filterInvalidPeptides?: boolean;
  removeReadSingletons?: boolean;
  stopCodonTypes?: StopCodonType[];
  stopCodonReplacements?: StopCodonReplacements;
  perProcessMemGB?: number;
  perProcessCPUs?: number;
  customBlockLabel?: string;
};

/**
 * The same contract at runtime, for params that arrive from a template file rather
 * than from typed code.
 *
 * Each field is checked on its own, and only for the shape the field has. Rules
 * that span two fields are not checked here — that a selected stop codon has an
 * amino acid chosen, that a Read 2 half needs a paired-end input, that a pattern
 * captures the insert. Every one of those is a state the editor leaves behind
 * mid-edit, and the args lambda already refuses them when the block tries to run.
 * Refusing them here would mean a block the scientist can reach by hand cannot be
 * carried by a template.
 *
 * The numeric bounds mirror the args lambda exactly, including its silence on
 * whether a count is a whole number: a template that could only ever produce
 * un-runnable args is rejected against the entry that carried it, and nothing
 * beyond that is added.
 */
function parseInitializationParams(value: unknown): BlockParams {
  assertParamsObject(value);

  const params: Record<string, unknown> = {};
  for (const [field, { is, must }] of Object.entries(CONTRACT)) {
    const raw = value[field];
    if (raw === undefined) continue;
    if (!is(raw)) throw new Error(`'${field}' must be ${must}.`);
    params[field] = raw;
  }
  // Every value placed here passed its own field's guard, and `CONTRACT` is proven
  // exhaustive over `BlockParams` by the `satisfies` below.
  return params as BlockParams;
}

// Identity (`name`/`version`) comes from this package's own `package.json`, so the
// on-wire `{name}@{version}` reference can never drift from what npm publishes; the
// bundler inlines the JSON import.
export const kind = defineBlockKind<BlockParams>({
  name,
  version,
  parseInitializationParams,
});

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

type Guard<T> = (value: unknown) => value is T;

/** A guard plus how to finish the sentence "'field' must be …". */
type Check<T> = { readonly is: Guard<T>; readonly must: string };

function check<T>(is: Guard<T>, must: string): Check<T> {
  return { is, must };
}

/**
 * A finite number within the inclusive bounds the args lambda enforces.
 *
 * `isFinite` is es-toolkit's, which is `Number.isFinite` and so refuses a numeric
 * string, unlike the global of the same name. It returns a plain boolean, so
 * `isNumber` is what narrows the value for the comparisons that follow.
 */
function isNumberWithin(min: number, max: number): Guard<number> {
  return (v): v is number => isNumber(v) && isFinite(v) && v >= min && v <= max;
}

const STOP_CODON_TYPES: readonly string[] = ["amber", "ochre", "opal"];

const isStopCodonType: Guard<StopCodonType> = (v): v is StopCodonType =>
  isString(v) && STOP_CODON_TYPES.includes(v);

const isStopCodonTypes: Guard<StopCodonType[]> = (v): v is StopCodonType[] =>
  isArray(v) && v.every(isStopCodonType);

/**
 * A replacement for some subset of the stop codons. The amino acid is checked as a
 * string and no further: the letter is one of a list the settings panel owns, and a
 * kind cannot see that list without keeping a second copy of it.
 */
const isStopCodonReplacements: Guard<StopCodonReplacements> = (v): v is StopCodonReplacements =>
  isPlainObject(v) &&
  Object.entries(v).every(([k, aa]) => isStopCodonType(k) && (isUndefined(aa) || isString(aa)));

const CONTRACT = {
  input: check(isPlRef, "a reference to an input dataset"),
  presetId: check(isString, "a string"),
  pattern: check(isString, "a string"),
  useWildcards: check(isBoolean, "a boolean"),
  unstranded: check(isBoolean, "a boolean"),
  minReadsPerConsensus: check(isNumberWithin(1, Infinity), "a number of 1 or more"),
  minUmiQuality: check(isNumberWithin(0, 50), "a number between 0 and 50"),
  errorBudget: check(isNumberWithin(0, Infinity), "a number of 0 or more"),
  maxIndels: check(isNumberWithin(0, Infinity), "a number of 0 or more"),
  autoR1OnlyAssembly: check(isBoolean, "a boolean"),
  filterInvalidPeptides: check(isBoolean, "a boolean"),
  removeReadSingletons: check(isBoolean, "a boolean"),
  stopCodonTypes: check(isStopCodonTypes, 'an array of "amber", "ochre" and "opal"'),
  stopCodonReplacements: check(
    isStopCodonReplacements,
    "an object mapping stop codon names to amino acid letters",
  ),
  perProcessMemGB: check(isNumberWithin(1, Infinity), "a number of gigabytes, 1 or more"),
  perProcessCPUs: check(isNumberWithin(1, Infinity), "a number of CPUs, 1 or more"),
  customBlockLabel: check(isString, "a string"),
} satisfies { [K in keyof Required<BlockParams>]: Check<NonNullable<BlockParams[K]>> };
