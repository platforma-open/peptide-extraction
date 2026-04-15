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
  const sampleKeys = app.model.outputs.sampleKeys;
  const progress = app.model.outputs.progress;

  // sampleKeys resolves early (once inputs are locked) — provides the full
  // sample list before per-sample processing starts. Fall back to progress keys.
  const allSampleIds = new Set<string>();
  if (sampleKeys) {
    for (const entry of sampleKeys.data) {
      allSampleIds.add(entry.key[0] as string);
    }
  }
  if (progress) {
    for (const p of progress.data) {
      allSampleIds.add(p.key[0] as string);
    }
  }

  if (allSampleIds.size === 0) return undefined;

  // Build progress lookup: sampleId -> latest active step info
  const progressMap = new Map<string, { progressLine?: string; live: boolean; step: string }>();

  if (progress) {
    for (const p of progress.data) {
      const sampleId = p.key[0] as string;
      const step = p.key[1] as string;
      const info = p.value;
      if (!info) continue;

      const current = progressMap.get(sampleId);
      if (
        !current ||
        (info.live && !current.live) ||
        (!current.live && step > current.step) ||
        (info.live && step > current.step)
      ) {
        progressMap.set(sampleId, {
          progressLine: info.progressLine,
          live: info.live,
          step,
        });
      }
    }
  }

  // Last step that produces a log — when this is done, the pipeline is complete
  const lastLoggedStep = "5-tagstat";

  const results: SampleResult[] = [...allSampleIds]
    .map((sampleId) => {
      const info = progressMap.get(sampleId);
      let progressStr = "Queued";

      if (info) {
        const stepNum = info.step ? info.step.split("-")[0] : "";
        const stepName = info.step ? info.step.split("-").slice(1).join("-") : "";

        if (info.progressLine !== undefined || !info.live) {
          if (!info.live) {
            progressStr =
              info.step >= lastLoggedStep ? "Done" : `[${stepNum}/6] ${stepName} complete`;
          } else if (info.progressLine) {
            progressStr = info.progressLine.replace(ProgressPrefix, "");
          }
        }
        if (
          stepNum &&
          progressStr !== "Done" &&
          progressStr !== "Queued" &&
          !progressStr.startsWith("[")
        ) {
          progressStr = `[${stepNum}/6] ${progressStr}`;
        }
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
