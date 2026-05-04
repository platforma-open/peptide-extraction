// Pre-computed seq-logo residue counts from the workflow.
// Each row: { sampleId, aaLength, position, residue, count }

import type { ResidueCounts } from "@milaboratories/multi-sequence-alignment";

/** Per-sample map of aaLength -> ResidueCounts (array indexed by position). */
export type SeqLogoByLength = Map<number, ResidueCounts>;

export function parseSeqLogoNdjson(content: string): Map<string, SeqLogoByLength> {
  const map = new Map<string, SeqLogoByLength>();
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const row = JSON.parse(trimmed) as {
        sampleId?: string;
        aaLength?: number;
        position?: number;
        residue?: string;
        count?: number;
      };
      const { sampleId, aaLength, position, residue, count } = row;
      if (
        !sampleId ||
        typeof aaLength !== "number" ||
        typeof position !== "number" ||
        !residue ||
        typeof count !== "number"
      )
        continue;

      let byLength = map.get(sampleId);
      if (!byLength) {
        byLength = new Map();
        map.set(sampleId, byLength);
      }
      let counts = byLength.get(aaLength);
      if (!counts) {
        counts = [];
        byLength.set(aaLength, counts);
      }
      if (!counts[position]) counts[position] = {};
      counts[position][residue] = (counts[position][residue] ?? 0) + count;
    } catch {
      // skip malformed lines
    }
  }
  return map;
}
