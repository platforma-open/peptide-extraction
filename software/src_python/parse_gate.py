"""Gate script run after mitool parse.

Reads the parse report and writes a small JSON decision file consumed by the
downstream Tengo subtemplate (tells it whether to continue based on matched
read count).

Usage:
  python parse_gate.py <parse_report> <decision_output.json>
"""

import json
import re
import sys


def main():
    if len(sys.argv) != 3:
        print(
            f"Usage: {sys.argv[0]} <parse_report> <decision_output.json>",
            file=sys.stderr,
        )
        sys.exit(1)

    parse_report_path, decision_path = sys.argv[1:3]

    with open(parse_report_path) as f:
        text = f.read()

    m = re.search(r"Matched reads:\s*(\d+)", text)
    matched = int(m.group(1)) if m else 0

    with open(decision_path, "w") as f:
        json.dump({"matched": matched, "shouldContinue": matched > 0}, f)


if __name__ == "__main__":
    main()
