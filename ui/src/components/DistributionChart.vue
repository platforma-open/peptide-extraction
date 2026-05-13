<script setup lang="ts">
// Renders per-sample distributions organized in sections:
// 0. Peptide Length (AA / NT toggle)
// 1. Peptide Sequence Lengths (R1/R2 parsed + consensus, two-column)

import type { SimpleOption } from "@platforma-sdk/ui-vue";
import { PlAccordionSection, PlBtnGroup } from "@platforma-sdk/ui-vue";
import { computed, ref } from "vue";
import { useApp } from "../app";
import type { SampleDistributions } from "../distributions";
import { buildChart, buildDistLabels } from "../distributions";
import DistributionBars from "./DistributionBars.vue";

type LengthUnit = "aa" | "nt";
const lengthUnit = ref<LengthUnit>("aa");
const lengthUnitOptions: SimpleOption<LengthUnit>[] = [
  { value: "aa", text: "Amino Acid" },
  { value: "nt", text: "Nucleotide" },
];

const props = defineProps<{
  distributions: SampleDistributions | undefined;
}>();

const app = useApp();

const labels = computed(() => {
  const parts = app.model.data.patternParts;
  return buildDistLabels(
    parts?.r1?.insertName,
    parts?.r2?.insertName,
    parts?.r1?.umiName,
    parts?.r2?.umiName,
  );
});

const peptideLength = computed(() => {
  if (!props.distributions) return undefined;
  const distName = lengthUnit.value === "aa" ? "aa_length" : "nt_length";
  return buildChart(props.distributions, distName, labels.value, true);
});

const r1Extracted = computed(() =>
  props.distributions ? buildChart(props.distributions, "r1_length", labels.value) : undefined,
);
const r2Extracted = computed(() =>
  props.distributions ? buildChart(props.distributions, "r2_length", labels.value) : undefined,
);
const r1Consensus = computed(() =>
  props.distributions
    ? buildChart(props.distributions, "consensus_r1_length", labels.value)
    : undefined,
);
const r2Consensus = computed(() =>
  props.distributions
    ? buildChart(props.distributions, "consensus_r2_length", labels.value)
    : undefined,
);
const hasSequenceLengths = computed(
  () => r1Extracted.value || r2Extracted.value || r1Consensus.value || r2Consensus.value,
);
</script>

<template>
  <div v-if="props.distributions" class="dist-page">
    <!-- Peptide Length Distribution -->
    <div class="dist-section">
      <div class="dist-length-header">
        <div class="dist-section-title">Peptide Length</div>
        <PlBtnGroup v-model="lengthUnit" :options="lengthUnitOptions" :compact="true" />
      </div>
      <DistributionBars v-if="peptideLength" :bins="peptideLength.bins" />
      <div v-else class="dist-no-data">No data available</div>
    </div>

    <!-- Advanced results: Peptide Insert Lengths -->
    <PlAccordionSection v-if="hasSequenceLengths" label="Advanced results">
      <div class="dist-section">
        <div class="dist-section-title">Peptide Insert Lengths</div>
        <div class="dist-section-desc">
          Peptide insert length before and after the pipeline builds one consensus sequence per
          molecule. Shifts between the two reveal read truncation or quality filtering.
        </div>

        <div v-if="r1Extracted || r2Extracted" class="dist-pair">
          <div v-if="r1Extracted" class="dist-col">
            <div class="dist-title">{{ r1Extracted.label }}</div>
            <div class="dist-chart-area">
              <DistributionBars :bins="r1Extracted.bins" />
            </div>
          </div>
          <div v-if="r2Extracted" class="dist-col">
            <div class="dist-title">{{ r2Extracted.label }}</div>
            <div class="dist-chart-area">
              <DistributionBars :bins="r2Extracted.bins" />
            </div>
          </div>
        </div>

        <div v-if="r1Consensus || r2Consensus" class="dist-pair dist-pair-spaced">
          <div v-if="r1Consensus" class="dist-col">
            <div class="dist-title">{{ r1Consensus.label }}</div>
            <div class="dist-chart-area">
              <DistributionBars :bins="r1Consensus.bins" />
            </div>
          </div>
          <div v-if="r2Consensus" class="dist-col">
            <div class="dist-title">{{ r2Consensus.label }}</div>
            <div class="dist-chart-area">
              <DistributionBars :bins="r2Consensus.bins" />
            </div>
          </div>
        </div>
      </div>
    </PlAccordionSection>
  </div>
  <div v-else class="dist-no-data">No distribution data available</div>
</template>

<style scoped>
.dist-page {
  display: flex;
  flex-direction: column;
  gap: 48px;
  padding: 24px;
}

.dist-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.dist-length-header {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 16px;
}

.dist-section-title {
  font-weight: 600;
  font-size: 16px;
  color: var(--color-txt-01);
}

.dist-section-desc {
  font-size: 13px;
  color: var(--color-txt-03);
}

.dist-pair {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
  margin-top: 8px;
}

.dist-col {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.dist-title {
  font-weight: 500;
  font-size: 13px;
  color: var(--color-txt-02);
}

.dist-pair-spaced {
  margin-top: 20px;
}

.dist-chart-area {
  display: flex;
  flex-direction: row;
}

.dist-no-data {
  padding: 24px;
  color: var(--color-txt-03);
  font-size: 14px;
}
</style>
