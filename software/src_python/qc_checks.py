"""Extract QC check metrics and pipeline funnel data from mitool reports.

Parses the plain-text reports from parse, refine, and consensus steps.
Outputs two NDJSON files:
  1. QC checks with OK/WARN/ALERT status
  2. Pipeline funnel with read counts at each stage

Usage:
  python qc_checks.py <parse_report> <refine_report> <consensus_report> <qc_output.ndjson> <funnel_output.ndjson>
"""

import json
import re
import sys


def _extract(text: str, pattern: str) -> str | None:
    """Extract first capture group from text using regex."""
    m = re.search(pattern, text)
    return m.group(1) if m else None


def _extract_float(text: str, pattern: str) -> float | None:
    """Extract a float from the first capture group."""
    val = _extract(text, pattern)
    return float(val) if val is not None else None


def _extract_int(text: str, pattern: str) -> int | None:
    """Extract an integer from the first capture group."""
    val = _extract(text, pattern)
    return int(val) if val is not None else None


def _status(value: float, upper: float, middle: float, higher_is_better: bool = True) -> str:
    """Compute OK/WARN/ALERT status from value and thresholds."""
    if higher_is_better:
        if value >= upper:
            return "OK"
        if value >= middle:
            return "WARN"
        return "ALERT"
    else:
        if value <= upper:
            return "OK"
        if value <= middle:
            return "WARN"
        return "ALERT"


def _check(step: str, check_type: str, label: str, value: float,
           printed_value: str, upper: float, middle: float,
           higher_is_better: bool = True) -> dict:
    """Build a QC check result dict."""
    return {
        "step": step,
        "status": _status(value, upper, middle, higher_is_better),
        "checkType": check_type,
        "label": label,
        "printedValue": printed_value,
        "value": round(value, 6),
        "upper": upper,
        "middle": middle,
    }


# ── QC checks ────────────────────────────────────────────────────────────────

def parse_parse_report(text: str) -> list[dict]:
    checks = []
    total = _extract_float(text, r"Total reads:\s*([\d.]+)")
    matched = _extract_float(text, r"Matched reads:\s*([\d.]+)")
    if total and matched and total > 0:
        rate = matched / total
        checks.append(_check(
            "parse", "ParseMatchRate", "Parse match rate", rate,
            f"{rate * 100:.1f}%", upper=0.8, middle=0.5,
        ))
    return checks


def parse_refine_report(text: str) -> list[dict]:
    """Extract checks from the mitool refine-tags report."""
    checks = []
    # UMI reads per tag (always present)
    reads_per_umi = _extract_float(text, r"UMI mean records per tag:\s*([\d.]+)")
    if reads_per_umi is not None:
        checks.append(_check(
            "refine", "ReadsPerUMI", "Reads per UMI", reads_per_umi,
            f"{reads_per_umi:.1f}", upper=4.0, middle=2.0,
        ))
    return checks


def parse_consensus_report(text: str) -> list[dict]:
    """Extract checks from the mitool consensus report."""
    checks = []
    # Singletons dropped
    groups_pct = _extract_float(text, r"Groups dropped by count:\s*[\d]+\s*\(([\d.]+)%\)")
    if groups_pct is not None:
        rate = groups_pct / 100
        checks.append(_check(
            "consensus", "SingletonsDropped", "Singletons dropped", rate,
            f"{groups_pct:.1f}%", upper=0.15, middle=0.30, higher_is_better=False,
        ))

    # Assembly discard rate
    discard_pct = _extract_float(text, r"Reads discarded during assembly:\s*[\d]+\s*\(([\d.]+)%\)")
    if discard_pct is not None:
        rate = discard_pct / 100
        checks.append(_check(
            "consensus", "AssemblyDiscardRate", "Assembly discard rate", rate,
            f"{discard_pct:.1f}%", upper=0.10, middle=0.20, higher_is_better=False,
        ))

    # Final consensus count
    consensuses = _extract_float(text, r"Consensuses:\s*([\d]+)")
    if consensuses is not None:
        checks.append(_check(
            "consensus", "FinalConsensusCount", "Final consensus count", consensuses,
            f"{int(consensuses):,}", upper=100_000, middle=50_000,
        ))
    return checks


# ── Pipeline funnel ───────────────────────────────────────────────────────────

def build_funnel(parse_text: str, refine_text: str, consensus_text: str) -> list[dict]:
    """Build pipeline funnel entries with read counts at each stage."""
    funnel: list[dict] = []

    # Parse stage
    total_reads = _extract_int(parse_text, r"Total reads:\s*(\d+)")
    matched_reads = _extract_int(parse_text, r"Matched reads:\s*(\d+)")
    if total_reads is not None:
        funnel.append({"step": "input", "reads": total_reads})
    if matched_reads is not None and total_reads is not None:
        funnel.append({
            "step": "parse",
            "reads": matched_reads,
            "lost": total_reads - matched_reads,
            "reason": "Pattern mismatch",
        })

    # Refine stage
    refine_input = _extract_int(refine_text, r"Number of input records:\s*(\d+)")
    refine_output = _extract_int(refine_text, r"Number of output records:\s*(\d+)")
    if refine_output is not None and refine_input is not None:
        funnel.append({
            "step": "refine",
            "reads": refine_output,
            "lost": refine_input - refine_output,
            "reason": "Tag quality filter",
        })

    # Consensus stage — two sub-losses
    groups = _extract_int(consensus_text, r"Groups:\s*(\d+)")
    singletons = _extract_int(consensus_text, r"Groups dropped by count:\s*(\d+)")
    reads_in_contigs = _extract_int(consensus_text, r"Reads in contigs:\s*(\d+)")
    reads_discarded = _extract_int(consensus_text, r"Reads discarded during assembly:\s*(\d+)")
    consensuses = _extract_int(consensus_text, r"Consensuses:\s*(\d+)")

    # Reads → UMI groups transition (many reads per molecule)
    if refine_output is not None and groups is not None:
        funnel.append({
            "step": "umi_dedup",
            "reads": groups,
            "lost": refine_output - groups,
            "reason": "Reads collapsed into UMIs",
        })

    surviving_groups = None
    if groups is not None and singletons is not None:
        surviving_groups = groups - singletons
        funnel.append({
            "step": "consensus_groups",
            "reads": surviving_groups,
            "lost": singletons,
            "reason": "Singleton UMIs dropped",
        })
    if consensuses is not None:
        lost_in_assembly = (surviving_groups - consensuses) if surviving_groups is not None else None
        output_entry: dict = {
            "step": "output",
            "reads": consensuses,
        }
        if lost_in_assembly and lost_in_assembly > 0:
            output_entry["lost"] = lost_in_assembly
            output_entry["reason"] = "UMIs failed assembly"
        if reads_in_contigs is not None:
            output_entry["readsInContigs"] = reads_in_contigs
        if reads_discarded is not None:
            output_entry["readsDiscarded"] = reads_discarded
        funnel.append(output_entry)

    return funnel


def main():
    if len(sys.argv) != 6:
        print(
            f"Usage: {sys.argv[0]} <parse_report> <refine_report> <consensus_report> "
            "<qc_output.ndjson> <funnel_output.ndjson>",
            file=sys.stderr,
        )
        sys.exit(1)

    parse_path, refine_path, consensus_path, qc_output_path, funnel_output_path = sys.argv[1:6]

    with open(parse_path) as f:
        parse_text = f.read()
    with open(refine_path) as f:
        refine_text = f.read()
    with open(consensus_path) as f:
        consensus_text = f.read()

    # QC checks
    checks: list[dict] = []
    checks.extend(parse_parse_report(parse_text))
    checks.extend(parse_refine_report(refine_text))
    checks.extend(parse_consensus_report(consensus_text))

    with open(qc_output_path, "w") as f:
        for check in checks:
            f.write(json.dumps(check) + "\n")

    # Pipeline funnel
    funnel = build_funnel(parse_text, refine_text, consensus_text)

    with open(funnel_output_path, "w") as f:
        for entry in funnel:
            f.write(json.dumps(entry) + "\n")


if __name__ == "__main__":
    main()
