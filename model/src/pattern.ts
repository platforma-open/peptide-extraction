export type UmiRange = { min: number; max: number };

export type PatternHalf = {
  umi: UmiRange;
  umiName?: string; // e.g. "UMI", "UMI1", "UMI2", "CELL" — defaults to "UMI"/"UMI2" in assembly
  readName?: string; // e.g. "R1", "R2" — defaults to "R1"/"R2" in assembly
  leftAnchor: string;
  rightAnchor: string;
  rightTrim?: number;
};

export type PatternParts = {
  r1: PatternHalf;
  r2?: PatternHalf;
};

// Matches one half of a mitool parse pattern:
//   ^(<umiName>:N{min:max})<leftAnchor>(<readName>:*)<rightAnchor>>{trim}*
//
// UMI tag name: UMI followed by optional digits (e.g. UMI, UMI1, UMI2).
// Peptide tag name: R followed by one or more digits (e.g. R1, R2).
// Groups: 1=umiName, 2=umiMin, 3=umiMax(or empty), 4=leftAnchor, 5=readName, 6=rightAnchor, 7=trim(or empty)
const HALF_RE =
  /^\^\(([Uu][Mm][Ii]\d*):N\{(\d+)(?::(\d+))?\}\)([A-Za-z]+)\(([Rr]\d+):\*\)([A-Za-z]+)(?:>\{(\d+)\})?\*$/;

function parseHalf(s: string): PatternHalf | null {
  const m = HALF_RE.exec(s.trim());
  if (!m) return null;
  const min = parseInt(m[2], 10);
  const max = m[3] !== undefined && m[3] !== "" ? parseInt(m[3], 10) : min;
  return {
    umiName: m[1],
    umi: { min, max },
    leftAnchor: m[4] ?? "",
    readName: m[5],
    rightAnchor: m[6] ?? "",
    rightTrim: m[7] !== undefined && m[7] !== "" ? parseInt(m[7], 10) : undefined,
  };
}

/** Replace homopolymer runs (5+ identical bases, excluding N) with lowercase n wildcards.
 *  Excludes terminal runs unless allowTrailing is true (for right anchors only). */
function replaceHomopolymers(anchor: string, allowTrailing = false): string {
  const len = anchor.length;
  return anchor.replace(/([acgtACGTmkrywsMKRYWS])\1{4,}/gi, (match, _base, offset) => {
    const atStart = offset === 0;
    const atEnd = offset + match.length === len;
    if (atStart) return match; // never replace leading runs
    if (atEnd && !allowTrailing) return match; // skip trailing unless allowed
    return "n".repeat(match.length);
  });
}

function assembleHalf(h: PatternHalf): string {
  const umiRange = h.umi.min === h.umi.max ? `${h.umi.min}` : `${h.umi.min}:${h.umi.max}`;
  const trim = h.rightTrim !== undefined ? `>{${h.rightTrim}}` : "";
  return `^(${h.umiName}:N{${umiRange}})${h.leftAnchor}(${h.readName}:*)${h.rightAnchor}${trim}*`;
}

/** Apply wildcard replacement to homopolymer runs in all anchors. Returns the modified pattern. */
export function applyWildcards(pattern: string): string {
  const parts = parsePattern(pattern);
  if (!parts) return pattern;

  const r1: PatternHalf = {
    ...parts.r1,
    leftAnchor: replaceHomopolymers(parts.r1.leftAnchor),
    rightAnchor: replaceHomopolymers(parts.r1.rightAnchor, true),
  };
  const r1Str = assembleHalf(r1);

  if (!parts.r2) return r1Str;

  const r2: PatternHalf = {
    ...parts.r2,
    leftAnchor: replaceHomopolymers(parts.r2.leftAnchor),
    rightAnchor: replaceHomopolymers(parts.r2.rightAnchor, true),
  };
  return `${r1Str}\\${assembleHalf(r2)}`;
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

  // All four tag names must be unique
  const tags = [r1.umiName, r1.readName, r2.umiName, r2.readName];
  if (new Set(tags).size !== tags.length) return null;

  return { r1, r2 };
}
