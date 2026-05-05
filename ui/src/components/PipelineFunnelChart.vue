<script setup lang="ts">
// Peptide Recovery chart: single horizontal stacked bar showing where every
// input read ended up. Styled like the Alignments chart in mixcr-clonotyping.
//
// Segment math, labels, colors, and tooltip descriptions live in
// ../recoverySegments so the compact cell and this detail chart stay in sync.

import { PlChartStackedBar } from "@platforma-sdk/ui-vue";
import { computed } from "vue";
import type { FunnelEntry } from "../pipelineFunnel";
import { buildRecoveryChartData } from "../recoverySegments";

const props = defineProps<{
  funnel: FunnelEntry[] | undefined;
}>();

const settings = computed(() => {
  const data = buildRecoveryChartData(props.funnel);
  if (!data) return undefined;
  return { data };
});
</script>

<template>
  <div class="funnel-chart">
    <div class="chart-title">Peptide Recovery</div>
    <PlChartStackedBar v-if="settings" :settings="settings" />
    <div v-else class="funnel-no-data">No pipeline data available</div>
  </div>
</template>

<style scoped>
.funnel-chart {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 12px 0;
}

.chart-title {
  color: var(--color-txt-01);
  font-size: 20px;
  font-weight: 500;
  line-height: 24px;
}

.funnel-no-data {
  padding: 24px;
  color: var(--color-txt-03);
  font-size: 14px;
}
</style>
