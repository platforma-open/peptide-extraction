// QC check result types and NDJSON parser.
// Mirrors the output of qc_checks.py — one check per NDJSON line, merged across samples.

export type QcStatus = "OK" | "WARN" | "ALERT";

export type QcCheckResult = {
  sampleId: string;
  step: string;
  status: QcStatus;
  checkType: string;
  label: string;
  printedValue: string;
  value: number;
  upper: number;
  middle: number;
};

/** Priority for aggregating worst status across checks */
export const qcStatusPriority: Record<QcStatus, number> = { OK: 0, WARN: 1, ALERT: 2 };

/** Compute the worst (highest priority) status from a list of checks */
export function worstStatus(checks: QcCheckResult[]): QcStatus {
  return checks.reduce<QcStatus>(
    (worst, c) => (qcStatusPriority[c.status] > qcStatusPriority[worst] ? c.status : worst),
    "OK",
  );
}

/** Descriptions shown when a QC check is expanded */
export const qcCheckDescriptions: Record<string, string> = {
  ParseMatchRate:
    "Fraction of total reads matching the tag pattern. Low match rate (<80%) typically indicates mutations in the constant flanking regions. Consider adapting the pattern with IUPAC ambiguity codes at variable positions.",
  ReadsPerUMI:
    "Average number of sequencing reads per unique molecular identifier. Below ~4 reads/UMI, error correction during consensus has limited statistical power. Below ~2, most molecules are singletons that get dropped. May indicate under-sequencing or excessive read loss at parse.",
  SingletonsDropped:
    "Molecules with only 1 read, removed by the minReadsPerConsensus threshold (default: 2). These cannot be error-corrected. High singleton rates compound with low parse rates \u2014 if both are bad, final consensus count will be very low.",
  AssemblyDiscardRate:
    "Reads within a UMI group that disagree with the consensus and are discarded. High rates (>15%) typically indicate R2 truncation from long peptide inserts approaching the read length limit. Check R2 length distributions. R1-only assembly may recover these reads.",
  FinalConsensusCount:
    "Total usable molecules after UMI deduplication and quality filtering. Depends on the experiment, but >100K is comfortable for enrichment analysis across selection rounds. Below 50K limits statistical power for differential abundance.",
};

/** Parse merged QC checks NDJSON into a map keyed by sampleId */
export function parseQcChecksNdjson(content: string): Map<string, QcCheckResult[]> {
  const map = new Map<string, QcCheckResult[]>();
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const row = JSON.parse(trimmed) as QcCheckResult;
      if (!row.sampleId || !row.checkType) continue;
      const list = map.get(row.sampleId) ?? [];
      list.push(row);
      map.set(row.sampleId, list);
    } catch {
      // skip malformed lines
    }
  }
  return map;
}
