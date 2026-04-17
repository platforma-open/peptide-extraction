"""Gate script run after mitool parse.

Two jobs:
  1. Read the parse report and write a small JSON decision file consumed by
     the downstream Tengo subtemplate (tells it whether to continue).
  2. Write a *normalized* copy of the parse report with run-to-run jitter
     stripped. mitool includes an "Execution time: XYZms" line that changes
     between otherwise-identical runs; when the report is routed through the
     backend as a graph resource, that jitter produces different content CIDs
     for the same logical computation, which breaks content-addressed caching
     (CIDConflictError when the project graph re-resolves the field).

Usage:
  python parse_gate.py <parse_report> <decision_output.json> <normalized_report>
"""

import json
import re
import sys


def main():
    if len(sys.argv) != 4:
        print(
            f"Usage: {sys.argv[0]} <parse_report> <decision_output.json> <normalized_report>",
            file=sys.stderr,
        )
        sys.exit(1)

    parse_report_path, decision_path, normalized_path = sys.argv[1:4]

    with open(parse_report_path) as f:
        text = f.read()

    m = re.search(r"Matched reads:\s*(\d+)", text)
    matched = int(m.group(1)) if m else 0

    with open(decision_path, "w") as f:
        json.dump({"matched": matched, "shouldContinue": matched > 0}, f)

    normalized = re.sub(r"^Execution time:.*\n?", "", text, flags=re.MULTILINE)
    with open(normalized_path, "w") as f:
        f.write(normalized)


if __name__ == "__main__":
    main()
