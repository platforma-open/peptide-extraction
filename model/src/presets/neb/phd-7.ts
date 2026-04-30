import type { Preset } from "../types";

const preset: Preset = {
  id: "neb-phd-7",
  vendor: "NEB",
  kit: "Ph.D.-7",
  label: "Ph.D.-7 Phage Display Library",
  description:
    "7-mer linear NNK library (M13KE vector). Single-end reads, no UMI, both 5' and 3' flanks visible in the read.",
  pattern: "^*tttctattctcactct(R1:N{21})ggtggaggttcggccgaa*",
  notes:
    "Validated against PRJNA316731 (Brinton et al. 2016, PHASTpep). Other Ph.D.-7 library preps may use a different read layout — if parse match rate is low, switch to Custom and adjust the pattern.",
};

export default preset;
