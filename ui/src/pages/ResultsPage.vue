<script setup lang="ts">
import { PlAgDataTableV2, PlBlockPage, usePlDataTableSettingsV2 } from "@platforma-sdk/ui-vue";
import { useApp } from "../app";

const app = useApp();

const peptideTableSettings = usePlDataTableSettingsV2({
  model: () => app.model.outputs.peptideTable,
});
</script>

<template>
  <PlBlockPage title="Results">
    <PlAgDataTableV2
      v-model="app.model.data.tableState"
      :settings="peptideTableSettings"
      show-columns-panel
      show-export-button
      :loading-text="app.model.outputs.started ? 'Running' : undefined"
      not-ready-text="Run the analysis to see results"
    />
  </PlBlockPage>
</template>
