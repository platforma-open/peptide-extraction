import type { Preset } from "../types";

const preset: Preset = {
  id: "generic-amplicon-no-umi",
  vendor: "",
  kit: "Custom amplicon",
  label: "Custom amplicon",
  description:
    "Amplicon without a molecular barcode. Specify the 5' and 3' flanks and the insert length. Use this for custom library preps that are not covered by the NEB Ph.D. kit presets.",
  pattern: "",
  userConfigurable: true,
  hasUmi: false,
};

export default preset;
