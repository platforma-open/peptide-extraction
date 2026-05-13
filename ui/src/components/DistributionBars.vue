<script setup lang="ts">
import type { DistBin } from "../distributions";

defineProps<{
  bins: (DistBin & { widthPct: number })[];
}>();
</script>

<template>
  <div class="dist-bars">
    <div v-for="bin in bins" :key="bin.bin" class="dist-row">
      <div class="dist-bin-label">{{ bin.bin }}</div>
      <div class="dist-bar-track">
        <div
          class="dist-bar-fill"
          :style="{ width: bin.widthPct + '%' }"
          :title="`${bin.count.toLocaleString()} (${bin.pct.toFixed(1)}%)`"
        />
      </div>
      <div class="dist-pct">{{ bin.pct.toFixed(1) }}%</div>
    </div>
  </div>
</template>

<style scoped>
.dist-bars {
  display: flex;
  flex-direction: column;
  gap: 3px;
  flex: 1;
  min-width: 0;
}

.dist-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.dist-bin-label {
  font-size: 11px;
  font-family: monospace;
  color: var(--color-txt-02);
  width: 50px;
  text-align: right;
  flex-shrink: 0;
}

.dist-bar-track {
  flex: 1;
  height: 14px;
  background: var(--bg-base-light, #f0f0f0);
  border-radius: 3px;
  overflow: hidden;
}

.dist-bar-fill {
  height: 100%;
  background: #4a90d9;
  border-radius: 3px;
  transition: width 0.2s ease;
  min-width: 1px;
}

.dist-pct {
  font-size: 11px;
  color: var(--color-txt-03);
  width: 45px;
  text-align: right;
  flex-shrink: 0;
}
</style>
