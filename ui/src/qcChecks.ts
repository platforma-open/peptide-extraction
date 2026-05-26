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
    "Fraction of UMI groups containing only a single read, removed by the 'Min reads per UMI'  threshold (default: 2). Consensus assembly requires multiple reads from the same molecule to correct sequencing errors by majority vote \u2014 with only one read, errors cannot be distinguished from real sequence. High singleton rates often result from insufficient sequencing depth or excessive read loss during parsing. Setting 'Min reads per UMI' to 1 retains singletons at the risk of incorporating uncorrected sequencing errors into the final consensus.",
  AssemblyDiscardRate:
    "Fraction of reads that share a UMI but whose insert/peptide didn't match the rest of their group. The two common causes are sequencing errors and Read 2 truncation (Read 2 is too short to cover the full peptide when the insert is long). High rates (>15%) usually point to Read 2 truncation \u2014 check the Read 2 length distribution. R1-only assembly may recover these reads, at the cost of losing the independent Read 2 consensus check.",
  FinalConsensusCount:
    "Number of consensus sequences produced after UMI deduplication, singleton removal, and assembly. Each consensus represents one deduplicated molecule. The required count depends on library complexity and experimental design \u2014 enrichment analysis across multiple selection rounds typically needs >100K for robust statistics, while smaller focused libraries may work with less. Counts below 50K should be investigated, as they may indicate issues with parse rate, sequencing depth, or library preparation.",
  SingletonReadRate:
    "Fraction of matched reads supporting peptides observed only once. Upstream reading-frame and stop-codon constraints filter most random base substitutions, so this rate might reflect library complexity and sequencing depth. High values typically indicate under-sequencing, excessive read loss during parsing, or high diversity relative to depth. Enabling 'Drop read singletons' filters out these peptides at the cost of losing rare-but-real signal that downstream clustering could otherwise recover.",
  TrailingNucleotidesRate:
    "Abundance-weighted fraction of molecules whose peptide nucleotide sequence length is not divisible by 3, causing trailing bases to be trimmed before translation.",
  EarlyStopCodonRate:
    "Abundance-weighted fraction of molecules whose translated peptide ends prematurely at an internal stop codon (TAA, TAG, or TGA in frame).",
};

/** Format a QC check's displayed value. Falls back to checkType-based formatting when
 *  `printedValue` is empty (as is the case for check rows produced directly in ptabler,
 *  which does not have a clean percentage-string formatter). */
export function formatCheckPrintedValue(check: QcCheckResult): string {
  if (check.printedValue) return check.printedValue;
  if (check.checkType.endsWith("Rate")) {
    return `${(check.value * 100).toFixed(1)}%`;
  }
  return String(check.value);
}

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
