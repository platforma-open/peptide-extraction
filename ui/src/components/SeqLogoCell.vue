<script setup lang="ts">
import {
  SeqLogo,
  alignSequences,
  getResidueCounts,
} from "@milaboratories/multi-sequence-alignment";
import type { ResidueCounts } from "@milaboratories/multi-sequence-alignment";
import type { ICellRendererParams } from "ag-grid-enterprise";
import { onBeforeUnmount, onMounted, ref, shallowRef, toRaw, useTemplateRef, watch } from "vue";

const props = defineProps<{
  params: ICellRendererParams<unknown, string[] | undefined>;
}>();

const containerEl = useTemplateRef<HTMLDivElement>("containerEl");
const containerWidth = ref(0);
const residueCounts = shallowRef<ResidueCounts | undefined>(undefined);

let abortController: AbortController | undefined;

const resizeObserver = new ResizeObserver((entries) => {
  const width = entries[0]?.contentRect.width ?? 0;
  if (width > 0) containerWidth.value = width;
});

onMounted(() => {
  if (containerEl.value) resizeObserver.observe(containerEl.value);
});

onBeforeUnmount(() => {
  resizeObserver.disconnect();
  abortController?.abort();
});

watch(
  () => props.params.value,
  async (sequences) => {
    abortController?.abort();
    residueCounts.value = undefined;

    console.log("[SeqLogoCell] sequences:", sequences?.length);
    if (!sequences || sequences.length === 0) return;

    abortController = new AbortController();
    const { signal } = abortController;
    try {
      const aligned = await alignSequences(toRaw(sequences), undefined, signal);
      if (!signal.aborted) {
        residueCounts.value = getResidueCounts(aligned);
      }
    } catch (e) {
      console.error("[SeqLogoCell] alignment error:", e);
    }
  },
  { immediate: true },
);
</script>

<template>
  <div ref="containerEl" class="seq-logo-cell">
    <SeqLogo
      v-if="residueCounts !== undefined && containerWidth > 0"
      :residueCounts="residueCounts"
      :width="containerWidth"
      :height="32"
    />
  </div>
</template>

<style scoped>
.seq-logo-cell {
  height: 100%;
  width: 100%;
  overflow: hidden;
  display: flex;
  align-items: center;
}
</style>
