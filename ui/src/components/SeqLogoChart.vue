<script setup lang="ts">
import {
  SeqLogo,
  alignSequences,
  getResidueCounts,
} from "@milaboratories/multi-sequence-alignment";
import type { ResidueCounts } from "@milaboratories/multi-sequence-alignment";
import { computed, onBeforeUnmount, shallowRef, toRaw, watch } from "vue";

const props = defineProps<{
  sequences: string[] | undefined;
}>();

const LOGO_WIDTH = 672;
const LETTER_WIDTH = 30;

const residueCounts = shallowRef<ResidueCounts | undefined>(undefined);

const logoWidth = computed(() =>
  residueCounts.value
    ? Math.min(LOGO_WIDTH, LETTER_WIDTH * residueCounts.value.length)
    : LOGO_WIDTH,
);

let abortController: AbortController | undefined;

onBeforeUnmount(() => {
  abortController?.abort();
});

watch(
  () => props.sequences,
  async (sequences) => {
    abortController?.abort();
    residueCounts.value = undefined;

    if (!sequences || sequences.length === 0) return;

    abortController = new AbortController();
    const { signal } = abortController;
    try {
      const aligned = await alignSequences(toRaw(sequences), undefined, signal);
      if (!signal.aborted) {
        residueCounts.value = getResidueCounts(aligned);
      }
    } catch (e) {
      console.error("[SeqLogoChart] alignment error:", e);
    }
  },
  { immediate: true },
);
</script>

<template>
  <div v-if="sequences?.length" class="seq-logo-chart">
    <div class="chart-title">Sequence Logo</div>
    <div class="logo-area">
      <SeqLogo
        v-if="residueCounts !== undefined"
        :residueCounts="residueCounts"
        :width="logoWidth"
        :height="160"
      />
    </div>
  </div>
  <div v-else class="no-data">No sequence data available</div>
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
