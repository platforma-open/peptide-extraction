/** Parse aa-sequences.ndjson into a map of sampleId -> AA sequence list (max 1000 per sample) */
export function parseSeqListsNdjson(content: string): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const row = JSON.parse(trimmed) as { sampleId?: string; aaSeqPeptide?: string };
      const { sampleId, aaSeqPeptide } = row;
      if (!sampleId || !aaSeqPeptide) continue;
      let list = map.get(sampleId);
      if (!list) {
        list = [];
        map.set(sampleId, list);
      }
      // TODO: discuss the limits, example with 20000 requires ~5s for every sample
      if (list.length < 3000) {
        list.push(aaSeqPeptide);
      }
    } catch {
      // skip malformed lines
    }
  }
  return map;
}
