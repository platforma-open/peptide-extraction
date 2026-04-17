"""Extract QC check metrics, pipeline funnel, and distributions from mitool reports.

Parses the plain-text reports from parse, refine, and consensus steps.
Outputs three NDJSON files:
  1. QC checks with OK/WARN/ALERT status
  2. Pipeline funnel with read counts at each stage
  3. Distributions (R1/R2 lengths, UMI lengths, reads per UMI)

Usage:
  python qc_checks.py <parse_report> <refine_report> <consensus_report> \
      <qc_output.ndjson> <funnel_output.ndjson> <dist_output.ndjson>
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
    # Use `is not None` instead of truthiness so a 0-matched case still emits
    # the check (the whole point of the alert).
    if total is not None and matched is not None and total > 0:
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

# Fixed schema for funnel rows. All per-sample NDJSONs must share this shape,
# otherwise polars infers different column sets and the cross-sample concat
# in compute-qc.tpl.tengo fails.
FUNNEL_KEYS = ("step", "reads", "lost", "reason", "readsInContigs", "readsDiscarded")


def _normalize_funnel(funnel: list[dict]) -> list[dict]:
    """Fill missing keys with None so every row has the canonical schema."""
    return [{k: entry.get(k) for k in FUNNEL_KEYS} for entry in funnel]


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

    # When no reads match the pattern the downstream pipeline is skipped.
    # Still emit an output row so the Read Loss cell (which needs both input
    # and output entries) renders 100% loss instead of "Not ready".
    if matched_reads == 0 and total_reads is not None:
        funnel.append({
            "step": "output",
            "reads": 0,
            "lost": 0,
            "reason": "No reads matched pattern",
        })
        return funnel

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


# ── Distributions ─────────────────────────────────────────────────────────────

def _parse_distribution(text: str, header: str) -> list[dict]:
    """Parse a distribution section from a mitool report.
    Format:  <bin>: + <count> (<pct>%) = <cumulative> (<cum_pct>%)
    Returns empty if the tag has a fixed length (single value on the header line)."""
    rows = []
    bin_re = re.compile(r"^\s+([\d~]+):\s*\+\s*(\d+)\s*\(([\d.]+)%\)")
    start = text.find(header)
    if start == -1:
        return rows
    section = text[start + len(header):]
    # Fixed value on the header line (e.g., "UMI length: 15") — single-bin distribution
    first_line = section.split("\n")[0].strip()
    if first_line and re.match(r"^\d+$", first_line):
        return [{"bin": first_line, "count": 0, "pct": 100.0}]
    for line in section.split("\n"):
        if not line.strip():
            continue
        m = bin_re.match(line)
        if m:
            rows.append({
                "bin": m.group(1),
                "count": int(m.group(2)),
                "pct": float(m.group(3)),
            })
        elif rows:
            # Non-matching line after we have data = next section header, stop
            break
    return rows


def build_distributions(parse_text: str, consensus_text: str) -> list[dict]:
    """Extract distributions as flat NDJSON rows: {dist, bin, count, pct}."""
    entries: list[dict] = []

    dist_map = {
        # From parse report
        "r1_length": ("R1 length:", parse_text),
        "r2_length": ("R2 length:", parse_text),
        "umi_length": ("UMI length:", parse_text),
        "umi2_length": ("UMI2 length:", parse_text),
        # From consensus report
        "consensus_r1_length": ("Length of R1:", consensus_text),
        "consensus_r2_length": ("Length of R2:", consensus_text),
        "reads_per_contig": ("Distribution of reads in contigs:", consensus_text),
    }

    for dist_name, (header, text) in dist_map.items():
        rows = _parse_distribution(text, header)
        for row in rows:
            entries.append({
                "dist": dist_name,
                "bin": row["bin"],
                "count": row["count"],
                "pct": row["pct"],
            })

    return entries


def main():
    if len(sys.argv) != 7:
        print(
            f"Usage: {sys.argv[0]} <parse_report> <refine_report> <consensus_report> "
            "<qc_output.ndjson> <funnel_output.ndjson> <dist_output.ndjson>",
            file=sys.stderr,
        )
        sys.exit(1)

    (parse_path, refine_path, consensus_path,
     qc_output_path, funnel_output_path, dist_output_path) = sys.argv[1:7]

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
    funnel = _normalize_funnel(build_funnel(parse_text, refine_text, consensus_text))

    with open(funnel_output_path, "w") as f:
        for entry in funnel:
            f.write(json.dumps(entry) + "\n")

    # Distributions
    distributions = build_distributions(parse_text, consensus_text)

    # Guarantee at least one row. A 0-matched-reads parse report contains no
    # length distribution sections, so build_distributions returns []. Polars
    # scan_ndjson fails on empty files, which breaks the cross-sample concat
    # in compute-qc.tpl.tengo. The UI looks up distributions by known dist
    # names, so a sentinel with dist="__none__" is silently ignored.
    if not distributions:
        distributions.append({"dist": "__none__", "bin": "", "count": 0, "pct": 0.0})

    with open(dist_output_path, "w") as f:
        for entry in distributions:
            f.write(json.dumps(entry) + "\n")


if __name__ == "__main__":
    main()
