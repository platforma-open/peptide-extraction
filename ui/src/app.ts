import { platforma } from "@platforma-open/milaboratories.peptide-profiling.model";
import { defineAppV3 } from "@platforma-sdk/ui-vue";
import MainPage from "./pages/MainPage.vue";
import QcReportTablePage from "./pages/QcReportTablePage.vue";

export const sdkPlugin = defineAppV3(platforma, (app) => {
  return {
    progress: () => app.model.outputs.isRunning,
    routes: {
      "/": () => MainPage,
      "/qc": () => QcReportTablePage,
    },
  };
});

export const useApp = sdkPlugin.useApp;
