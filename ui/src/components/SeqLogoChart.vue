<script setup lang="ts">
import { SeqLogo, getResidueCounts } from "@milaboratories/multi-sequence-alignment";
import type { ListOption } from "@platforma-sdk/ui-vue";
import { PlDropdown } from "@platforma-sdk/ui-vue";
import { computed, ref, toRaw, watch } from "vue";
import type { LengthBuckets } from "../seqLists";

const props = defineProps<{
  seqsByLength: LengthBuckets | undefined;
  dominantLength: number | undefined;
}>();

const LOGO_WIDTH = 672;
const LETTER_WIDTH = 30;

// Length options sorted by bucket size (most populated first), labelled with
// the count so users can see how much support each length has.
const lengthOptions = computed<ListOption<number>[]>(() => {
  if (!props.seqsByLength || props.seqsByLength.size === 0) return [];
  return [...props.seqsByLength.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([len, list]) => ({
      value: len,
      label: `${len} aa (${list.length.toLocaleString()})`,
    }));
});

const selectedLength = ref<number | undefined>(undefined);

// Default to the dominant length whenever the sample (or its dominant length)
// changes; users expect each sample to open on its dominant bucket.
watch(
  () => props.dominantLength,
  (domLen) => {
    selectedLength.value = domLen;
  },
  { immediate: true },
);

// If the current selection disappears (data reload), fall back to dominant.
watch(lengthOptions, (opts) => {
  if (selectedLength.value === undefined) return;
  if (!opts.some((o) => o.value === selectedLength.value)) {
    selectedLength.value = props.dominantLength;
  }
});

const sequences = computed<string[] | undefined>(() => {
  const len = selectedLength.value;
  if (len === undefined) return undefined;
  return props.seqsByLength?.get(len);
});

// Every peptide in a length bucket is exactly that length by construction
// (aaLengthPeptide = aaSeqPeptide.strLenChars()), so MSA is unnecessary —
// getResidueCounts can count residues position-by-position directly.
const residueCounts = computed(() =>
  sequences.value && sequences.value.length > 0
    ? getResidueCounts(toRaw(sequences.value))
    : undefined,
);

const logoWidth = computed(() =>
  residueCounts.value
    ? Math.min(LOGO_WIDTH, LETTER_WIDTH * residueCounts.value.length)
    : LOGO_WIDTH,
);
</script>

<template>
  <div class="seq-logo-chart">
    <div class="chart-title">Sequence Logo</div>
    <template v-if="lengthOptions.length > 0">
      <PlDropdown
        v-if="lengthOptions.length > 1"
        v-model="selectedLength"
        label="Peptide length"
        :options="lengthOptions"
        class="peptide-length-dropdown"
      />
      <div class="logo-area">
        <SeqLogo
          v-if="residueCounts !== undefined"
          :residueCounts="residueCounts"
          :width="logoWidth"
          :height="160"
        />
      </div>
    </template>
    <div v-else class="no-data">No sequence data available</div>
  </div>
</template>

<style scoped>
.seq-logo-chart {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 12px 0;
  max-width: 720px;
}

.chart-title {
  color: var(--color-txt-01);
  font-size: 20px;
  font-weight: 500;
  line-height: 24px;
}

.peptide-length-dropdown {
  width: 200px;
}

.logo-area {
  width: 100%;
  overflow: hidden;
}

.no-data {
  padding: 24px;
  color: var(--color-txt-03);
  font-size: 14px;
}
</style>
