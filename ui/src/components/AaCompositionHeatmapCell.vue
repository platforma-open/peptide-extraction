<script setup lang="ts">
// Compact AA composition heatmap for the main sample table.
// Renders 20 equal-width colored blocks (one per amino acid) in a horizontal strip.
// Color intensity (viridis) encodes the percentage, normalized per sample.

import type { ICellRendererParams } from "ag-grid-enterprise";
import { Gradient } from "@platforma-sdk/ui-vue";
import { computed } from "vue";
import type { SampleComposition } from "../aaComposition";
import { AMINO_ACIDS } from "../aaComposition";

const props = defineProps<{
  params: ICellRendererParams<unknown, SampleComposition | undefined>;
}>();

const gradient = Gradient("viridis");

// Map each amino acid to a viridis color based on its percentage relative to the sample max
const cells = computed(() => {
  const comp = props.params.value;
  if (!comp) return undefined;

  const values = AMINO_ACIDS.map((aa) => ({ aa, value: comp[aa] ?? 0 }));
  const maxVal = Math.max(...values.map((v) => v.value), 0.01);

  return values.map(({ aa, value }) => ({
    aa,
    color: gradient.fromInterval(value / maxVal).hex,
    tooltip: `${aa}: ${value.toFixed(1)}%`,
  }));
});
</script>

<template>
  <div class="aa-heatmap-cell">
    <div v-if="cells" class="aa-heatmap-row">
      <div
        v-for="cell in cells"
        :key="cell.aa"
        class="aa-heatmap-block"
        :style="{ backgroundColor: cell.color }"
        :title="cell.tooltip"
      />
    </div>
    <div v-else class="aa-heatmap-not-ready">Not ready</div>
  </div>
</template>

<style>
.aa-heatmap-cell {
  height: 100%;
  display: flex;
  flex-direction: row;
  align-items: center;
}

.aa-heatmap-row {
  width: 100%;
  height: 24px;
  display: flex;
  flex-direction: row;
  border-radius: 3px;
  overflow: hidden;
}

.aa-heatmap-block {
  flex: 1;
  min-width: 0;
  height: 100%;
}

.aa-heatmap-not-ready {
  color: var(--color-txt-03);
  font-size: 12px;
}
</style>
