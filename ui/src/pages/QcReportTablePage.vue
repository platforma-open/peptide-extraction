<script setup lang="ts">
import { PlAgDataTableV2, PlBlockPage, usePlDataTableSettingsV2 } from "@platforma-sdk/ui-vue";
import { useApp } from "../app";

const app = useApp();

const qcTableSettings = usePlDataTableSettingsV2({
  model: () => app.model.outputs.qcReportTable,
});
</script>

<template>
  <PlBlockPage title="QC Report Table">
    <PlAgDataTableV2
      v-model="app.model.data.qcTableState"
      :settings="qcTableSettings"
      show-columns-panel
      :loading-text="app.model.outputs.started ? 'Running' : undefined"
      not-ready-text="Run the analysis to see QC results"
    />
  </PlBlockPage>
</template>
