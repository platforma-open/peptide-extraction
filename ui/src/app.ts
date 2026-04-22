import { platforma } from "@platforma-open/milaboratories.peptide-extraction.model";
import { defineAppV3 } from "@platforma-sdk/ui-vue";
import MainPage from "./pages/MainPage.vue";
import QcReportTablePage from "./pages/QcReportTablePage.vue";

export const sdkPlugin = defineAppV3(platforma, () => {
  return {
    routes: {
      "/": () => MainPage,
      "/qc": () => QcReportTablePage,
    },
  };
});

export const useApp = sdkPlugin.useApp;
