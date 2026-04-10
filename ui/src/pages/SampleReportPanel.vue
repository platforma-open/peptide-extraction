<script setup lang="ts">
import type { AnyLogHandle } from "@platforma-sdk/model";
import type { SimpleOption } from "@platforma-sdk/ui-vue";
import { PlBtnGroup, PlLogView } from "@platforma-sdk/ui-vue";
import { computed, ref } from "vue";
import { useApp } from "../app";

const sampleId = defineModel<string | undefined>();

const app = useApp();

type StepId = "1-parse" | "2-refine" | "3-sort" | "4-consensus" | "5-tagstat";

const stepOptions: SimpleOption<StepId>[] = [
  { value: "1-parse", text: "Parse" },
  { value: "2-refine", text: "Refine" },
  { value: "3-sort", text: "Sort" },
  { value: "4-consensus", text: "Consensus" },
  { value: "5-tagstat", text: "Tag-stat" },
];

const currentStep = ref<StepId>("1-parse");

const logHandle = computed((): AnyLogHandle | undefined => {
  const logs = app.model.outputs.stepLogs;
  if (!logs || sampleId.value === undefined) return undefined;
  return logs.data.find((p) => p.key[0] === sampleId.value && p.key[1] === currentStep.value)
    ?.value;
});
</script>

<template>
  <PlBtnGroup v-model="currentStep" :options="stepOptions" />
  <PlLogView v-if="logHandle" :log-handle="logHandle" />
  <div v-else>No log available</div>
</template>
