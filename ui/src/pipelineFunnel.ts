// Pipeline funnel types and NDJSON parser.
// One entry per pipeline stage per sample, showing read counts and losses.

export type FunnelEntry = {
  sampleId: string;
  step: string;
  reads: number;
  lost?: number;
  reason?: string;
  readsInContigs?: number;
  readsDiscarded?: number;
};

/** Parse merged pipeline funnel NDJSON into a map keyed by sampleId */
export function parseFunnelNdjson(content: string): Map<string, FunnelEntry[]> {
  const map = new Map<string, FunnelEntry[]>();
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const row = JSON.parse(trimmed) as FunnelEntry;
      if (!row.sampleId || !row.step) continue;
      const list = map.get(row.sampleId) ?? [];
      list.push(row);
      map.set(row.sampleId, list);
    } catch {
      // skip malformed lines
    }
  }
  return map;
}
