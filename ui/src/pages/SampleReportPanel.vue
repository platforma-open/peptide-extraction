<script setup lang="ts">
import type { AnyLogHandle } from "@platforma-sdk/model";
import type { SimpleOption } from "@platforma-sdk/ui-vue";
import { PlBtnGroup, PlLogView } from "@platforma-sdk/ui-vue";
import { computed, ref } from "vue";
import { useApp } from "../app";
import { sampleResults } from "../results";
import AaCompositionChart from "../components/AaCompositionChart.vue";
import PipelineFunnelChart from "../components/PipelineFunnelChart.vue";
import QcSection from "../components/QcSection.vue";

const sampleId = defineModel<string | undefined>();

const app = useApp();

// Top-level tabs
type TabId = "visualReport" | "qualityChecks" | "logs";
const tabOptions: SimpleOption<TabId>[] = [
  { value: "visualReport", text: "Visual Report" },
  { value: "qualityChecks", text: "Quality Checks" },
  { value: "logs", text: "Logs" },
];
const currentTab = ref<TabId>("visualReport");

// Log step selector (under Logs tab)
type StepId = "1-parse" | "2-refine" | "4-consensus";
const stepOptions: SimpleOption<StepId>[] = [
  { value: "1-parse", text: "Parse" },
  { value: "2-refine", text: "Refine" },
  { value: "4-consensus", text: "Consensus" },
];
const currentStep = ref<StepId>("1-parse");

const logHandle = computed((): AnyLogHandle | undefined => {
  const logs = app.model.outputs.stepLogs;
  if (!logs || sampleId.value === undefined) return undefined;
  return logs.data.find((p) => p.key[0] === sampleId.value && p.key[1] === currentStep.value)
    ?.value;
});

const currentSample = computed(() => {
  if (sampleId.value === undefined) return undefined;
  return sampleResults.value?.find((s) => s.sampleId === sampleId.value);
});
</script>

<template>
  <PlBtnGroup v-model="currentTab" :options="tabOptions" />

  <template v-if="currentTab === 'visualReport'">
    <PipelineFunnelChart :funnel="currentSample?.pipelineFunnel" />
    <AaCompositionChart :composition="currentSample?.aaComposition" />
  </template>

  <template v-if="currentTab === 'qualityChecks'">
    <div v-if="currentSample?.qcChecks?.length" style="padding-top: 8px">
      <QcSection v-for="check in currentSample.qcChecks" :key="check.checkType" :value="check" />
    </div>
    <div v-else style="padding: 24px; color: var(--color-txt-03); font-size: 14px">
      No quality checks available
    </div>
  </template>

  <template v-if="currentTab === 'logs'">
    <PlBtnGroup v-model="currentStep" :options="stepOptions" />
    <PlLogView v-if="logHandle" :log-handle="logHandle" />
    <div v-else>No log available</div>
  </template>
</template>
