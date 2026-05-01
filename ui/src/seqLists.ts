/** Map of AA length -> list of peptide sequences at that length. */
export type LengthBuckets = Map<number, string[]>;

/** Minimum peptides required for a length bucket to drive a seq logo.*/
export const MIN_PEPTIDES_PER_LENGTH = 10;

/** Parse aa-sequences.ndjson (rows: {sampleId, aaLength, aaSeqPeptide}) into
 *  a per-sample map of length-bucketed sequence lists. The workflow caps
 *  each (sample, length) bucket at the top 3000 peptides by abundance. */
export function parseSeqListsNdjson(content: string): Map<string, LengthBuckets> {
  const map = new Map<string, LengthBuckets>();
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const row = JSON.parse(trimmed) as {
        sampleId?: string;
        aaLength?: number;
        aaSeqPeptide?: string;
      };
      const { sampleId, aaLength, aaSeqPeptide } = row;
      if (!sampleId || !aaSeqPeptide || typeof aaLength !== "number") continue;
      let buckets = map.get(sampleId);
      if (!buckets) {
        buckets = new Map();
        map.set(sampleId, buckets);
      }
      let list = buckets.get(aaLength);
      if (!list) {
        list = [];
        buckets.set(aaLength, list);
      }
      list.push(aaSeqPeptide);
    } catch {
      // skip malformed lines
    }
  }
  return map;
}
