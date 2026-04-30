import type { Preset } from "../types";

const preset: Preset = {
  id: "generic-amplicon-umi",
  vendor: "",
  kit: "Custom amplicon",
  label: "Custom amplicon with UMI barcodes",
  description:
    "Amplicon with a molecular barcode (UMI). Single-end or paired-end. Use Build mode to configure the UMI, flanks, and insert length — or Add mode to paste a raw mitool pattern.",
  pattern: "",
  userConfigurable: true,
  hasUmi: true,
};

export default preset;
