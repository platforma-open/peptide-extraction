<script setup lang="ts">
import {
  PlAccordionSection,
  PlCheckbox,
  PlDropdownRef,
  PlNumberField,
  PlTextField,
  PlTooltip,
} from "@platforma-sdk/ui-vue";
import { computed } from "vue";
import { useApp } from "../app";

const app = useApp();

const inputOptions = computed(() => app.model.outputs.inputOptions);

const autoR1OnlyAssembly = computed({
  get: () => app.model.args.autoR1OnlyAssembly ?? true,
  set: (value: boolean) => {
    app.model.args.autoR1OnlyAssembly = value;
  },
});
</script>

<template>
  <PlDropdownRef
    :options="inputOptions"
    :model-value="app.model.args.input"
    label="Select dataset"
    clearable
    @update:model-value="(v) => (app.model.args.input = v)"
  />

  <PlTextField
    v-model="app.model.args.pattern"
    label="mitool parse pattern"
    :clearable="() => undefined"
  >
    <template #tooltip> Full mitool parse pattern including R1 and R2, separated by \ </template>
  </PlTextField>

  <PlAccordionSection label="Advanced settings">
    <PlNumberField
      v-model="app.model.args.minReadsPerConsensus"
      label="Min reads per consensus"
      :min-value="1"
    >
      <template #tooltip>
        Minimum reads per UMI group for consensus building. Set to 1 for high-diversity or low-depth
        libraries.
      </template>
    </PlNumberField>

    <PlNumberField v-model="app.model.args.errorBudget" label="Error budget" :min-value="0">
      <template #tooltip> Maximum mismatches and indels allowed during pattern matching. </template>
    </PlNumberField>

    <PlNumberField
      v-model="app.model.args.maxIndels"
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
      v-model="app.model.args.perProcessMemGB"
      label="Memory per sample process (GB)"
      :min-value="1"
      :clearable="true"
    >
      <template #tooltip>
        Override memory allocation per sample. Leave empty for automatic sizing.
      </template>
    </PlNumberField>

    <PlNumberField
      v-model="app.model.args.perProcessCPUs"
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
