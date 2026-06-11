---
'@platforma-open/milaboratories.peptide-profiling.model': patch
'@platforma-open/milaboratories.peptide-profiling.ui': patch
---

Allow `*` wildcards inside anchor sequences in tag patterns. Patterns such as
`^(UMI:N{13})*ggccatggcc(R1:*)gcggccgcac*` (a floating 5' anchor) — and `*`
appearing anywhere within or around the constant flanks — now validate in
Pattern String mode and round-trip through the builder unchanged. Previously
the validator only accepted `*` as a leading (`^*`) or trailing wildcard or
inside the `(R:*)` capture, rejecting any `*` adjacent to an anchor.

Also validate the right-anchor trim `>{n}` against the anchor: mitool counts
only the contiguous motif characters immediately left of `>`, and a `*` resets
that count, so a trim larger than the characters after the last `*` (e.g.
`gcggcc*aaactc>{46}`) is now rejected up front with a clear message instead of
failing mid-run with "Not enough characters to the left of the '>' pattern".
