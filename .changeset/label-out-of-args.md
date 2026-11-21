---
"@platforma-open/milaboratories.peptide-profiling": patch
"@platforma-open/milaboratories.peptide-profiling.model": patch
"@platforma-open/milaboratories.peptide-profiling.workflow": patch
---

Keep the input's label out of the workflow arguments. The window writes it from the model's outputs when it opens, so a block made from a project template went out of date the first time it was opened and had to run again. The label now feeds only the subtitle; the trace of the results keeps naming the input dataset through the input's own trace, and the block's own entry is the custom label or "Peptide Profiling".
