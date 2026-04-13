import { platforma } from "@platforma-open/milaboratories.peptide-extraction.model";
import { defineAppV3 } from "@platforma-sdk/ui-vue";
import MainPage from "./pages/MainPage.vue";
import QcReportTablePage from "./pages/QcReportTablePage.vue";
import ResultsPage from "./pages/ResultsPage.vue";

export const sdkPlugin = defineAppV3(platforma, () => {
  return {
    routes: {
      "/": () => MainPage,
      "/qc": () => QcReportTablePage,
      "/results": () => ResultsPage,
    },
  };
});

export const useApp = sdkPlugin.useApp;
