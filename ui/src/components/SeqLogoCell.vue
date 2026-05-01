<script setup lang="ts">
import { SeqLogo, getResidueCounts } from "@milaboratories/multi-sequence-alignment";
import type { ICellRendererParams } from "ag-grid-enterprise";
import { computed, onBeforeUnmount, onMounted, ref, toRaw, useTemplateRef } from "vue";

const props = defineProps<{
  params: ICellRendererParams<unknown, string[] | undefined>;
}>();

const containerEl = useTemplateRef<HTMLDivElement>("containerEl");
const containerWidth = ref(0);

// Every peptide in the dominant-length bucket is the same length by
// construction, so we can skip MSA and feed sequences straight into
// getResidueCounts.
const residueCounts = computed(() => {
  const seqs = props.params.value;
  return seqs && seqs.length > 0 ? getResidueCounts(toRaw(seqs)) : undefined;
});

const resizeObserver = new ResizeObserver((entries) => {
  const width = entries[0]?.contentRect.width ?? 0;
  if (width > 0) containerWidth.value = width;
});

onMounted(() => {
  if (containerEl.value) resizeObserver.observe(containerEl.value);
});

onBeforeUnmount(() => {
  resizeObserver.disconnect();
});
</script>

<template>
  <div ref="containerEl" class="seq-logo-cell">
    <SeqLogo
      v-if="residueCounts !== undefined && containerWidth > 0"
      :residueCounts="residueCounts"
      :width="containerWidth"
      :height="32"
    />
    <div v-else-if="!params.value?.length" class="seq-logo-not-ready">Not ready</div>
  </div>
</template>

<style>
.seq-logo-cell {
  height: 100%;
  width: 100%;
  overflow: hidden;
  display: flex;
  align-items: center;
}

.seq-logo-not-ready {
  color: var(--color-txt-03);
  font-size: 12px;
}
</style>
