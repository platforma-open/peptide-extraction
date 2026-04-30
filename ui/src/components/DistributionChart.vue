<script setup lang="ts">
// Renders per-sample distributions organized in sections:
// 0. Peptide Length (AA / NT toggle)
// 1. Peptide Sequence Lengths (R1/R2 parsed + consensus, two-column)
// 2. UMI Lengths (side by side, only if present)

import type { SimpleOption } from "@platforma-sdk/ui-vue";
import { PlAccordionSection, PlBtnGroup } from "@platforma-sdk/ui-vue";
import { computed, ref } from "vue";
import { useApp } from "../app";
import type { DistBin, SampleDistributions } from "../distributions";
import { buildDistLabels } from "../distributions";

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

type ChartData = {
  name: string;
  label: string;
  bins: (DistBin & { widthPct: number })[];
};

function buildChart(
  dists: SampleDistributions,
  name: string,
  sortNumeric = false,
): ChartData | undefined {
  const bins = dists[name];
  if (!bins?.length) return undefined;
  const sorted = sortNumeric ? [...bins].sort((a, b) => Number(a.bin) - Number(b.bin)) : bins;
  const maxPct = Math.max(...sorted.map((b) => b.pct), 0.01);
  return {
    name,
    label: labels.value[name] ?? name,
    bins: sorted.map((b) => ({ ...b, widthPct: (b.pct / maxPct) * 100 })),
  };
}

const peptideLength = computed(() => {
  if (!props.distributions) return undefined;
  const distName = lengthUnit.value === "aa" ? "aa_length" : "nt_length";
  return buildChart(props.distributions, distName, true);
});

const r1Extracted = computed(() =>
  props.distributions ? buildChart(props.distributions, "r1_length") : undefined,
);
const r2Extracted = computed(() =>
  props.distributions ? buildChart(props.distributions, "r2_length") : undefined,
);
const r1Consensus = computed(() =>
  props.distributions ? buildChart(props.distributions, "consensus_r1_length") : undefined,
);
const r2Consensus = computed(() =>
  props.distributions ? buildChart(props.distributions, "consensus_r2_length") : undefined,
);
const hasSequenceLengths = computed(
  () => r1Extracted.value || r2Extracted.value || r1Consensus.value || r2Consensus.value,
);

const umiLength = computed(() =>
  props.distributions ? buildChart(props.distributions, "umi_length") : undefined,
);
const umi2Length = computed(() =>
  props.distributions ? buildChart(props.distributions, "umi2_length") : undefined,
);
const hasUmiLengths = computed(() => umiLength.value || umi2Length.value);
</script>

<template>
  <div v-if="props.distributions" class="dist-page">
    <!-- Peptide Length Distribution -->
    <div class="dist-section">
      <div class="dist-length-header">
        <div class="dist-section-title">Peptide Length</div>
        <PlBtnGroup v-model="lengthUnit" :options="lengthUnitOptions" :compact="true" />
      </div>
      <div v-if="peptideLength" class="dist-bars">
        <div v-for="bin in peptideLength.bins" :key="bin.bin" class="dist-row">
          <div class="dist-bin-label">{{ bin.bin }}</div>
          <div class="dist-bar-track">
            <div
              class="dist-bar-fill"
              :style="{ width: bin.widthPct + '%' }"
              :title="`${bin.count.toLocaleString()} (${bin.pct.toFixed(1)}%)`"
            />
          </div>
          <div class="dist-pct">{{ bin.pct.toFixed(1) }}%</div>
        </div>
      </div>
      <div v-else class="dist-no-data">No data available</div>
    </div>

    <!-- Advanced results: Peptide Insert Lengths + UMI Lengths -->
    <PlAccordionSection v-if="hasSequenceLengths || hasUmiLengths" label="Advanced results">
      <div v-if="hasSequenceLengths" class="dist-section">
        <div class="dist-section-title">Peptide Insert Lengths</div>
        <div class="dist-section-desc">
          Peptide insert length before and after the pipeline builds one consensus sequence per
          molecule. Shifts between the two reveal read truncation or quality filtering.
        </div>

        <div v-if="r1Extracted || r2Extracted" class="dist-pair">
          <div v-if="r1Extracted" class="dist-col">
            <div class="dist-title">{{ r1Extracted.label }}</div>
            <div class="dist-chart-area">
              <div class="dist-bars">
                <div v-for="bin in r1Extracted.bins" :key="bin.bin" class="dist-row">
                  <div class="dist-bin-label">{{ bin.bin }}</div>
                  <div class="dist-bar-track">
                    <div
                      class="dist-bar-fill"
                      :style="{ width: bin.widthPct + '%' }"
                      :title="`${bin.count.toLocaleString()} (${bin.pct}%)`"
                    />
                  </div>
                  <div class="dist-pct">{{ bin.pct }}%</div>
                </div>
              </div>
            </div>
          </div>
          <div v-if="r2Extracted" class="dist-col">
            <div class="dist-title">{{ r2Extracted.label }}</div>
            <div class="dist-chart-area">
              <div class="dist-bars">
                <div v-for="bin in r2Extracted.bins" :key="bin.bin" class="dist-row">
                  <div class="dist-bin-label">{{ bin.bin }}</div>
                  <div class="dist-bar-track">
                    <div
                      class="dist-bar-fill"
                      :style="{ width: bin.widthPct + '%' }"
                      :title="`${bin.count.toLocaleString()} (${bin.pct}%)`"
                    />
                  </div>
                  <div class="dist-pct">{{ bin.pct }}%</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div v-if="r1Consensus || r2Consensus" class="dist-pair dist-pair-spaced">
          <div v-if="r1Consensus" class="dist-col">
            <div class="dist-title">{{ r1Consensus.label }}</div>
            <div class="dist-chart-area">
              <div class="dist-bars">
                <div v-for="bin in r1Consensus.bins" :key="bin.bin" class="dist-row">
                  <div class="dist-bin-label">{{ bin.bin }}</div>
                  <div class="dist-bar-track">
                    <div
                      class="dist-bar-fill"
                      :style="{ width: bin.widthPct + '%' }"
                      :title="`${bin.count.toLocaleString()} (${bin.pct}%)`"
                    />
                  </div>
                  <div class="dist-pct">{{ bin.pct }}%</div>
                </div>
              </div>
            </div>
          </div>
          <div v-if="r2Consensus" class="dist-col">
            <div class="dist-title">{{ r2Consensus.label }}</div>
            <div class="dist-chart-area">
              <div class="dist-bars">
                <div v-for="bin in r2Consensus.bins" :key="bin.bin" class="dist-row">
                  <div class="dist-bin-label">{{ bin.bin }}</div>
                  <div class="dist-bar-track">
                    <div
                      class="dist-bar-fill"
                      :style="{ width: bin.widthPct + '%' }"
                      :title="`${bin.count.toLocaleString()} (${bin.pct}%)`"
                    />
                  </div>
                  <div class="dist-pct">{{ bin.pct }}%</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-if="hasUmiLengths" class="dist-section">
        <div class="dist-section-title">UMI Lengths</div>
        <div class="dist-section-desc">
          Length of the UMI molecular barcode extracted from each read. A range of lengths is
          expected when the UMI design allows variable length.
        </div>
        <div class="dist-pair">
          <div v-if="umiLength" class="dist-col">
            <div class="dist-title">{{ umiLength.label }}</div>
            <div class="dist-chart-area">
              <div class="dist-bars">
                <div v-for="bin in umiLength.bins" :key="bin.bin" class="dist-row">
                  <div class="dist-bin-label">{{ bin.bin }}</div>
                  <div class="dist-bar-track">
                    <div
                      class="dist-bar-fill"
                      :style="{ width: bin.widthPct + '%' }"
                      :title="`${bin.count.toLocaleString()} (${bin.pct}%)`"
                    />
                  </div>
                  <div class="dist-pct">{{ bin.pct }}%</div>
                </div>
              </div>
            </div>
          </div>
          <div v-if="umi2Length" class="dist-col">
            <div class="dist-title">{{ umi2Length.label }}</div>
            <div class="dist-chart-area">
              <div class="dist-bars">
                <div v-for="bin in umi2Length.bins" :key="bin.bin" class="dist-row">
                  <div class="dist-bin-label">{{ bin.bin }}</div>
                  <div class="dist-bar-track">
                    <div
                      class="dist-bar-fill"
                      :style="{ width: bin.widthPct + '%' }"
                      :title="`${bin.count.toLocaleString()} (${bin.pct}%)`"
                    />
                  </div>
                  <div class="dist-pct">{{ bin.pct }}%</div>
                </div>
              </div>
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

.dist-single {
  max-width: 50%;
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

.dist-bars {
  display: flex;
  flex-direction: column;
  gap: 3px;
  flex: 1;
  min-width: 0;
}

.dist-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.dist-bin-label {
  font-size: 11px;
  font-family: monospace;
  color: var(--color-txt-02);
  width: 50px;
  text-align: right;
  flex-shrink: 0;
}

.dist-bar-track {
  flex: 1;
  height: 14px;
  background: var(--bg-base-light, #f0f0f0);
  border-radius: 3px;
  overflow: hidden;
}

.dist-bar-fill {
  height: 100%;
  background: #4a90d9;
  border-radius: 3px;
  transition: width 0.2s ease;
  min-width: 1px;
}

.dist-pct {
  font-size: 11px;
  color: var(--color-txt-03);
  width: 45px;
  text-align: right;
  flex-shrink: 0;
}

.dist-no-data {
  padding: 24px;
  color: var(--color-txt-03);
  font-size: 14px;
}
</style>
