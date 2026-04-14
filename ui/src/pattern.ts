import type {
  PatternHalf,
  PatternParts,
  UmiRange,
} from "@platforma-open/milaboratories.peptide-extraction.model";
export { parsePattern } from "@platforma-open/milaboratories.peptide-extraction.model";

// ─── Assemble ─────────────────────────────────────────────────────────────────

function assembleHalf(h: PatternHalf, defaultIndex: 1 | 2): string {
  const { min, max } = h.umi;
  const umiLabel = h.umiName ?? (defaultIndex === 2 ? "UMI2" : "UMI");
  const readLabel = h.readName ?? (defaultIndex === 2 ? "R2" : "R1");
  const umiRange = min === max ? `${min}` : `${min}:${max}`;
  const trim = h.rightTrim !== undefined ? `>{${h.rightTrim}}` : "";
  return `^(${umiLabel}:N{${umiRange}})${h.leftAnchor}(${readLabel}:*)${h.rightAnchor}${trim}*`;
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

/**
 * Auto-generate an R2 half from R1:
 * - UMI range copied as-is
 * - leftAnchor  = reverse-complement of R1 rightAnchor
 * - rightAnchor = reverse-complement of R1 leftAnchor
 * - rightTrim   = 5 if rightAnchor length > 5, otherwise undefined
 */
export function generateR2fromR1(r1: PatternHalf): PatternHalf {
  const leftAnchor = reverseComplement(r1.rightAnchor);
  const rightAnchor = reverseComplement(r1.leftAnchor);
  const rightTrim = rightAnchor.length > 5 ? 5 : undefined;
  return {
    umiName: "UMI2",
    readName: "R2",
    umi: { ...r1.umi },
    leftAnchor,
    rightAnchor,
    rightTrim,
  };
}

// ─── Homopolymer detection ────────────────────────────────────────────────────

export type HomopolymerRun = { start: number; end: number; base: string };

/** Find all non-terminal runs of 5+ identical non-N bases (case-insensitive). */
export function detectHomopolymers(seq: string): HomopolymerRun[] {
  const runs: HomopolymerRun[] = [];
  let i = 0;
  while (i < seq.length) {
    const base = seq[i].toLowerCase();
    let j = i + 1;
    while (j < seq.length && seq[j].toLowerCase() === base) j++;
    if (j - i >= 5 && base !== "n" && i > 0 && j < seq.length)
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
  if (!DNA_IUPAC_RE.test(value)) return "Only DNA/IUPAC characters allowed (A C G T M K R Y W S B D H V N)";
  return null;
}

export function validateUmiRange(umi: UmiRange): string | null {
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
