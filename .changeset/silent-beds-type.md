---
"@platforma-open/milaboratories.peptide-profiling.workflow": minor
"@platforma-open/milaboratories.peptide-profiling": minor
---

The peptide can now be on Read 2 when Read 1 carries only a UMI (for example UMI + spacer + reverse-complement insert on Read 1, coding insert on Read 2): describe Read 1 as `^(UMI:N{12})*` and the peptide in the Read 2 part, and the Read 2 insert is translated. Such a pattern used to fail with `exec.arg(): argument must be a string`. Short peptide inserts with UMIs (under 15 aa) no longer give an empty table: the UMI consensus threshold now follows the peptide length (about 1 mismatch per 20 nt), so 14-aa inserts allow 2 mismatches instead of 1 and inserts of 15 aa or more are unchanged. Also updates the SDK.
