import type { ResidueCounts } from "@milaboratories/multi-sequence-alignment";

const ALPHABET_SIZE = 20; // amino acid alphabet
const MAX_INFORMATION = Math.log2(ALPHABET_SIZE); // ≈ 4.32 bits

/** Convert raw per-position residue counts into information-content-weighted
 *  heights for a classical sequence logo (Schneider & Stephens 1990).
 *
 *  Each position's total height becomes its information content
 *      I(i) = log2(20) − H(i) − e(n)
 *  where H(i) is Shannon entropy of the residue distribution and e(n) is the
 *  small-sample correction. Residue letters at a position keep their relative
 *  frequencies, so a perfectly conserved position renders ~4.32 bits tall
 *  with one letter, and a uniform position collapses to 0.
 *
 *  This is far more legible at small heights than the count-based stacking
 *  the SeqLogo component does by default — variable positions don't smear
 *  20 letters across a few pixels. */
export function informationWeightedCounts(counts: ResidueCounts): ResidueCounts {
  return counts.map((position) => {
    let total = 0;
    for (const c of Object.values(position)) total += c;
    if (total === 0) return {};

    let entropy = 0;
    for (const c of Object.values(position)) {
      if (c <= 0) continue;
      const p = c / total;
      entropy -= p * Math.log2(p);
    }

    // Small-sample correction: e(n) = (s − 1) / (2 · ln 2 · n).
    // Negligible for our 3000-cap buckets, ~1.4 bits at the 10-peptide floor.
    const correction = (ALPHABET_SIZE - 1) / (2 * Math.LN2 * total);
    const informationContent = Math.max(0, MAX_INFORMATION - entropy - correction);

    const out: Record<string, number> = {};
    for (const [residue, c] of Object.entries(position)) {
      if (c <= 0) continue;
      out[residue] = (c / total) * informationContent;
    }
    return out;
  });
}
