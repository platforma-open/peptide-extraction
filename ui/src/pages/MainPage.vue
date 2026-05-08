<script setup lang="ts">
import { plRefsEqual } from "@platforma-sdk/model";
import type { PlAgHeaderComponentParams } from "@platforma-sdk/ui-vue";
import {
  AgGridTheme,
  PlAgCellStatusTag,
  PlAgOverlayLoading,
  PlAgOverlayNoRows,
  PlAgTextAndButtonCell,
  PlBlockPage,
  PlBtnGhost,
  PlMaskIcon24,
  PlSlideModal,
  autoSizeRowNumberColumn,
  createAgGridColDef,
  makeRowNumberColDef,
} from "@platforma-sdk/ui-vue";
import type { ColDef, GridApi, GridReadyEvent } from "ag-grid-enterprise";
import { ClientSideRowModelModule, ModuleRegistry } from "ag-grid-enterprise";
import { AgGridVue } from "ag-grid-vue3";
import { computed, reactive, shallowRef, watch, watchEffect } from "vue";
import { useApp } from "../app";
import PipelineFunnelCell from "../components/PipelineFunnelCell.vue";
import SeqLogoCell from "../components/SeqLogoCell.vue";
import { parseProgressString } from "../parseProgress";
import type { FunnelEntry } from "../pipelineFunnel";
import type { QcStatus } from "../qcChecks";
import { worstStatus } from "../qcChecks";
import type { SampleResult } from "../results";
import { sampleResults } from "../results";
import SampleReportPanel from "./SampleReportPanel.vue";
import SettingsPanel from "./SettingsPanel.vue";

const app = useApp();

watchEffect(() => {
  const inputOption = app.model.outputs.inputOptions?.find(
    (p) => app.model.data.input && plRefsEqual(p.ref, app.model.data.input),
  );
  app.model.data.defaultBlockLabel = inputOption?.label ?? "";
});

// Mirror the input's pairedness from the model output into BlockData
watchEffect(() => {
  app.model.data.inputIsPairedEnd = app.model.outputs.inputIsPairedEnd;
});

const data = reactive<{
  activePanel: "settings" | "report" | null;
  selectedSample: string | undefined;
}>({
  activePanel: app.model.outputs.started === false ? "settings" : null,
  selectedSample: undefined,
});

const settingsOpen = computed({
  get: () => data.activePanel === "settings",
  set: (val: boolean) => {
    data.activePanel = val ? "settings" : null;
  },
});

const sampleReportOpen = computed({
  get: () => data.activePanel === "report",
  set: (val: boolean) => {
    data.activePanel = val ? "report" : null;
  },
});

// Auto-open/close settings based on block state
watch(
  () => app.model.outputs.started,
  (newVal, oldVal) => {
    if (oldVal === false && newVal === true) {
      data.activePanel = null;
    }
    if (oldVal === true && newVal === false) {
      data.activePanel = "settings";
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

const isRunning = computed(() => app.model.outputs.isRunning ?? false);
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
    cellRenderer: PlAgTextAndButtonCell,
    cellRendererParams: {
      invokeRowsOnDoubleClick: true,
    },
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

      const percentText = parsed.percentage
        ? `${parsed.stage}: ${parsed.percentage}%`
        : parsed.stage;
      return {
        status: parsed.stage === "Done" ? "done" : "running",
        percent: parsed.percentage,
        text: percentText,
        suffix: parsed.etaLabel ?? "",
      };
    },
  }),
  createAgGridColDef<SampleResult, QcStatus | undefined>({
    colId: "quality",
    headerName: "Quality",
    headerComponentParams: { type: "Text" } satisfies PlAgHeaderComponentParams,
    width: 126,
    cellRendererSelector: (cellData) => {
      const checks = cellData.data?.qcChecks;
      const status = checks?.length ? worstStatus(checks) : undefined;
      return {
        component: PlAgCellStatusTag,
        params: { type: status },
      };
    },
  }),
  createAgGridColDef<SampleResult, FunnelEntry[] | undefined>({
    colId: "pipelineFunnel",
    headerName: "Peptide Recovery",
    headerComponentParams: { type: "Text" } satisfies PlAgHeaderComponentParams,
    flex: 1,
    cellStyle: {
      "--ag-cell-horizontal-padding": "4px",
    },
    cellRendererSelector: (cellData) => ({
      component: PipelineFunnelCell,
      params: { value: cellData.data?.pipelineFunnel, isRunning },
    }),
  }),
  createAgGridColDef<SampleResult, string[] | undefined>({
    colId: "seqLogo",
    headerName: "Seq Logo",
    headerComponentParams: { type: "Text" } satisfies PlAgHeaderComponentParams,
    flex: 1,
    cellStyle: {
      "--ag-cell-horizontal-padding": "4px",
    },
    cellRendererSelector: (cellData) => ({
      component: SeqLogoCell,
      params: {
        value:
          cellData.data?.dominantLength !== undefined
            ? cellData.data?.seqLogoByLength?.get(cellData.data.dominantLength)
            : undefined,
        isRunning,
      },
    }),
  }),
];

const gridOptions = {
  getRowId: (row: { data: SampleResult }) => row.data.sampleId,
  onRowDoubleClicked: (e: { data?: SampleResult }) => {
    data.selectedSample = e.data?.sampleId;
    if (data.selectedSample !== undefined) data.activePanel = "report";
  },
};
</script>

<template>
  <PlBlockPage title="Peptide Profiling">
    <template #append>
      <PlBtnGhost @click.stop="() => (data.activePanel = 'settings')">
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
    v-model="settingsOpen"
    :shadow="true"
    :close-on-outside-click="app.model.outputs.started"
    width="40%"
  >
    <template #title>Settings</template>
    <SettingsPanel />
  </PlSlideModal>
  <PlSlideModal
    v-model="sampleReportOpen"
    :close-on-outside-click="app.model.outputs.started"
    width="80%"
  >
    <template #title>
      {{
        (data.selectedSample ? app.model.outputs.sampleLabels?.[data.selectedSample] : undefined) ??
        "..."
      }}
    </template>
    <SampleReportPanel v-model="data.selectedSample" />
  </PlSlideModal>
</template>
