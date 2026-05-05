<script setup lang="ts">
// Compact Peptide Recovery bar for the main sample table.
// Uses the same 5 segments as the detail chart (see ../recoverySegments),
// rendered via PlChartStackedBarCompact.

import type { ICellRendererParams } from "ag-grid-enterprise";
import { PlChartStackedBarCompact } from "@platforma-sdk/ui-vue";
import { computed } from "vue";
import type { FunnelEntry } from "../pipelineFunnel";
import { buildRecoveryChartData } from "../recoverySegments";

const props = defineProps<{
  params: ICellRendererParams<unknown, FunnelEntry[] | undefined> & { isRunning: boolean };
}>();

const settings = computed(() => {
  const data = buildRecoveryChartData(props.params.value ?? undefined);
  if (!data) return undefined;
  return { data };
});
</script>

<template>
  <div class="funnel-cell">
    <PlChartStackedBarCompact v-if="settings" :settings="settings" />
    <div v-else class="funnel-cell-not-ready">
      {{ params.isRunning ? 'Not ready' : 'Not available' }}
    </div>
  </div>
</template>

<!-- AG Grid mounts cell renderers outside Vue's normal rendering pipeline, so
     scoped styles (which rely on data-v-xxx attributes) don't apply. Global styles only. -->
<style>
.funnel-cell {
  height: 100%;
  display: flex;
  flex-direction: row;
  align-items: center;
}

.funnel-cell-not-ready {
  color: var(--color-txt-03);
  font-size: 14px;
  font-weight: 500;
  padding-left: 11px;
}
</style>
