<script setup lang="ts">
// Pipeline funnel chart: waterfall showing cumulative read loss across stages.
// Each bar shows: gray gap (previously lost) + red (lost this step) + blue (kept).

import { computed } from "vue";
import type { FunnelEntry } from "../pipelineFunnel";

const props = defineProps<{
  funnel: FunnelEntry[] | undefined;
}>();

const STEP_LABELS: Record<string, string> = {
  input: "Input reads",
  parse: "Parsing",
  refine: "Refinement",
  umi_dedup: "UMI groups",
  consensus_groups: "Singleton Filtering",
  output: "Final UMI count",
};

type BarData = {
  label: string;
  keptPct: number;
  lostPct: number;
  gapPct: number;
  isUnitChange: boolean;
  reads: string;
  keptTooltip: string;
  lostTooltip: string | undefined;
  lostFormatted: string | undefined;
  reason: string | undefined;
};

const bars = computed((): BarData[] | undefined => {
  if (!props.funnel?.length) return undefined;

  const inputEntry = props.funnel.find((e) => e.step === "input");
  if (!inputEntry) return undefined;
  const baseline = inputEntry.reads;
  if (baseline === 0) return undefined;

  // Track cumulative position from the right edge
  let cumulativeLost = 0;

  return props.funnel.map((entry) => {
    const lost = entry.lost ?? 0;
    const isUnitChange = entry.step === "umi_dedup";
    const gapPct = (cumulativeLost / baseline) * 100;
    const lostPct = (lost / baseline) * 100;
    const keptPct = (entry.reads / baseline) * 100;
    cumulativeLost += lost;

    return {
      label: STEP_LABELS[entry.step] ?? entry.step,
      keptPct,
      lostPct,
      gapPct,
      isUnitChange,
      reads: entry.reads.toLocaleString(),
      keptTooltip: `${entry.reads.toLocaleString()} (${keptPct.toFixed(1)}%)`,
      lostTooltip: lost > 0 ? `${lost.toLocaleString()} (${lostPct.toFixed(1)}%)` : undefined,
      lostFormatted: lost > 0 ? `-${lost.toLocaleString()}` : undefined,
      reason: entry.reason,
    };
  });
});

const assemblyDetail = computed(() => {
  if (!props.funnel?.length) return undefined;
  const output = props.funnel.find((e) => e.step === "output");
  if (!output?.readsInContigs) return undefined;
  return {
    readsInContigs: output.readsInContigs.toLocaleString(),
    readsDiscarded: output.readsDiscarded?.toLocaleString(),
  };
});
</script>

<template>
  <div v-if="bars" class="funnel-chart">
    <div class="funnel-title">Pipeline Read Loss</div>
    <div class="funnel-bars">
      <div v-for="bar in bars" :key="bar.label" class="funnel-row">
        <div class="funnel-label">{{ bar.label }}</div>
        <div class="funnel-bar-row">
          <div class="funnel-bar-track">
            <!-- Blue: kept reads -->
            <div
              class="funnel-bar-kept"
              :style="{ width: bar.keptPct + '%' }"
              :title="bar.keptTooltip"
            />
            <!-- Lost this step: red for actual loss, muted for unit changes -->
            <div
              v-if="bar.lostPct > 0"
              :class="bar.isUnitChange ? 'funnel-bar-unit-change' : 'funnel-bar-lost'"
              :style="{ width: bar.lostPct + '%' }"
              :title="bar.lostTooltip"
            />
            <!-- Gray gap: cumulative previous losses (implicit — rest of track is background) -->
          </div>
          <div class="funnel-bar-count" :title="bar.keptTooltip">{{ bar.reads }}</div>
        </div>
        <div
          v-if="bar.lostFormatted"
          :class="bar.isUnitChange ? 'funnel-unit-change-label' : 'funnel-loss-label'"
        >
          {{ bar.lostFormatted }}
          <span class="funnel-loss-reason">{{ bar.reason }}</span>
        </div>
      </div>
    </div>
    <div v-if="assemblyDetail" class="funnel-assembly-detail">
      Assembly detail: {{ assemblyDetail.readsInContigs }} reads in contigs<template
        v-if="assemblyDetail.readsDiscarded"
        >, {{ assemblyDetail.readsDiscarded }} discarded during assembly</template
      >
    </div>
  </div>
  <div v-else class="funnel-no-data">No pipeline data available</div>
</template>

<style scoped>
.funnel-chart {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 24px;
  max-width: 720px;
}

.funnel-title {
  font-weight: 600;
  font-size: 16px;
  color: var(--color-txt-01);
}

.funnel-bars {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.funnel-row {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.funnel-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--color-txt-02);
}

.funnel-bar-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
}

.funnel-bar-track {
  flex: 1;
  display: flex;
  flex-direction: row;
  height: 24px;
  background: var(--bg-base-light, #f0f0f0);
  border-radius: 4px;
  overflow: hidden;
  min-width: 0;
}

.funnel-bar-kept {
  background: #4a90d9;
  box-sizing: border-box;
  min-width: 0;
  transition: width 0.3s ease;
}

.funnel-bar-count {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-txt-01);
  white-space: nowrap;
  min-width: 56px;
  text-align: right;
  flex-shrink: 0;
}

.funnel-bar-lost {
  background: #e05555;
  opacity: 0.7;
  transition: width 0.3s ease;
}

.funnel-bar-unit-change {
  background: #b0bec5;
  opacity: 0.5;
  transition: width 0.3s ease;
}

.funnel-loss-label {
  font-size: 11px;
  color: #c04040;
}

.funnel-loss-reason {
  color: var(--color-txt-03);
  margin-left: 4px;
}

.funnel-unit-change-label {
  font-size: 11px;
  color: #78909c;
}

.funnel-assembly-detail {
  font-size: 12px;
  color: var(--color-txt-03);
  padding-top: 4px;
  border-top: 1px solid var(--bg-base-light, #eee);
}

.funnel-no-data {
  padding: 24px;
  color: var(--color-txt-03);
  font-size: 14px;
}
</style>
