import type {
  PatternHalf,
  PatternParts,
  UmiRange,
} from "@platforma-open/milaboratories.peptide-extraction.model";

// ─── Parse ────────────────────────────────────────────────────────────────────

// Matches one half of a mitool parse pattern:
//   ^(UMI:N{min:max})<leftAnchor>(R1:*)<rightAnchor>>{trim}*
//   or the same with UMI2 / R2 for the second half
//
// Groups: 1=umiMin, 2=umiMax(or empty), 3=leftAnchor, 4=rightAnchor, 5=trim(or empty)
const HALF_RE =
  /^\^\(UMI2?:N\{(\d+)(?::(\d+))?\}\)([A-Za-z]*)\(R[12]:\*\)([A-Za-z]*)(?:>\{(\d+)\})?\*$/;

function parseHalf(s: string): PatternHalf | null {
  const m = HALF_RE.exec(s.trim());
  if (!m) return null;
  const min = parseInt(m[1], 10);
  const max = m[2] !== undefined && m[2] !== "" ? parseInt(m[2], 10) : min;
  return {
    umi: { min, max },
    leftAnchor: m[3] ?? "",
    rightAnchor: m[4] ?? "",
    rightTrim: m[5] !== undefined && m[5] !== "" ? parseInt(m[5], 10) : undefined,
  };
}

/** Parse a full pattern string into parts, or return null if unparseable. */
export function parsePattern(str: string): PatternParts | null {
  const sep = str.indexOf("\\");
  if (sep === -1) {
    const r1 = parseHalf(str);
    return r1 ? { r1 } : null;
  }
  const r1 = parseHalf(str.slice(0, sep));
  const r2 = parseHalf(str.slice(sep + 1));
  if (!r1 || !r2) return null;
  return { r1, r2 };
}

// ─── Assemble ─────────────────────────────────────────────────────────────────

function assembleHalf(h: PatternHalf, index: 1 | 2): string {
  const { min, max } = h.umi;
  const umiLabel = index === 2 ? "UMI2" : "UMI";
  const readLabel = index === 2 ? "R2" : "R1";
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
  N: "N",
  m: "k",
  k: "m",
  r: "y",
  y: "r",
  w: "w",
  s: "s",
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
 * - leftAnchor  = reverse-complement of R1 rightAnchor  (no trim on R2 left)
 * - rightAnchor = reverse-complement of R1 leftAnchor
 * - rightTrim   = R1 leftAnchor length - 1  (or undefined when leftAnchor is empty)
 */
export function generateR2fromR1(r1: PatternHalf): PatternHalf {
  const leftAnchor = reverseComplement(r1.rightAnchor);
  const rightAnchor = reverseComplement(r1.leftAnchor);
  const rightTrim = rightAnchor.length > 0 ? rightAnchor.length - 1 : undefined;
  return {
    umi: { ...r1.umi },
    leftAnchor,
    rightAnchor,
    rightTrim,
  };
}

// ─── Homopolymer detection ────────────────────────────────────────────────────

export type HomopolymerRun = { start: number; end: number; base: string };

/** Find all runs of 3+ identical bases (case-insensitive). */
export function detectHomopolymers(seq: string): HomopolymerRun[] {
  const runs: HomopolymerRun[] = [];
  let i = 0;
  while (i < seq.length) {
    const base = seq[i].toLowerCase();
    let j = i + 1;
    while (j < seq.length && seq[j].toLowerCase() === base) j++;
    if (j - i >= 3 && base !== "n") runs.push({ start: i, end: j, base });
    i = j;
  }
  return runs;
}

/** Replace all homopolymer runs (3+) in seq with an equal number of 'n'. */
export function applyWildcards(seq: string): string {
  const runs = detectHomopolymers(seq);
  if (runs.length === 0) return seq;
  const chars = seq.split("");
  for (const { start, end } of runs) {
    for (let i = start; i < end; i++) chars[i] = "n";
  }
  return chars.join("");
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

const DNA_IUPAC_RE = /^[ACGTacgtMKRYWSNmkrywsn]*$/;

export function validateAnchor(value: string): string | null {
  if (!DNA_IUPAC_RE.test(value)) return "Only DNA/IUPAC characters allowed (A C G T M K R Y W S N)";
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
