<script setup lang="ts">
// Single QC check display: status badge + label with value + expandable description.
// Follows the mixcr-clonotyping QcSection pattern using PlStatusTag.

import { PlStatusTag } from "@platforma-sdk/ui-vue";
import { reactive } from "vue";
import type { QcCheckResult } from "../qcChecks";
import { formatCheckPrintedValue, qcCheckDescriptions } from "../qcChecks";

const props = defineProps<{
  value: QcCheckResult;
}>();

const data = reactive({ expanded: false });
</script>

<template>
  <div class="qc-section" :class="{ expanded: data.expanded }">
    <div class="qc-section__status" @click.stop="data.expanded = !data.expanded">
      <PlStatusTag :type="value.status" />
    </div>
    <div class="qc-section__text">
      <div class="qc-section__label" @click.stop="data.expanded = !data.expanded">
        {{ value.label }}: {{ formatCheckPrintedValue(value) }}
      </div>
      <div class="qc-section__description">
        {{ qcCheckDescriptions[value.checkType] ?? "" }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.qc-section {
  --display: none;
  --bg: transparent;

  display: flex;
  flex-direction: row;
  align-items: flex-start;
  padding: 8px 24px 8px 8px;
  gap: 12px;

  border-width: 1px 0;
  border-style: solid;
  border-color: var(--color-div-grey);

  margin-top: -1px;
  background-color: var(--bg);
}

.qc-section__status {
  width: 96px;
  min-width: 96px;
}

.qc-section__text {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: flex-start;
  padding: 2px 0 0;
  gap: 8px;
}

.qc-section__label {
  font-weight: 500;
  font-size: 14px;
  color: var(--color-txt-01);
  cursor: pointer;
}

.qc-section__description {
  display: var(--display);
  font-weight: 500;
  font-size: 14px;
  color: var(--color-txt-03);
  line-height: 20px;
  white-space: pre-wrap;
}

.qc-section.expanded {
  --display: block;
  --bg: var(--bg-base-light);
}

.qc-section :deep(.pl-status-tag) {
  cursor: pointer;
}
</style>
