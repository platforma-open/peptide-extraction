"""Extract QC check metrics from mitool parse, refine, and consensus reports.

Parses the plain-text reports, computes OK/WARN/ALERT status for each metric,
and outputs a flat NDJSON file (one JSON object per check).

Usage:
  python qc_checks.py <parse_report> <refine_report> <consensus_report> <output.ndjson>
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


def parse_parse_report(text: str) -> list[dict]:
    """Extract checks from the mitool parse report."""
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


def main():
    if len(sys.argv) != 5:
        print(f"Usage: {sys.argv[0]} <parse_report> <refine_report> <consensus_report> <output.ndjson>",
              file=sys.stderr)
        sys.exit(1)

    parse_path, refine_path, consensus_path, output_path = sys.argv[1:5]

    checks: list[dict] = []

    with open(parse_path) as f:
        checks.extend(parse_parse_report(f.read()))

    with open(refine_path) as f:
        checks.extend(parse_refine_report(f.read()))

    with open(consensus_path) as f:
        checks.extend(parse_consensus_report(f.read()))

    with open(output_path, "w") as f:
        for check in checks:
            f.write(json.dumps(check) + "\n")


if __name__ == "__main__":
    main()
