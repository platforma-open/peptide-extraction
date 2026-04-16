<script setup lang="ts">
// Compact pipeline funnel for the main table.
// Horizontal stacked bar showing proportion kept (blue) vs lost (red) reads at whole pipeline.

import type { ICellRendererParams } from "ag-grid-enterprise";
import { computed } from "vue";
import type { FunnelEntry } from "../pipelineFunnel";

const props = defineProps<{
  params: ICellRendererParams<unknown, FunnelEntry[] | undefined>;
}>();

const segments = computed(() => {
  const funnel = props.params.value;
  if (!funnel?.length) return undefined;

  // Simple read-level view: blue = reads used in output, red = reads lost
  const input = funnel.find((e) => e.step === "input");
  const output = funnel.find((e) => e.step === "output");
  if (!input || !output) return undefined;

  const total = input.reads;
  if (total === 0) return undefined;

  const kept = output.readsInContigs ?? output.reads;
  const lost = total - kept;

  return [
    {
      widthPct: (kept / total) * 100,
      color: "#4a90d9",
      tooltip: `Reads in contigs: ${kept.toLocaleString()} (${((kept / total) * 100).toFixed(1)}%)`,
    },
    {
      widthPct: (lost / total) * 100,
      color: "#e05555",
      tooltip: `Reads lost: ${lost.toLocaleString()} (${((lost / total) * 100).toFixed(1)}%)`,
    },
  ];
});
</script>

<template>
  <div class="funnel-cell">
    <div v-if="segments" class="funnel-cell-bar">
      <div
        v-for="(seg, i) in segments"
        :key="i"
        class="funnel-cell-segment"
        :style="{ width: seg.widthPct + '%', backgroundColor: seg.color }"
        :title="seg.tooltip"
      />
    </div>
    <div v-else class="funnel-cell-not-ready">Not ready</div>
  </div>
</template>

<style>
.funnel-cell {
  height: 100%;
  display: flex;
  flex-direction: row;
  align-items: center;
}

.funnel-cell-bar {
  width: 100%;
  height: 16px;
  display: flex;
  flex-direction: row;
  border-radius: 3px;
  overflow: hidden;
}

.funnel-cell-segment {
  min-width: 0;
  height: 100%;
}

.funnel-cell-not-ready {
  color: var(--color-txt-03);
  font-size: 12px;
}
</style>
