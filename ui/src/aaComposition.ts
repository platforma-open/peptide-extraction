export const AMINO_ACIDS = [
  "A",
  "C",
  "D",
  "E",
  "F",
  "G",
  "H",
  "I",
  "K",
  "L",
  "M",
  "N",
  "P",
  "Q",
  "R",
  "S",
  "T",
  "V",
  "W",
  "Y",
] as const;

/** Per-sample AA composition: amino acid single-letter code -> percentage (0-100) */
export type SampleComposition = Record<string, number>;

/** Parse NDJSON output from compute-qc into a map keyed by sampleId */
export function parseCompositionNdjson(content: string): Map<string, SampleComposition> {
  const map = new Map<string, SampleComposition>();
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const row = JSON.parse(trimmed) as Record<string, unknown>;
      const sampleId = row.sampleId as string;
      if (!sampleId) continue;
      const comp: SampleComposition = {};
      for (const aa of AMINO_ACIDS) {
        const val = row[aa];
        if (typeof val === "number" && !Number.isNaN(val)) {
          comp[aa] = val;
        }
      }
      map.set(sampleId, comp);
    } catch {
      // skip malformed lines
    }
  }
  return map;
}
