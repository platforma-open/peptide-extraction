---
"@platforma-open/milaboratories.peptide-profiling.model": patch
"@platforma-open/milaboratories.peptide-profiling.ui": patch
"@platforma-open/milaboratories.peptide-profiling.workflow": patch
---

Compute the block label without the UI

The trace label is now the custom block label or "Peptide Profiling", computed by the
model, so opening the block no longer changes its arguments and a block that was never
opened gets the same label. The input dataset name moves to the subtitle only; it was
already part of the inherited upstream trace.
Existing blocks show as stale once after the update because the arguments change shape.
