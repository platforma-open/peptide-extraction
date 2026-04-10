<script setup lang="ts">
import { AgGridVue } from "ag-grid-vue3";
import type { ColDef, GridApi, GridReadyEvent } from "ag-grid-enterprise";
import { ClientSideRowModelModule, ModuleRegistry } from "ag-grid-enterprise";
import type { PlAgHeaderComponentParams } from "@platforma-sdk/ui-vue";
import {
  AgGridTheme,
  PlAgOverlayLoading,
  PlAgOverlayNoRows,
  PlBlockPage,
  PlBtnGhost,
  PlMaskIcon24,
  PlSlideModal,
  autoSizeRowNumberColumn,
  createAgGridColDef,
  makeRowNumberColDef,
} from "@platforma-sdk/ui-vue";
import { computed, reactive, shallowRef, watch } from "vue";
import { useApp } from "../app";
import { parseProgressString } from "../parseProgress";
import type { SampleResult } from "../results";
import { sampleResults } from "../results";
import SettingsPanel from "./SettingsPanel.vue";

const app = useApp();

const data = reactive<{ settingsOpen: boolean }>({
  settingsOpen: app.model.outputs.started === false,
});

// Auto-open/close settings based on block state
watch(
  () => app.model.outputs.started,
  (newVal, oldVal) => {
    if (oldVal === false && newVal === true) {
      data.settingsOpen = false;
      gridApi.value?.showLoadingOverlay();
    }
    if (oldVal === true && newVal === false) {
      data.settingsOpen = true;
    }
  },
);

const loadingOverlayParams = computed(() => {
  if (app.model.outputs.started) {
    return { variant: "running" as const, runningText: "Loading Sample List" };
  }
  return { variant: "not-ready" as const };
});

ModuleRegistry.registerModules([ClientSideRowModelModule]);

const gridApi = shallowRef<GridApi>();
const onGridReady = (params: GridReadyEvent) => {
  gridApi.value = params.api;
  autoSizeRowNumberColumn(params.api);
};

const defaultColumnDef: ColDef = {
  suppressHeaderMenuButton: true,
  lockPinned: true,
  sortable: false,
};

const columnDefs: ColDef<SampleResult>[] = [
  makeRowNumberColDef(),
  createAgGridColDef<SampleResult, string>({
    colId: "label",
    field: "label",
    headerName: "Sample",
    headerComponentParams: { type: "Text" } satisfies PlAgHeaderComponentParams,
    pinned: "left",
    lockPinned: true,
    sortable: true,
  }),
  createAgGridColDef<SampleResult, string>({
    colId: "progress",
    field: "progress",
    headerName: "Progress",
    headerComponentParams: { type: "Progress" } satisfies PlAgHeaderComponentParams,
    flex: 1,
    progress(cellData) {
      const parsed = parseProgressString(cellData);

      if (parsed.stage === "Queued") {
        return {
          status: "not_started",
          text: parsed.stage,
        };
      }

      return {
        status: parsed.stage === "Done" ? "done" : "running",
        percent: parsed.percentage,
        text: parsed.stage,
        suffix: parsed.etaLabel ?? "",
      };
    },
  }),
];

const gridOptions = {
  getRowId: (row: { data: SampleResult }) => row.data.sampleId,
};
</script>

<template>
  <PlBlockPage title="Peptide Extraction">
    <template #append>
      <PlBtnGhost @click.stop="() => (data.settingsOpen = true)">
        Settings
        <template #append>
          <PlMaskIcon24 name="settings" />
        </template>
      </PlBtnGhost>
    </template>
    <div :style="{ flex: 1 }">
      <AgGridVue
        :theme="AgGridTheme"
        :style="{ height: '100%' }"
        :row-data="sampleResults"
        :default-col-def="defaultColumnDef"
        :column-defs="columnDefs"
        :grid-options="gridOptions"
        :loading-overlay-component-params="loadingOverlayParams"
        :loading-overlay-component="PlAgOverlayLoading"
        :no-rows-overlay-component="PlAgOverlayNoRows"
        @grid-ready="onGridReady"
      />
    </div>
  </PlBlockPage>
  <PlSlideModal
    v-model="data.settingsOpen"
    :shadow="true"
    :close-on-outside-click="app.model.outputs.started"
  >
    <template #title>Settings</template>
    <SettingsPanel />
  </PlSlideModal>
</template>
