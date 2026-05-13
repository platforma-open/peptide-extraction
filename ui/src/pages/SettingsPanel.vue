<script setup lang="ts">
import type {
  StopCodonReplacements,
  StopCodonType,
} from "@platforma-open/milaboratories.peptide-profiling.model";
import { getPreset } from "@platforma-open/milaboratories.peptide-profiling.model";
import type { ListOption } from "@platforma-sdk/ui-vue";
import {
  PlAccordionSection,
  PlCheckbox,
  PlDropdown,
  PlDropdownMulti,
  PlDropdownRef,
  PlNumberField,
  PlSectionSeparator,
  PlTooltip,
} from "@platforma-sdk/ui-vue";
import { computed, watch } from "vue";
import { useApp } from "../app";
import PatternEditor from "../components/PatternEditor.vue";

const app = useApp();

// ── Stop codon replacement options ──────────────────────────────────────────

const stopCodonOptions: ListOption<StopCodonType>[] = [
  { label: "Amber (TAG)", value: "amber" },
  { label: "Ochre (TAA)", value: "ochre" },
  { label: "Opal/Umber (TGA)", value: "opal" },
];

const aminoAcidOptions: ListOption<string>[] = [
  { label: "A (Ala)", value: "A" },
  { label: "C (Cys)", value: "C" },
  { label: "D (Asp)", value: "D" },
  { label: "E (Glu)", value: "E" },
  { label: "F (Phe)", value: "F" },
  { label: "G (Gly)", value: "G" },
  { label: "H (His)", value: "H" },
  { label: "I (Ile)", value: "I" },
  { label: "K (Lys)", value: "K" },
  { label: "L (Leu)", value: "L" },
  { label: "M (Met)", value: "M" },
  { label: "N (Asn)", value: "N" },
  { label: "P (Pro)", value: "P" },
  { label: "Q (Gln)", value: "Q" },
  { label: "R (Arg)", value: "R" },
  { label: "S (Ser)", value: "S" },
  { label: "T (Thr)", value: "T" },
  { label: "V (Val)", value: "V" },
  { label: "W (Trp)", value: "W" },
  { label: "Y (Tyr)", value: "Y" },
];

const stopCodonSelection = computed<StopCodonType[]>({
  get: () => app.model.data.stopCodonTypes ?? [],
  set: (value) => {
    app.model.data.stopCodonTypes = value.length > 0 ? value : undefined;
  },
});

const stopCodonReplacementModel = (type: StopCodonType) =>
  computed<string | undefined>({
    get: () => app.model.data.stopCodonReplacements?.[type],
    set: (value) => {
      const current: StopCodonReplacements = { ...(app.model.data.stopCodonReplacements ?? {}) };
      if (value === undefined) {
        delete current[type];
        app.model.data.stopCodonReplacements =
          Object.keys(current).length > 0 ? current : undefined;
      } else {
        current[type] = value;
        app.model.data.stopCodonReplacements = current;
      }
    },
  });

const amberReplacement = stopCodonReplacementModel("amber");
const ochreReplacement = stopCodonReplacementModel("ochre");
const opalReplacement = stopCodonReplacementModel("opal");

// Drop any orphaned per-type replacements when a stop type is deselected.
watch(stopCodonSelection, (selected) => {
  const current = app.model.data.stopCodonReplacements;
  if (!current) return;
  const next: StopCodonReplacements = { ...current };
  for (const key of Object.keys(next) as StopCodonType[]) {
    if (!selected.includes(key)) delete next[key];
  }
  app.model.data.stopCodonReplacements = Object.keys(next).length > 0 ? next : undefined;
});

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
  if (getPreset(app.model.data.presetId)?.hasUmi === true) return true;
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

  <PatternEditor />

  <div :class="$style.checkboxRow">
    <PlCheckbox
      :model-value="app.model.data.unstranded ?? false"
      @update:model-value="(v) => (app.model.data.unstranded = v)"
    >
      Unstranded library
    </PlCheckbox>
    <PlTooltip class="info">
      <template #tooltip>
        Enable for libraries where reads can come in either orientation.<br /><br />
        Leave off for stranded preps where R1 always reads the forward strand.
      </template>
    </PlTooltip>
  </div>

  <PlAccordionSection label="Advanced settings">
    <div v-if="hasUmi" style="display: flex; gap: 12px">
      <PlNumberField
        v-model="app.model.data.minReadsPerConsensus"
        label="Min reads per UMI"
        :min-value="1"
        :error-message="app.model.data.minReadsPerConsensus === undefined ? 'Required' : undefined"
      >
        <template #tooltip>
          Minimum reads sharing a UMI. Required to accept it as a valid molecule. Higher values
          correct more sequencing errors but discard rare molecules — use <code>1</code> for very
          diverse libraries or low sequencing depth.<br /><br />
          Default <code>2</code>. Rejected reads appear as <em>Insufficient UMI coverage</em> in the
          Peptide Recovery plot.
        </template>
      </PlNumberField>

      <PlNumberField
        v-model="app.model.data.maxIndels"
        label="Max UMI indels"
        :min-value="0"
        :error-message="app.model.data.maxIndels === undefined ? 'Required' : undefined"
      >
        <template #tooltip>
          Insertions/deletions tolerated when merging UMIs that likely come from the same molecule.
          Higher values recover more error-containing barcodes but may collapse genuinely different
          molecules.<br /><br />
          Default <code>1</code>.
        </template>
      </PlNumberField>

      <PlNumberField
        v-model="app.model.data.minUmiQuality"
        label="Min UMI quality"
        :min-value="0"
        :max-value="50"
        :error-message="app.model.data.minUmiQuality === undefined ? 'Required' : undefined"
      >
        <template #tooltip>
          Minimum Phred quality threshold for UMI bases. Raise to drop noisy UMIs; lower to keep
          more reads in low-quality runs.<br /><br />
          Default <code>20</code> (~1% per-base error). Try <code>12</code> for older or noisy
          sequencing data.
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

    <div :class="$style.checkboxGroup">
      <div :class="$style.checkboxRow">
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

      <div :class="$style.checkboxRow">
        <PlCheckbox
          :model-value="app.model.data.filterInvalidPeptides ?? true"
          @update:model-value="(v) => (app.model.data.filterInvalidPeptides = v)"
        >
          Drop peptides with early stop or trailing nucleotides
        </PlCheckbox>
        <PlTooltip class="info">
          <template #tooltip>
            Remove peptides whose nucleotide sequence contains an internal stop codon or whose
            length is not a multiple of three.
          </template>
        </PlTooltip>
      </div>

      <div v-if="!hasUmi" :class="$style.checkboxRow">
        <PlCheckbox
          :model-value="app.model.data.removeReadSingletons ?? true"
          @update:model-value="(v) => (app.model.data.removeReadSingletons = v)"
        >
          Drop read singletons
        </PlCheckbox>
        <PlTooltip class="info">
          <template #tooltip>
            Remove peptides observed in only one read. Most read singletons are sequencing errors;
            dropping them keeps the per-sample tables and downstream analysis focused on real
            signal. Disable to retain singletons (useful only for very low-depth experiments).
          </template>
        </PlTooltip>
      </div>
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

    <PlSectionSeparator>Stop codon replacement</PlSectionSeparator>
    <PlDropdownMulti
      v-model="stopCodonSelection"
      label="Stop codons"
      :options="stopCodonOptions"
      clearable
    >
      <template #tooltip>Select stop codons to replace in amino acid sequences.</template>
    </PlDropdownMulti>
    <PlDropdown
      v-if="stopCodonSelection.includes('amber')"
      v-model="amberReplacement"
      :options="aminoAcidOptions"
      label="Replace Amber (TAG) with"
      clearable
    />
    <PlDropdown
      v-if="stopCodonSelection.includes('ochre')"
      v-model="ochreReplacement"
      :options="aminoAcidOptions"
      label="Replace Ochre (TAA) with"
      clearable
    />
    <PlDropdown
      v-if="stopCodonSelection.includes('opal')"
      v-model="opalReplacement"
      :options="aminoAcidOptions"
      label="Replace Opal/Umber (TGA) with"
      clearable
    />

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

<style module>
.checkboxRow {
  display: flex;
  align-items: center;
  gap: 4px;
}

.checkboxGroup {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
</style>
