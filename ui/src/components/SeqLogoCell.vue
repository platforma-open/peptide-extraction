<script setup lang="ts">
import { SeqLogo } from "@milaboratories/multi-sequence-alignment";
import type { ResidueCounts } from "@milaboratories/multi-sequence-alignment";
import type { ICellRendererParams } from "ag-grid-enterprise";
import { onBeforeUnmount, onMounted, ref, useTemplateRef } from "vue";

const props = defineProps<{
  params: ICellRendererParams<unknown, ResidueCounts | undefined>;
}>();

const containerEl = useTemplateRef<HTMLDivElement>("containerEl");
const containerWidth = ref(0);

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
      v-if="params.value !== undefined && params.value !== null && containerWidth > 0"
      :residueCounts="params.value"
      :width="containerWidth"
      :height="32"
    />
    <div v-else-if="!params.value" class="seq-logo-not-ready">Not ready</div>
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
