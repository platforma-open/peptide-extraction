import type { Preset } from "../types";

const preset: Preset = {
  id: "neb-phd-12",
  vendor: "NEB",
  kit: "Ph.D.-12",
  label: "Ph.D.-12 Phage Display Library",
  description:
    "12-mer linear NNK library (M13KE vector). Single-end reads, no UMI, insert at the very start of the read with only the 3' flank visible.",
  pattern: "^(R1:N{36})ggtggaggttcggccgaa*",
  notes:
    "Validated against PRJNA646756 (S100 protein family screen). Other Ph.D.-12 library preps may place the insert differently — if parse match rate is low, switch to Custom and adjust the pattern.",
};

export default preset;
