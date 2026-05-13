<script setup lang="ts">
// Renders UMI-related distributions for a sample:
// 0. Reads per UMI molecule histogram (post-consensus depth)
// 1. Advanced results: UMI Lengths (side by side, only if present)

import { PlAccordionSection } from "@platforma-sdk/ui-vue";
import { computed } from "vue";
import { useApp } from "../app";
import type { DistBin, SampleDistributions } from "../distributions";
import { buildDistLabels } from "../distributions";
import DistributionBars from "./DistributionBars.vue";

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

type ChartData = {
  name: string;
  label: string;
  bins: (DistBin & { widthPct: number })[];
};

function buildChart(dists: SampleDistributions, name: string): ChartData | undefined {
  const bins = dists[name];
  if (!bins?.length) return undefined;
  const maxPct = Math.max(...bins.map((b) => b.pct), 0.01);
  return {
    name,
    label: labels.value[name] ?? name,
    bins: bins.map((b) => ({ ...b, widthPct: (b.pct / maxPct) * 100 })),
  };
}

const readsPerUmi = computed(() =>
  props.distributions ? buildChart(props.distributions, "reads_per_umi") : undefined,
);
const umiLength = computed(() =>
  props.distributions ? buildChart(props.distributions, "umi_length") : undefined,
);
const umi2Length = computed(() =>
  props.distributions ? buildChart(props.distributions, "umi2_length") : undefined,
);
const hasUmiLengths = computed(() => umiLength.value || umi2Length.value);

const minReadsThreshold = computed(() => app.model.data.minReadsPerConsensus ?? 2);
</script>

<template>
  <div v-if="props.distributions" class="dist-page">
    <!-- Reads per UMI molecule -->
    <div class="dist-section">
      <div class="dist-section-title">Reads per UMI molecule</div>
      <div class="dist-section-desc">
        Distribution of sequencing reads supporting each UMI molecule after consensus assembly.
      </div>
      <div class="dist-section-warning">
        Only UMI groups with at least {{ minReadsThreshold }}
        {{ minReadsThreshold === 1 ? "read" : "reads" }} contribute to consensus assembly. Smaller
        groups are excluded from this distribution.
      </div>
      <DistributionBars v-if="readsPerUmi" :bins="readsPerUmi.bins" />
      <div v-else class="dist-no-data">No data available</div>
    </div>

    <!-- Advanced results: UMI Lengths -->
    <PlAccordionSection v-if="hasUmiLengths" label="Advanced results">
      <div class="dist-section">
        <div class="dist-section-title">UMI Lengths</div>
        <div class="dist-section-desc">
          Length of the UMI molecular barcode extracted from each read. A range of lengths is
          expected when the UMI design allows variable length.
        </div>
        <div class="dist-pair">
          <div v-if="umiLength" class="dist-col">
            <div class="dist-title">{{ umiLength.label }}</div>
            <div class="dist-chart-area">
              <DistributionBars :bins="umiLength.bins" />
            </div>
          </div>
          <div v-if="umi2Length" class="dist-col">
            <div class="dist-title">{{ umi2Length.label }}</div>
            <div class="dist-chart-area">
              <DistributionBars :bins="umi2Length.bins" />
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

.dist-section-title {
  font-weight: 600;
  font-size: 16px;
  color: var(--color-txt-01);
}

.dist-section-desc {
  font-size: 13px;
  color: var(--color-txt-03);
}

.dist-section-warning {
  font-size: 12px;
  color: var(--color-txt-03);
  font-style: italic;
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
