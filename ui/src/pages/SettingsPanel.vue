<script setup lang="ts">
import {
  PlAccordionSection,
  PlCheckbox,
  PlDropdownRef,
  PlNumberField,
  PlTooltip,
} from "@platforma-sdk/ui-vue";
import { computed } from "vue";
import { useApp } from "../app";
import PatternEditor from "../components/PatternEditor.vue";

const app = useApp();

const inputOptions = computed(() => app.model.outputs.inputOptions);

const autoR1OnlyAssembly = computed({
  get: () => app.model.data.autoR1OnlyAssembly ?? true,
  set: (value: boolean) => {
    app.model.data.autoR1OnlyAssembly = value;
  },
});
</script>

<template>
  <PlDropdownRef
    :options="inputOptions"
    :model-value="app.model.data.input"
    label="Select dataset"
    clearable
    @update:model-value="(v) => (app.model.data.input = v)"
  />

  <PatternEditor />

  <PlAccordionSection label="Advanced settings">
    <PlNumberField
      v-model="app.model.data.minReadsPerConsensus"
      label="Min reads per consensus"
      :min-value="1"
    >
      <template #tooltip>
        Minimum reads per UMI group for consensus building. Set to 1 for high-diversity or low-depth
        libraries.
      </template>
    </PlNumberField>

    <PlNumberField v-model="app.model.data.errorBudget" label="Error budget" :min-value="0">
      <template #tooltip> Maximum mismatches and indels allowed during pattern matching. </template>
    </PlNumberField>

    <PlNumberField
      v-model="app.model.data.maxIndels"
      label="Max indels (UMI refinement)"
      :min-value="0"
    >
      <template #tooltip> Maximum indels allowed during UMI refine-tags step. </template>
    </PlNumberField>

    <PlCheckbox v-model="autoR1OnlyAssembly">
      Auto R1-only assembly
      <PlTooltip class="info" position="top">
        <template #tooltip>
          Automatically fall back to R1-only consensus assembly when R2 truncation is detected
          (assembly discard rate above 10%).
        </template>
      </PlTooltip>
    </PlCheckbox>

    <PlNumberField
      v-model="app.model.data.perProcessMemGB"
      label="Memory per sample process (GB)"
      :min-value="1"
      :clearable="true"
    >
      <template #tooltip>
        Override memory allocation per sample. Leave empty for automatic sizing.
      </template>
    </PlNumberField>

    <PlNumberField
      v-model="app.model.data.perProcessCPUs"
      label="CPUs per sample process"
      :min-value="1"
      :clearable="true"
    >
      <template #tooltip>
        Override CPU allocation per sample. Leave empty for automatic sizing.
      </template>
    </PlNumberField>
  </PlAccordionSection>
</template>
