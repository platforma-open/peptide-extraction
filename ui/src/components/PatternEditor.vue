<script setup lang="ts">
import { PlAccordionSection, PlBtnGhost, PlNumberField, PlTextField } from "@platforma-sdk/ui-vue";
import type {
  PatternHalf,
  PatternParts,
} from "@platforma-open/milaboratories.peptide-extraction.model";
import { computed, reactive, ref, watch } from "vue";
import { useApp } from "../app";
import {
  applyWildcards,
  assemblePattern,
  detectHomopolymers,
  detectMismatches,
  generateR2fromR1,
  parsePattern,
  validateAnchor,
  validateTrim,
  validateUmiRange,
} from "../pattern";

const app = useApp();

// ── Local field state ──────────────────────────────────────────────────────

type HalfFields = {
  umiMin: number | undefined;
  umiMax: number | undefined;
  leftAnchor: string | undefined;
  rightAnchor: string | undefined;
  rightTrim: number | undefined;
};

const emptyHalf = (): HalfFields => ({
  umiMin: undefined,
  umiMax: undefined,
  leftAnchor: undefined,
  rightAnchor: undefined,
  rightTrim: undefined,
});

const r1 = reactive<HalfFields>(emptyHalf());
const r2 = reactive<HalfFields>(emptyHalf());

// ── Validation ─────────────────────────────────────────────────────────────

const r1Errors = computed(() => ({
  umi:
    r1.umiMin !== undefined
      ? validateUmiRange({ min: r1.umiMin, max: r1.umiMax ?? r1.umiMin })
      : null,
  leftAnchor: r1.leftAnchor ? validateAnchor(r1.leftAnchor) : null,
  rightAnchor: r1.rightAnchor ? validateAnchor(r1.rightAnchor) : null,
  rightTrim:
    r1.rightTrim !== undefined && r1.rightAnchor
      ? validateTrim(r1.rightTrim, r1.rightAnchor)
      : null,
}));

const r2HasAnyContent = computed(
  () =>
    r2.umiMin !== undefined || !!r2.leftAnchor || !!r2.rightAnchor || r2.rightTrim !== undefined,
);

const r2Errors = computed(() => ({
  umi:
    r2.umiMin !== undefined
      ? validateUmiRange({ min: r2.umiMin, max: r2.umiMax ?? r2.umiMin })
      : r2HasAnyContent.value
        ? "UMI length is required when any R2 field is filled"
        : null,
  leftAnchor: r2.leftAnchor ? validateAnchor(r2.leftAnchor) : null,
  rightAnchor: r2.rightAnchor ? validateAnchor(r2.rightAnchor) : null,
  rightTrim:
    r2.rightTrim !== undefined && r2.rightAnchor
      ? validateTrim(r2.rightTrim, r2.rightAnchor)
      : null,
}));

// ── Parse error (from main field) ──────────────────────────────────────────

const patternParseError = computed(() => {
  const p = app.model.data.pattern;
  if (!p) return null;
  return parsePattern(p) === null ? "Pattern cannot be parsed" : null;
});

const fieldsDisabled = computed(() => patternParseError.value !== null);

// ── Helpers: fields ↔ PatternHalf ──────────────────────────────────────────

function fieldsToHalf(f: HalfFields): PatternHalf | null {
  if (f.umiMin === undefined) return null;
  const leftAnchor = f.leftAnchor?.trim() ?? "";
  if (!leftAnchor) return null;
  const umi = { min: f.umiMin, max: f.umiMax ?? f.umiMin };
  if (validateUmiRange(umi)) return null;
  if (validateAnchor(leftAnchor)) return null;
  const rightAnchor = f.rightAnchor?.trim() ?? "";
  if (rightAnchor && validateAnchor(rightAnchor)) return null;
  if (f.rightTrim !== undefined && rightAnchor && validateTrim(f.rightTrim, rightAnchor))
    return null;
  return { umi, leftAnchor, rightAnchor, rightTrim: f.rightTrim };
}

function setFieldsFromHalf(fields: HalfFields, h: PatternHalf) {
  fields.umiMin = h.umi.min;
  fields.umiMax = h.umi.max !== h.umi.min ? h.umi.max : undefined;
  fields.leftAnchor = h.leftAnchor || undefined;
  fields.rightAnchor = h.rightAnchor || undefined;
  fields.rightTrim = h.rightTrim;
}

function clearHalf(fields: HalfFields) {
  Object.assign(fields, emptyHalf());
}

// ── Bidirectional sync ─────────────────────────────────────────────────────

// Tracks the last value written by the accordion to prevent echo-back
const lastAssembled = ref<string | undefined>(undefined);

// Main field → accordion fields (external changes only)
watch(
  () => app.model.data.pattern,
  (pattern) => {
    if (pattern === lastAssembled.value) return;
    if (!pattern) {
      clearHalf(r1);
      clearHalf(r2);
      return;
    }
    const parsed = parsePattern(pattern);
    if (!parsed) return; // parse error — leave fields as-is, accordion disabled
    setFieldsFromHalf(r1, parsed.r1);
    if (parsed.r2) setFieldsFromHalf(r2, parsed.r2);
    else clearHalf(r2);
  },
  { immediate: true },
);

// Accordion fields → main field + patternParts
watch(
  [r1, r2],
  () => {
    if (fieldsDisabled.value) return;
    const half1 = fieldsToHalf(r1);
    if (!half1) return; // required R1 fields not yet valid

    let parts: PatternParts;
    if (r2HasAnyContent.value) {
      const half2 = fieldsToHalf(r2);
      if (!half2) return; // R2 partially filled but invalid — don't assemble
      parts = { r1: half1, r2: half2 };
    } else {
      parts = { r1: half1 };
    }

    const assembled = assemblePattern(parts);
    lastAssembled.value = assembled;
    app.model.data.pattern = assembled;
    app.model.data.patternParts = parts;
  },
  { deep: true },
);

// ── Auto-R2 generation ────────────────────────────────────────────────────

const autoR2 = computed(() => {
  const half1 = fieldsToHalf(r1);
  return half1 ? generateR2fromR1(half1) : null;
});

function halfEquals(a: PatternHalf, b: PatternHalf): boolean {
  return (
    a.umi.min === b.umi.min &&
    a.umi.max === b.umi.max &&
    a.leftAnchor === b.leftAnchor &&
    a.rightAnchor === b.rightAnchor &&
    a.rightTrim === b.rightTrim
  );
}

const r2IsAutoGenerated = computed(() => {
  if (!autoR2.value) return false;
  const current = fieldsToHalf(r2);
  return current !== null && halfEquals(current, autoR2.value);
});

// Also treat wildcards-applied-to-auto-gen as homopolymer mode (not mismatch)
const r2IsWildcardedAutoGenerated = computed(() => {
  if (!autoR2.value || r2IsAutoGenerated.value) return false;
  const current = fieldsToHalf(r2);
  if (!current) return false;
  const wildcarded: PatternHalf = {
    ...autoR2.value,
    leftAnchor: applyWildcards(autoR2.value.leftAnchor),
    rightAnchor: applyWildcards(autoR2.value.rightAnchor),
  };
  return halfEquals(current, wildcarded);
});

const canGenerateR2 = computed(() => {
  if (!autoR2.value) return false; // R1 not valid yet
  if (!r2HasAnyContent.value) return true; // R2 empty — offer to fill
  return !r2IsAutoGenerated.value; // R2 diverged — offer to reset
});

function doGenerateR2() {
  if (autoR2.value) setFieldsFromHalf(r2, autoR2.value);
}

// ── Apply wildcards (R2 anchors) ──────────────────────────────────────────

const canApplyWildcards = computed(() => {
  if (!r2HasAnyContent.value) return false;
  const leftHps = r2.leftAnchor ? detectHomopolymers(r2.leftAnchor) : [];
  const rightHps = r2.rightAnchor ? detectHomopolymers(r2.rightAnchor) : [];
  return leftHps.length > 0 || rightHps.length > 0;
});

function doApplyWildcards() {
  if (r2.leftAnchor) r2.leftAnchor = applyWildcards(r2.leftAnchor);
  if (r2.rightAnchor) r2.rightAnchor = applyWildcards(r2.rightAnchor);
}

// ── Pattern preview ───────────────────────────────────────────────────────

type SegmentHl = "homopolymer" | "mismatch";
type Segment = { text: string; hl?: SegmentHl };

function buildAnchorSegments(anchor: string, refAnchor: string, isAutoGen: boolean): Segment[] {
  if (!anchor) return [];
  if (isAutoGen) {
    const runs = detectHomopolymers(anchor);
    if (!runs.length) return [{ text: anchor }];
    const segs: Segment[] = [];
    let pos = 0;
    for (const { start, end } of runs) {
      if (pos < start) segs.push({ text: anchor.slice(pos, start) });
      segs.push({ text: anchor.slice(start, end), hl: "homopolymer" });
      pos = end;
    }
    if (pos < anchor.length) segs.push({ text: anchor.slice(pos) });
    return segs;
  } else {
    const mismatches = detectMismatches(anchor, refAnchor);
    if (!mismatches.length) return [{ text: anchor }];
    const mismatchSet = new Set(mismatches.map((m) => m.index));
    const segs: Segment[] = [];
    let i = 0;
    while (i < anchor.length) {
      if (mismatchSet.has(i)) {
        let j = i + 1;
        while (j < anchor.length && mismatchSet.has(j)) j++;
        segs.push({ text: anchor.slice(i, j), hl: "mismatch" });
        i = j;
      } else {
        let j = i + 1;
        while (j < anchor.length && !mismatchSet.has(j)) j++;
        segs.push({ text: anchor.slice(i, j) });
        i = j;
      }
    }
    return segs;
  }
}

const previewSegments = computed((): Segment[] => {
  const half1 = fieldsToHalf(r1);
  if (!half1) return [];

  const { min: r1min, max: r1max } = half1.umi;
  const r1UmiRange = r1min === r1max ? `${r1min}` : `${r1min}:${r1max}`;
  const r1Trim = half1.rightTrim !== undefined ? `>{${half1.rightTrim}}` : "";
  const r1Text = `^(UMI:N{${r1UmiRange}})${half1.leftAnchor}(R1:*)${half1.rightAnchor}${r1Trim}*`;

  if (!r2HasAnyContent.value) return [{ text: r1Text }];

  const half2 = fieldsToHalf(r2);
  if (!half2) return [{ text: r1Text }]; // R2 invalid — show R1 only

  const { min: r2min, max: r2max } = half2.umi;
  const r2UmiRange = r2min === r2max ? `${r2min}` : `${r2min}:${r2max}`;
  const r2Trim = half2.rightTrim !== undefined ? `>{${half2.rightTrim}}` : "";
  const isAutoGen = r2IsAutoGenerated.value || r2IsWildcardedAutoGenerated.value;
  const auto = autoR2.value;

  return [
    { text: r1Text },
    { text: "\\" },
    { text: `^(UMI2:N{${r2UmiRange}})` },
    ...buildAnchorSegments(half2.leftAnchor, auto?.leftAnchor ?? "", isAutoGen),
    { text: "(R2:*)" },
    ...buildAnchorSegments(half2.rightAnchor, auto?.rightAnchor ?? "", isAutoGen),
    { text: `${r2Trim}*` },
  ];
});
</script>

<template>
  <PlTextField
    v-model="app.model.data.pattern"
    label="mitool parse pattern"
    :error="patternParseError ?? undefined"
  >
    <template #tooltip>Full mitool parse pattern including R1 and R2, separated by \</template>
  </PlTextField>

  <PlAccordionSection label="Edit pattern">
    <!-- Pattern preview -->
    <div v-if="previewSegments.length" :class="$style.preview">
      <span
        v-for="(seg, i) in previewSegments"
        :key="i"
        :class="{
          [$style.hlHomo]: seg.hl === 'homopolymer',
          [$style.hlMismatch]: seg.hl === 'mismatch',
        }"
        >{{ seg.text }}</span
      >
    </div>

    <div :class="$style.buttons">
      <PlBtnGhost :disabled="!canGenerateR2" @click="doGenerateR2">Generate R2 from R1</PlBtnGhost>
      <PlBtnGhost :disabled="!canApplyWildcards" @click="doApplyWildcards"
        >Apply wildcards</PlBtnGhost
      >
    </div>

    <!-- R1 section -->
    <div :class="$style.sectionLabel">R1</div>
    <div :class="$style.row">
      <PlNumberField
        v-model="r1.umiMin"
        label="UMI min length"
        :min-value="1"
        :required="true"
        :error-message="r1Errors.umi ?? undefined"
        :disabled="fieldsDisabled"
      />
      <PlNumberField
        v-model="r1.umiMax"
        label="UMI max length"
        :min-value="r1.umiMin ?? 1"
        :clearable="true"
        :disabled="fieldsDisabled"
      />
    </div>
    <PlTextField
      v-model="r1.leftAnchor"
      label="Left anchor"
      placeholder="e.g. gttcctttctatgcggcccagcc"
      :required="true"
      :error="r1Errors.leftAnchor ?? undefined"
      :disabled="fieldsDisabled"
    />
    <PlTextField
      v-model="r1.rightAnchor"
      label="Right anchor"
      placeholder="e.g. gcggccgcacatcatcatcac"
      :error="r1Errors.rightAnchor ?? undefined"
      :disabled="fieldsDisabled"
    />
    <PlNumberField
      v-model="r1.rightTrim"
      label="Right trim"
      :min-value="0"
      :clearable="true"
      :error-message="r1Errors.rightTrim ?? undefined"
      :disabled="fieldsDisabled || !r1.rightAnchor"
    />

    <!-- R2 section -->
    <div :class="$style.sectionLabel">R2</div>
    <div :class="$style.row">
      <PlNumberField
        v-model="r2.umiMin"
        label="UMI min length"
        :min-value="1"
        :clearable="true"
        :required="r2HasAnyContent"
        :error-message="r2Errors.umi ?? undefined"
        :disabled="fieldsDisabled"
      />
      <PlNumberField
        v-model="r2.umiMax"
        label="UMI max length"
        :min-value="r2.umiMin ?? 1"
        :clearable="true"
        :disabled="fieldsDisabled"
      />
    </div>
    <PlTextField
      v-model="r2.leftAnchor"
      label="Left anchor"
      placeholder="e.g. tgagtttttgttctgcggcc"
      :error="r2Errors.leftAnchor ?? undefined"
      :disabled="fieldsDisabled"
    />
    <PlTextField
      v-model="r2.rightAnchor"
      label="Right anchor"
      placeholder="e.g. ggccatggccgcatagaaagg"
      :error="r2Errors.rightAnchor ?? undefined"
      :disabled="fieldsDisabled"
    />
    <PlNumberField
      v-model="r2.rightTrim"
      label="Right trim"
      :min-value="0"
      :clearable="true"
      :error-message="r2Errors.rightTrim ?? undefined"
      :disabled="fieldsDisabled || !r2.rightAnchor"
    />
  </PlAccordionSection>
</template>

<style module>
.sectionLabel {
  font-weight: 600;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--pl-text-secondary, #888);
  margin-top: 12px;
  margin-bottom: 2px;
}

.row {
  display: flex;
  gap: 8px;

  > * {
    flex: 1;
    min-width: 0;
  }
}

.buttons {
  display: flex;
  gap: 8px;
  margin-top: 8px;
  flex-wrap: wrap;
}

.preview {
  font-family: monospace;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
  background: var(--pl-surface-secondary, #f5f5f5);
  border-radius: 4px;
  padding: 8px 10px;
  margin-top: 12px;
  color: var(--pl-text-primary, #222);
}

.hlHomo {
  background-color: rgba(255, 165, 0, 0.35);
  border-radius: 2px;
}

.hlMismatch {
  background-color: rgba(220, 50, 50, 0.25);
  border-radius: 2px;
}
</style>
