import { platforma } from "@platforma-open/milaboratories.peptide-profiling.model";
import { plRefsEqual } from "@platforma-sdk/model";
import { defineAppV3 } from "@platforma-sdk/ui-vue";
import { computed, watch } from "vue";
import MainPage from "./pages/MainPage.vue";
import QcReportTablePage from "./pages/QcReportTablePage.vue";

export const sdkPlugin = defineAppV3(platforma, (app) => {
  syncSubtitleLabel(app.model);

  return {
    progress: () => app.model.outputs.isRunning,
    routes: {
      "/": () => MainPage,
      "/qc": () => QcReportTablePage,
    },
  };
});

export const useApp = sdkPlugin.useApp;

type AppModel = ReturnType<typeof useApp>["model"];

// The subtitle names the chosen input dataset as the result pool labels it: "" when no input is
// chosen, undefined while the chosen input's option is not loaded yet.
function syncSubtitleLabel(model: AppModel) {
  const subtitleLabel = computed<string | undefined>(() => {
    const input = model.data.input;
    if (!input) return "";
    return model.outputs.inputOptions?.find((p) => plRefsEqual(p.ref, input))?.label;
  });

  watch(
    subtitleLabel,
    (label) => {
      if (label !== undefined && label !== model.data.subtitleLabel) {
        model.data.subtitleLabel = label;
      }
    },
    { immediate: true },
  );
}
