export type LengthRange = { min: number; max: number };

/** Length spec for the peptide insert (R capture) in a mitool pattern:
 *   undefined   = variable length (`*`)
 *   number      = fixed length (`N{n}`)
 *   LengthRange = ranged length (`N{min:max}`)
 */
export type InsertLength = number | LengthRange | undefined;

export type PatternHalf = {
  umi?: LengthRange;
  umiName?: string; // e.g. "UMI", "UMI1", "UMI2", "CELL"
  insertName?: string; // e.g. "R1", "R2"
  leftAnchor: string; // may be empty
  rightAnchor: string; // may be empty
  rightTrim?: number;
  insertLength?: InsertLength; // undefined = variable (`*`)
  hasLeadingWildcard?: boolean; // pattern starts with `^*` before the (optional) UMI/anchor
};

export type PatternParts = {
  r1: PatternHalf;
  r2?: PatternHalf;
};

// Matches one half of a mitool parse pattern. All parts except the R capture
// and trailing `*` are optional:
//
//   ^[*][(umiName:N{min[:max]})][leftAnchor](insertName:*|N{n}|N{min:max})[rightAnchor][>{trim}]*
//
// Groups:
//   1 = leading wildcard (`*`) or empty
//   2 = umiName (if UMI present)
//   3 = umiMin
//   4 = umiMax (or empty when min == max)
//   5 = leftAnchor (may be empty)
//   6 = insertName (R1, R2, ...)
//   7 = `*` when the capture is variable-length
//   8 = insertLength min (fixed or ranged)
//   9 = insertLength max (only when ranged)
//   10 = rightAnchor (may be empty)
//   11 = right trim (or empty)
const HALF_RE =
  /^\^(\*)?(?:\(([Uu][Mm][Ii]\d*):N\{(\d+)(?::(\d+))?\}\))?([A-Za-z]*)\(([Rr]\d+):(?:(\*)|N\{(\d+)(?::(\d+))?\})\)([A-Za-z]*)(?:>\{(\d+)\})?\*$/;

function parseHalf(s: string): PatternHalf | null {
  const m = HALF_RE.exec(s.trim());
  if (!m) return null;

  const hasLeadingWildcard = m[1] === "*";

  let umi: LengthRange | undefined;
  let umiName: string | undefined;
  if (m[2] !== undefined) {
    umiName = m[2];
    const min = parseInt(m[3], 10);
    const max = m[4] !== undefined && m[4] !== "" ? parseInt(m[4], 10) : min;
    umi = { min, max };
  }

  const leftAnchor = m[5] ?? "";
  const insertName = m[6];

  let insertLength: InsertLength;
  if (m[7] === "*") {
    insertLength = undefined; // variable
  } else {
    const min = parseInt(m[8], 10);
    const max = m[9] !== undefined && m[9] !== "" ? parseInt(m[9], 10) : min;
    insertLength = min === max ? min : { min, max };
  }

  const rightAnchor = m[10] ?? "";
  const rightTrim = m[11] !== undefined && m[11] !== "" ? parseInt(m[11], 10) : undefined;

  return {
    hasLeadingWildcard,
    umi,
    umiName,
    leftAnchor,
    insertName,
    rightAnchor,
    rightTrim,
    insertLength,
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
  const prefix = h.hasLeadingWildcard ? "*" : "";
  const umiPart =
    h.umi && h.umiName
      ? `(${h.umiName}:N{${h.umi.min === h.umi.max ? h.umi.min : `${h.umi.min}:${h.umi.max}`}})`
      : "";
  let insertLenPart: string;
  if (h.insertLength === undefined) {
    insertLenPart = "*";
  } else if (typeof h.insertLength === "number") {
    insertLenPart = `N{${h.insertLength}}`;
  } else {
    insertLenPart =
      h.insertLength.min === h.insertLength.max
        ? `N{${h.insertLength.min}}`
        : `N{${h.insertLength.min}:${h.insertLength.max}}`;
  }
  const trim = h.rightTrim !== undefined ? `>{${h.rightTrim}}` : "";
  return `^${prefix}${umiPart}${h.leftAnchor}(${h.insertName}:${insertLenPart})${h.rightAnchor}${trim}*`;
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

  // All defined tag names must be unique. Absent UMIs (undefined) are not tags.
  const tags = [r1.umiName, r1.insertName, r2.umiName, r2.insertName].filter(
    (t): t is string => t !== undefined,
  );
  if (new Set(tags).size !== tags.length) return null;

  return { r1, r2 };
}
