import { ProgressPrefix } from "@platforma-open/milaboratories.peptide-profiling.model";
import { ReactiveFileContent } from "@platforma-sdk/ui-vue";
import { computed } from "vue";
import type { SampleComposition } from "./aaComposition";
import { parseCompositionNdjson } from "./aaComposition";
import { useApp } from "./app";
import type { SampleDistributions } from "./distributions";
import { parseDistributionsNdjson } from "./distributions";
import type { FunnelEntry } from "./pipelineFunnel";
import { parseFunnelNdjson } from "./pipelineFunnel";
import type { QcCheckResult } from "./qcChecks";
import { parseQcChecksNdjson } from "./qcChecks";

const reactiveFileContent = ReactiveFileContent.useGlobal();

export type SampleResult = {
  sampleId: string;
  label: string;
  progress: string;
  aaComposition?: SampleComposition;
  qcChecks?: QcCheckResult[];
  pipelineFunnel?: FunnelEntry[];
  distributions?: SampleDistributions;
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

/** Per-sample distributions (R1/R2 lengths, UMI lengths, reads per contig) */
const distributionsMap = computed<Map<string, SampleDistributions> | undefined>(() => {
  const app = useApp();
  const distBlob = app.model.outputs.distributions;
  const content = distBlob
    ? reactiveFileContent.getContentString(distBlob.handle)?.value
    : undefined;
  return content ? parseDistributionsNdjson(content) : undefined;
});

/** Per-sample pipeline funnel data */
const funnelMap = computed<Map<string, FunnelEntry[]> | undefined>(() => {
  const app = useApp();
  const funnelBlob = app.model.outputs.pipelineFunnel;
  const content = funnelBlob
    ? reactiveFileContent.getContentString(funnelBlob.handle)?.value
    : undefined;
  return content ? parseFunnelNdjson(content) : undefined;
});

export const sampleResults = computed<SampleResult[] | undefined>(() => {
  const app = useApp();

  const sampleLabels = app.model.outputs.sampleLabels;
  const sampleKeys = app.model.outputs.sampleKeys;
  const progress = app.model.outputs.progress;
  const parseProgress = app.model.outputs.parseProgress;

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
  if (parseProgress) {
    for (const p of parseProgress.data) {
      allSampleIds.add(p.key[0] as string);
    }
  }

  if (allSampleIds.size === 0) return undefined;

  // Unify per-step progress entries from both sources:
  //   - parseProgress: flat per-sample (1-parse only), available early (live).
  //   - progress: nested per-sample x step (2-refine..5-tagstat), available
  //     once downstream-pipeline body runs (after parse completes).
  type Entry = { key: [string, string]; value?: { progressLine?: string; live: boolean } };
  const entries: Entry[] = [];
  if (parseProgress) {
    for (const p of parseProgress.data) {
      entries.push({
        key: [p.key[0] as string, "1-parse"],
        value: p.value as Entry["value"],
      });
    }
  }
  if (progress) {
    for (const p of progress.data) {
      entries.push({
        key: [p.key[0] as string, p.key[1] as string],
        value: p.value as Entry["value"],
      });
    }
  }

  // Build progress lookup: sampleId -> latest active step info
  const progressMap = new Map<string, { progressLine?: string; live: boolean; step: string }>();

  for (const p of entries) {
    const sampleId = p.key[0];
    const step = p.key[1];
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

  // Last step that produces a log — when this is done, the pipeline is complete
  const lastLoggedStep = "5-tagstat";

  const results: SampleResult[] = [...allSampleIds]
    .map((sampleId) => {
      const info = progressMap.get(sampleId);
      // A funnel output entry means the downstream subtemplate returned —
      // either via the full mitool chain (steps 2–5) or the empty branch
      // (0 matched reads, only a 1-parse log). Using it as the completion
      // signal covers both without relying on which step logs exist.
      const funnelDone = funnelMap.value?.get(sampleId)?.some((e) => e.step === "output");
      let progressStr = "Queued";

      if (funnelDone) {
        progressStr = "Done";
      } else if (info) {
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
        pipelineFunnel: funnelMap.value?.get(sampleId),
        distributions: distributionsMap.value?.get(sampleId),
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));

  return results;
});
