<script setup lang="ts">
// Detailed per-sample AA composition bar chart for the Visual Report tab.
// Each of the 20 amino acids gets a vertical bar: height = percentage, color = viridis scale.

import { Gradient } from "@platforma-sdk/ui-vue";
import { computed } from "vue";
import type { SampleComposition } from "../aaComposition";
import { AMINO_ACIDS } from "../aaComposition";

const props = defineProps<{
  composition: SampleComposition | undefined;
}>();

const gradient = Gradient("viridis");

// One bar per amino acid, normalized to the max percentage in this sample
const bars = computed(() => {
  const comp = props.composition;
  if (!comp) return undefined;

  const values = AMINO_ACIDS.map((aa) => ({ aa, value: comp[aa] ?? 0 }));
  const maxVal = Math.max(...values.map((v) => v.value), 0.01);

  return values.map(({ aa, value }) => ({
    aa,
    value,
    heightPct: (value / maxVal) * 100,
    color: gradient.fromInterval(value / maxVal).hex,
    label: value.toFixed(1),
  }));
});

// Viridis color legend: 6 evenly spaced stops from 0% to maxVal%
const scaleStops = computed(() => {
  if (!bars.value) return [];
  const maxVal = Math.max(...bars.value.map((b) => b.value), 0.01);
  const steps = 5;
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps;
    return {
      value: (t * maxVal).toFixed(1),
      color: gradient.fromInterval(t).hex,
    };
  });
});
</script>

<template>
  <div v-if="bars" class="composition-chart">
    <div class="chart-title">Amino Acid Composition (%)</div>

    <!-- Bar chart: one column per amino acid -->
    <div class="chart-area">
      <div v-for="bar in bars" :key="bar.aa" class="bar-group">
        <div class="bar-value">{{ bar.label }}</div>
        <div class="bar-track">
          <div
            class="bar-fill"
            :style="{ height: bar.heightPct + '%', backgroundColor: bar.color }"
          />
        </div>
        <div class="bar-label">{{ bar.aa }}</div>
      </div>
    </div>

    <!-- Viridis color scale legend -->
    <div class="scale-bar">
      <div class="scale-gradient">
        <div
          v-for="(stop, i) in scaleStops"
          :key="i"
          class="scale-stop"
          :style="{ backgroundColor: stop.color }"
        />
      </div>
      <div class="scale-labels">
        <span>{{ scaleStops[0]?.value }}%</span>
        <span>{{ scaleStops[scaleStops.length - 1]?.value }}%</span>
      </div>
    </div>
  </div>
  <div v-else class="no-data">No composition data available</div>
</template>

<style scoped>
.composition-chart {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 24px;
  max-width: 720px;
}

.chart-title {
  font-weight: 600;
  font-size: 16px;
  color: var(--color-txt-01);
}

.chart-area {
  display: flex;
  flex-direction: row;
  align-items: flex-end;
  gap: 4px;
  height: 200px;
}

.bar-group {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  height: 100%;
}

.bar-value {
  font-size: 10px;
  color: var(--color-txt-03);
  min-height: 14px;
}

.bar-track {
  flex: 1;
  width: 100%;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
}

.bar-fill {
  width: 100%;
  border-radius: 2px 2px 0 0;
  min-height: 2px;
  transition: height 0.2s ease;
}

.bar-label {
  font-size: 12px;
  font-weight: 600;
  font-family: var(--font-mono, monospace);
  color: var(--color-txt-02);
}

.scale-bar {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 200px;
}

.scale-gradient {
  display: flex;
  flex-direction: row;
  height: 12px;
  border-radius: 4px;
  overflow: hidden;
}

.scale-stop {
  flex: 1;
}

.scale-labels {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: var(--color-txt-03);
}

.no-data {
  padding: 24px;
  color: var(--color-txt-03);
  font-size: 14px;
}
</style>
