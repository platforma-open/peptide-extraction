# @platforma-open/milaboratories.peptide-profiling.model

## 1.3.1

### Patch Changes

- 72761e8: Allow `*` wildcards inside anchor sequences in tag patterns. Patterns such as
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

## 1.3.0

### Minor Changes

- c0862aa: Update dependencies and include dropped singleton reads in barplot

### Patch Changes

- 979b532: update dependencies

## 1.2.0

### Minor Changes

- 2b8bdec: New UMI coverage distribution plot and read filtering based on UMI sequencing quality

## 1.1.1

### Patch Changes

- d2a520c: Refactor and get ready for users

## 1.1.0

### Minor Changes

- 3c5c260: First working version

### Patch Changes

- 3523b46: First Changeset
