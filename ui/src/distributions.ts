// Distribution data types and NDJSON parser.
// Each row is one bin of one distribution for one sample.

export type DistBin = {
  bin: string;
  count: number;
  pct: number;
};

export type SampleDistributions = Record<string, DistBin[]>;

/** Build dynamic distribution labels using actual tag names from patternParts */
export function buildDistLabels(
  r1ReadName?: string,
  r2ReadName?: string,
  r1UmiName?: string,
  r2UmiName?: string,
): Record<string, string> {
  const r1 = r1ReadName ?? "R1";
  const r2 = r2ReadName ?? "R2";
  const umi1 = r1UmiName ?? "UMI";
  const umi2 = r2UmiName ?? "UMI2";
  return {
    r1_length: `${r1} (parsed results)`,
    r2_length: `${r2} (parsed results)`,
    umi_length: umi1,
    umi2_length: umi2,
    consensus_r1_length: `${r1} (after filtering and consensus)`,
    consensus_r2_length: `${r2} (after filtering and consensus)`,
    reads_per_contig: "Reads per Consensus",
  };
}

/** Parse merged distributions NDJSON into a map: sampleId -> { distName -> bins[] } */
export function parseDistributionsNdjson(content: string): Map<string, SampleDistributions> {
  const map = new Map<string, SampleDistributions>();
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const row = JSON.parse(trimmed) as {
        sampleId: string;
        dist: string;
        bin: string;
        count: number;
        pct: number;
      };
      if (!row.sampleId || !row.dist) continue;
      let sample = map.get(row.sampleId);
      if (!sample) {
        sample = {};
        map.set(row.sampleId, sample);
      }
      if (!sample[row.dist]) sample[row.dist] = [];
      sample[row.dist].push({ bin: row.bin, count: row.count, pct: row.pct });
    } catch {
      // skip malformed lines
    }
  }
  return map;
}
