import type {
  PatternHalf,
  PatternParts,
  LengthRange,
} from "@platforma-open/milaboratories.peptide-extraction.model";
export { parsePattern } from "@platforma-open/milaboratories.peptide-extraction.model";

// ─── Assemble ─────────────────────────────────────────────────────────────────

function assembleHalf(h: PatternHalf, defaultIndex: 1 | 2): string {
  const insertLabel = h.insertName ?? (defaultIndex === 2 ? "R2" : "R1");

  const prefix = h.hasLeadingWildcard ? "*" : "";

  // UMI is optional: pattern may be no-UMI (e.g. NEB Ph.D. kits)
  let umiPart = "";
  if (h.umi) {
    const umiLabel = h.umiName ?? (defaultIndex === 2 ? "UMI2" : "UMI");
    const umiRange = h.umi.min === h.umi.max ? `${h.umi.min}` : `${h.umi.min}:${h.umi.max}`;
    umiPart = `(${umiLabel}:N{${umiRange}})`;
  }

  // Insert length is optional: undefined = variable (`*`), number = fixed,
  // LengthRange = ranged. Default is variable (matches current editor behaviour).
  let insertPart: string;
  if (h.insertLength === undefined) {
    insertPart = "*";
  } else if (typeof h.insertLength === "number") {
    insertPart = `N{${h.insertLength}}`;
  } else {
    insertPart =
      h.insertLength.min === h.insertLength.max
        ? `N{${h.insertLength.min}}`
        : `N{${h.insertLength.min}:${h.insertLength.max}}`;
  }

  const anchorLen = h.rightAnchor.length;
  const mandatory =
    defaultIndex === 2 ? R2_MANDATORY_RIGHT_ANCHOR_BP : R1_MANDATORY_RIGHT_ANCHOR_BP;
  const trimValue =
    h.rightTrim !== undefined && h.rightTrim < anchorLen
      ? h.rightTrim
      : defaultTrim(anchorLen, mandatory);
  const trim = trimValue !== undefined ? `>{${trimValue}}` : "";

  return `^${prefix}${umiPart}${h.leftAnchor}(${insertLabel}:${insertPart})${h.rightAnchor}${trim}*`;
}

/** Assemble PatternParts back into a pattern string. Case is normalized to lowercase. */
export function assemblePattern(parts: PatternParts): string {
  const r1 = assembleHalf(parts.r1, 1);
  if (!parts.r2) return r1;
  return `${r1}\\${assembleHalf(parts.r2, 2)}`;
}

// ─── Reverse complement ───────────────────────────────────────────────────────

const COMPLEMENT: Record<string, string> = {
  A: "T",
  T: "A",
  C: "G",
  G: "C",
  a: "t",
  t: "a",
  c: "g",
  g: "c",
  M: "K",
  K: "M",
  R: "Y",
  Y: "R",
  W: "W",
  S: "S",
  B: "V",
  V: "B",
  D: "H",
  H: "D",
  N: "N",
  m: "k",
  k: "m",
  r: "y",
  y: "r",
  w: "w",
  s: "s",
  b: "v",
  v: "b",
  d: "h",
  h: "d",
  n: "n",
};

/** Reverse-complement a DNA/IUPAC string, preserving case. */
export function reverseComplement(seq: string): string {
  return seq
    .split("")
    .reverse()
    .map((c) => COMPLEMENT[c] ?? c)
    .join("");
}

// ─── Generate R2 from R1 ──────────────────────────────────────────────────────

/** Minimum bp of the R1 right-anchor that must be observable in the read.
 *  8 bp discriminative enough (false-hit rate ~0.1% on random DNA) and short
 * enough that R1's 3' end quality drop doesn't routinely cause anchor-miss. */
export const R1_MANDATORY_RIGHT_ANCHOR_BP = 8;

/** Minimum bp of the R2 right-anchor that must be observable in the read.
 *  Held at 1 bp for cases where the R2 right-anchor barely fits within read
 * length; R1's anchoring is strong enough on its own; R2 exists primarily for
 * consensus. */
export const R2_MANDATORY_RIGHT_ANCHOR_BP = 1;

/** Default trim: allow the right anchor to be trimmed down to `mandatory` bp.
 *  Returns undefined when the anchor is already shorter than `mandatory`, in
 *  which case the assembled pattern omits the `>{N}` suffix (no trimming). */
export function defaultTrim(anchorLength: number, mandatory: number): number | undefined {
  return anchorLength > mandatory ? anchorLength - mandatory : undefined;
}

/**
 * Auto-generate an R2 half from R1:
 * - UMI range copied as-is
 * - leftAnchor  = reverse-complement of R1 rightAnchor
 * - rightAnchor = reverse-complement of R1 leftAnchor
 * - rightTrim   = trim-to-1-bp-mandatory (see R2_MANDATORY_RIGHT_ANCHOR_BP)
 */
export function generateR2fromR1(r1: PatternHalf): PatternHalf {
  const leftAnchor = reverseComplement(r1.rightAnchor);
  const rightAnchor = reverseComplement(r1.leftAnchor);
  return {
    umiName: r1.umi ? "UMI2" : undefined,
    insertName: "R2",
    umi: r1.umi ? { ...r1.umi } : undefined,
    leftAnchor,
    rightAnchor,
    rightTrim: defaultTrim(rightAnchor.length, R2_MANDATORY_RIGHT_ANCHOR_BP),
    insertLength: r1.insertLength,
    hasLeadingWildcard: r1.hasLeadingWildcard,
  };
}

// ─── Homopolymer detection ────────────────────────────────────────────────────

export type HomopolymerRun = { start: number; end: number; base: string };

/** Find runs of 5+ identical non-N bases (case-insensitive).
 *  By default excludes terminal runs. Set allowTrailing=true to include runs at the end. */
export function detectHomopolymers(seq: string, allowTrailing = false): HomopolymerRun[] {
  const runs: HomopolymerRun[] = [];
  let i = 0;
  while (i < seq.length) {
    const base = seq[i].toLowerCase();
    let j = i + 1;
    while (j < seq.length && seq[j].toLowerCase() === base) j++;
    const isTerminal = i === 0 || j === seq.length;
    if (j - i >= 5 && base !== "n" && (!isTerminal || (allowTrailing && j === seq.length)))
      runs.push({ start: i, end: j, base });
    i = j;
  }
  return runs;
}

// ─── Mismatch detection ───────────────────────────────────────────────────────

export type MismatchPosition = { index: number };

/**
 * Compare actual vs. expected character-by-character, returning indices that differ.
 * Lengths need not match — the longer string's trailing positions are all mismatches.
 */
export function detectMismatches(actual: string, expected: string): MismatchPosition[] {
  const len = Math.max(actual.length, expected.length);
  const result: MismatchPosition[] = [];
  for (let i = 0; i < len; i++) {
    if ((actual[i] ?? "") !== (expected[i] ?? "")) result.push({ index: i });
  }
  return result;
}

// ─── Per-field validators ─────────────────────────────────────────────────────

const DNA_IUPAC_RE = /^[ACGTacgtMKRYWSBDHVNmkrywsbdhvn]*$/;

export function validateAnchor(value: string): string | null {
  if (!DNA_IUPAC_RE.test(value))
    return "Only DNA/IUPAC characters allowed (A C G T M K R Y W S B D H V N)";
  return null;
}

export function validateUmiRange(umi: LengthRange): string | null {
  if (!Number.isInteger(umi.min) || umi.min < 1) return "UMI min length must be at least 1";
  if (!Number.isInteger(umi.max) || umi.max < umi.min) return "UMI max length must be ≥ min length";
  return null;
}

export function validateTrim(trim: number | undefined, anchor: string): string | null {
  if (trim === undefined) return null;
  if (!Number.isInteger(trim) || trim < 0) return "Trim value must be a non-negative integer";
  if (trim >= anchor.length)
    return `Trim value (${trim}) must be less than right anchor length (${anchor.length})`;
  return null;
}
