import { ProgressPrefix } from "@platforma-open/milaboratories.peptide-extraction.model";
import { computed } from "vue";
import { useApp } from "./app";

export type SampleResult = {
  sampleId: string;
  label: string;
  progress: string;
};

export const sampleResults = computed<SampleResult[] | undefined>(() => {
  const app = useApp();

  const sampleLabels = app.model.outputs.sampleLabels;
  const progress = app.model.outputs.progress;

  // Use progress output as the source of sample IDs — it only contains
  // samples from the selected dataset (scoped by the workflow's processColumn).
  if (progress === undefined) return undefined;

  const results: SampleResult[] = progress.data
    .map((p) => {
      const sampleId = p.key[0] as string;
      const info = p.value;
      let progressStr = "Queued";
      if (info) {
        if (!info.live) {
          progressStr = "Done";
        } else if (info.progressLine) {
          progressStr = info.progressLine.replace(ProgressPrefix, "");
        }
      }
      return {
        sampleId,
        label: sampleLabels?.[sampleId] ?? sampleId,
        progress: progressStr,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));

  return results;
});
