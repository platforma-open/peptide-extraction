<script setup lang="ts">
import {
  PlAccordionSection,
  PlCheckbox,
  PlDropdownRef,
  PlNumberField,
  PlSectionSeparator,
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

// Consensus-related settings only apply when the pattern carries a UMI.
// patternParts is kept in sync by PatternEditor for all pattern sources.
const hasUmi = computed(() => {
  const parts = app.model.data.patternParts;
  if (!parts) return false;
  return parts.r1?.umi !== undefined || parts.r2?.umi !== undefined;
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

  <PlSectionSeparator>Tag pattern</PlSectionSeparator>
  <PatternEditor />

  <PlAccordionSection label="Advanced settings">
    <div v-if="hasUmi" style="display: flex; gap: 12px">
      <PlNumberField
        v-model="app.model.data.minReadsPerConsensus"
        label="Min reads per UMI group"
        :min-value="1"
      >
        <template #tooltip>
          Minimum reads sharing a UMI. Required to accept it as a valid molecule. Higher values
          correct more sequencing errors but discard rare molecules — use <code>1</code> for very
          diverse libraries or low sequencing depth.<br /><br />
          Rejected reads appear as <em>Insufficient UMI coverage</em> in the Peptide Recovery plot.
        </template>
      </PlNumberField>

      <PlNumberField v-model="app.model.data.maxIndels" label="Max UMI indels" :min-value="0">
        <template #tooltip>
          Insertions/deletions tolerated when merging UMIs that likely come from the same molecule.
          Higher values recover more error-containing barcodes but may collapse genuinely different
          molecules.
        </template>
      </PlNumberField>
    </div>

    <PlNumberField
      v-model="app.model.data.errorBudget"
      label="Mismatch tolerance in anchors"
      :min-value="0"
    >
      <template #tooltip>
        Mismatches and indels allowed when matching the anchor sequences. Higher values recover more
        reads from noisy data at the cost of spurious matches.<br /><br />
        Known as <code>error budget</code> in mitool/MiXCR.
      </template>
    </PlNumberField>

    <div style="display: flex; align-items: center; gap: 4px">
      <PlCheckbox
        :model-value="app.model.data.useWildcards ?? true"
        @update:model-value="(v) => (app.model.data.useWildcards = v)"
      >
        Mask homopolymers in anchors
      </PlCheckbox>
      <PlTooltip class="info">
        <template #tooltip>
          Detect runs of 5+ identical bases in constant region anchors and replace them with
          <code>n</code> wildcards. Homopolymers waste error budget because sequencers struggle to
          resolve exact repeat lengths.
        </template>
      </PlTooltip>
    </div>

    <div style="display: flex; align-items: center; gap: 4px">
      <PlCheckbox
        :model-value="app.model.data.filterInvalidPeptides ?? true"
        @update:model-value="(v) => (app.model.data.filterInvalidPeptides = v)"
      >
        Drop peptides with early stop or trailing nucleotides
      </PlCheckbox>
      <PlTooltip class="info">
        <template #tooltip>
          Remove peptides whose nucleotide sequence contains an internal stop codon or whose length
          is not a multiple of three.
        </template>
      </PlTooltip>
    </div>

    <!-- @TODO: Uncomment this when we have a way to test the R1-only assembly fallback -->
    <!-- <PlCheckbox v-model="autoR1OnlyAssembly">
      Auto R1-only assembly
      <PlTooltip class="info" position="top">
        <template #tooltip>
          Automatically fall back to R1-only consensus assembly when R2 truncation is detected
          (assembly discard rate above 10%).
        </template>
      </PlTooltip>
    </PlCheckbox> -->

    <PlSectionSeparator>Resource Allocation</PlSectionSeparator>
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
