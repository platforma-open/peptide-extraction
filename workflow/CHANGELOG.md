# @platforma-open/milaboratories.peptide-profiling.workflow

## 1.4.1

### Patch Changes

- 4c5e3db: Keep the input's label out of the workflow arguments. The window writes it from the model's outputs when it opens, so a block made from a project template went out of date the first time it was opened and had to run again. The label now feeds only the subtitle; the trace of the results keeps naming the input dataset through the input's own trace, and the block's own entry is the custom label or "Peptide Profiling".

## 1.4.0

### Minor Changes

- 7795ada: The peptide can now be on Read 2 when Read 1 carries only a UMI (for example UMI + spacer + reverse-complement insert on Read 1, coding insert on Read 2): describe Read 1 as `^(UMI:N{12})*` and the peptide in the Read 2 part, and the Read 2 insert is translated. Such a pattern used to fail with `exec.arg(): argument must be a string`. Short peptide inserts with UMIs (under 15 aa) no longer give an empty table: the UMI consensus threshold now follows the peptide length (about 1 mismatch per 20 nt), so 14-aa inserts allow 2 mismatches instead of 1 and inserts of 15 aa or more are unchanged. Also updates the SDK.

## 1.3.3

### Patch Changes

- 4a635e8: Update MiTool to the versions with the rebuilt Docker images. The old images trust the compromised eMudhra intermediate CAs.

## 1.3.2

### Patch Changes

- ee91949: Release every package through npm trusted publishing (OIDC) so each package's trusted publisher is used before it expires.
- Updated dependencies [ee91949]
  - @platforma-open/milaboratories.peptide-profiling.software@1.3.2

## 1.3.1

### Patch Changes

- Updated dependencies [31b0f11]
  - @platforma-open/milaboratories.peptide-profiling.software@1.3.1

## 1.3.0

### Minor Changes

- c0862aa: Update dependencies and include dropped singleton reads in barplot

### Patch Changes

- Updated dependencies [c0862aa]
  - @platforma-open/milaboratories.peptide-profiling.software@1.3.0

## 1.2.0

### Minor Changes

- 2b8bdec: New UMI coverage distribution plot and read filtering based on UMI sequencing quality

### Patch Changes

- Updated dependencies [2b8bdec]
  - @platforma-open/milaboratories.peptide-profiling.software@1.2.0

## 1.1.2

### Patch Changes

- 460e340: Minor fixes

## 1.1.1

### Patch Changes

- d2a520c: Refactor and get ready for users

## 1.1.0

### Minor Changes

- 3c5c260: First working version

### Patch Changes

- 3523b46: First Changeset
- Updated dependencies [3523b46]
- Updated dependencies [3c5c260]
  - @platforma-open/milaboratories.peptide-profiling.software@1.1.0
