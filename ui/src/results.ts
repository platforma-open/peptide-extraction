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

  if (progress === undefined) return undefined;

  // Progress data has 2-level keys: [sampleId, stepName].
  // Group by sampleId and find the active step (live=true with latest progress).
  const sampleMap = new Map<string, { progressLine?: string; live: boolean; step: string }>();

  for (const p of progress.data) {
    const sampleId = p.key[0] as string;
    const step = p.key[1] as string;
    const info = p.value;
    if (!info) continue;

    const current = sampleMap.get(sampleId);
    // Pick the latest active step: prefer live steps, then latest step by name
    if (
      !current ||
      (info.live && !current.live) ||
      (!current.live && step > current.step) ||
      (info.live && step > current.step)
    ) {
      sampleMap.set(sampleId, {
        progressLine: info.progressLine,
        live: info.live,
        step,
      });
    }
  }

  // If no entries in the map, extract sample IDs from all progress keys
  if (sampleMap.size === 0) {
    const seenSamples = new Set<string>();
    for (const p of progress.data) {
      seenSamples.add(p.key[0] as string);
    }
    for (const sampleId of seenSamples) {
      sampleMap.set(sampleId, { live: true, step: "", progressLine: undefined });
    }
  }

  const results: SampleResult[] = [...sampleMap.entries()]
    .map(([sampleId, info]) => {
      let progressStr = "Queued";
      if (info.progressLine !== undefined || !info.live) {
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
