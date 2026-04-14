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
// UMI tag name: any alphanumeric sequence starting with a letter (e.g. UMI, UMI1, CELL).
// Read tag name: R followed by one or more digits (e.g. R1, R2) — mitool classifies a tag
// as a read group only when name.drop(1).toIntOrNull() != null.
// Groups: 1=umiName, 2=umiMin, 3=umiMax(or empty), 4=leftAnchor, 5=readName, 6=rightAnchor, 7=trim(or empty)
const HALF_RE =
  /^\^\(([A-Za-z][A-Za-z0-9]*):N\{(\d+)(?::(\d+))?\}\)([A-Za-z]*)\(([Rr]\d+):\*\)([A-Za-z]*)(?:>\{(\d+)\})?\*$/;

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
