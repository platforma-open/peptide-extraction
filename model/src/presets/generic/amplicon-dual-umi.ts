import type { Preset } from "../types";

const preset: Preset = {
  id: "generic-amplicon-dual-umi",
  vendor: "",
  kit: "Generic amplicon",
  label: "Generic amplicon (dual UMI)",
  description:
    "Paired-end amplicon with a UMI at the start of both reads. Specify the 5' and 3' flanks (R1 orientation), insert length, and UMI length.",
  pattern: "",
  userConfigurable: true,
};

export default preset;
