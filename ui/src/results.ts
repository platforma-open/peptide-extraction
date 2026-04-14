import { ProgressPrefix } from "@platforma-open/milaboratories.peptide-extraction.model";
import { ReactiveFileContent } from "@platforma-sdk/ui-vue";
import { computed } from "vue";
import type { SampleComposition } from "./aaComposition";
import { parseCompositionNdjson } from "./aaComposition";
import { useApp } from "./app";
import type { QcCheckResult } from "./qcChecks";
import { parseQcChecksNdjson } from "./qcChecks";

const reactiveFileContent = ReactiveFileContent.useGlobal();

export type SampleResult = {
  sampleId: string;
  label: string;
  progress: string;
  aaComposition?: SampleComposition;
  qcChecks?: QcCheckResult[];
};

/** Per-sample AA composition, parsed once and cached until the file changes */
const compositionMap = computed<Map<string, SampleComposition> | undefined>(() => {
  const app = useApp();
  const compositionBlob = app.model.outputs.aaComposition;
  const content = compositionBlob
    ? reactiveFileContent.getContentString(compositionBlob.handle)?.value
    : undefined;
  return content ? parseCompositionNdjson(content) : undefined;
});

/** Per-sample QC checks, parsed once and cached until the file changes */
const qcChecksMap = computed<Map<string, QcCheckResult[]> | undefined>(() => {
  const app = useApp();
  const qcBlob = app.model.outputs.qcChecks;
  const content = qcBlob ? reactiveFileContent.getContentString(qcBlob.handle)?.value : undefined;
  return content ? parseQcChecksNdjson(content) : undefined;
});

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
      // Prepend step indicator to progress text (e.g. "[2/6] Correcting UMI: 60%")
      const stepNum = info.step ? info.step.split("-")[0] : "";
      if (stepNum && progressStr !== "Done" && progressStr !== "Queued") {
        progressStr = `[${stepNum}/6] ${progressStr}`;
      }

      return {
        sampleId,
        label: sampleLabels?.[sampleId] ?? sampleId,
        progress: progressStr,
        aaComposition: compositionMap.value?.get(sampleId),
        qcChecks: qcChecksMap.value?.get(sampleId),
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));

  return results;
});
