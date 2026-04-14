<script setup lang="ts">
import {
  PlAccordionSection,
  PlBtnGroup,
  PlCheckbox,
  PlNumberField,
  PlTextField,
} from "@platforma-sdk/ui-vue";
import type { SimpleOption } from "@platforma-sdk/ui-vue";
import type {
  PatternHalf,
  PatternParts,
} from "@platforma-open/milaboratories.peptide-extraction.model";
import { computed, reactive, ref, watch } from "vue";
import { useApp } from "../app";
import {
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
  umiName: string | undefined;
  readName: string | undefined;
  leftAnchor: string | undefined;
  rightAnchor: string | undefined;
  rightTrim: number | undefined;
};

const emptyHalf = (): HalfFields => ({
  umiMin: undefined,
  umiMax: undefined,
  umiName: undefined,
  readName: undefined,
  leftAnchor: undefined,
  rightAnchor: undefined,
  rightTrim: undefined,
});

const r1 = reactive<HalfFields>(emptyHalf());
const r2 = reactive<HalfFields>(emptyHalf());

// ── Mode ───────────────────────────────────────────────────────────────────

type R2Mode = "generate" | "manual";

const r2ModeOptions: SimpleOption<R2Mode>[] = [
  { value: "generate", text: "Generate from R1" },
  { value: "manual", text: "Edit manually" },
];

const isGenerateMode = computed(() => (app.model.data.r2Mode ?? "generate") === "generate");

// Auto-generated R2 from R1. Wildcards are NOT applied to the pattern string —
// r2UseWildcards only controls preview highlighting and is passed to the backend.
// Right anchor is required: it becomes R2's left anchor via reverse complement.
const autoR2 = computed((): PatternHalf | null => {
  if (!r1.rightAnchor) return null;
  const half1 = fieldsToHalf(r1);
  return half1 ? generateR2fromR1(half1) : null;
});

// ── Validation ─────────────────────────────────────────────────────────────

const r1Errors = computed(() => ({
  umi:
    r1.umiMin !== undefined
      ? validateUmiRange({ min: r1.umiMin, max: r1.umiMax ?? r1.umiMin })
      : null,
  leftAnchor: r1.leftAnchor ? validateAnchor(r1.leftAnchor) : null,
  rightAnchor: r1.rightAnchor ? validateAnchor(r1.rightAnchor) : null,
}));

const r2HasAnyContent = computed(
  () =>
    r2.umiMin !== undefined || !!r2.leftAnchor || !!r2.rightAnchor || r2.rightTrim !== undefined,
);

const r2Errors = computed(() => ({
  umi:
    r2.umiMin !== undefined
      ? validateUmiRange({ min: r2.umiMin, max: r2.umiMax ?? r2.umiMin })
      : null,
  leftAnchor: r2.leftAnchor ? validateAnchor(r2.leftAnchor) : null,
  rightAnchor: r2.rightAnchor ? validateAnchor(r2.rightAnchor) : null,
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
  return {
    umi,
    leftAnchor,
    rightAnchor,
    rightTrim: f.rightTrim,
    umiName: f.umiName,
    readName: f.readName,
  };
}

function halfEquals(a: PatternHalf, b: PatternHalf): boolean {
  return (
    a.umi.min === b.umi.min &&
    a.umi.max === b.umi.max &&
    a.leftAnchor === b.leftAnchor &&
    a.rightAnchor === b.rightAnchor &&
    a.rightTrim === b.rightTrim
  );
}

function setFieldsFromHalf(fields: HalfFields, h: PatternHalf) {
  fields.umiMin = h.umi.min;
  fields.umiMax = h.umi.max !== h.umi.min ? h.umi.max : undefined;
  fields.umiName = h.umiName;
  fields.readName = h.readName;
  fields.leftAnchor = h.leftAnchor || undefined;
  fields.rightAnchor = h.rightAnchor || undefined;
  fields.rightTrim = h.rightTrim;
}

function clearHalf(fields: HalfFields) {
  Object.assign(fields, emptyHalf());
}

// ── Bidirectional sync ─────────────────────────────────────────────────────

const lastAssembled = ref<string | undefined>(undefined);

// Main field → accordion fields + mode detection
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
    if (!parsed) return;

    setFieldsFromHalf(r1, parsed.r1);

    if (parsed.r2) {
      const computedAuto = generateR2fromR1(parsed.r1);
      if (halfEquals(parsed.r2, computedAuto)) {
        app.model.data.r2Mode = "generate";
        // r2Fields updated by generate-mode watcher below
      } else {
        app.model.data.r2Mode = "manual";
        setFieldsFromHalf(r2, parsed.r2);
      }
    } else {
      clearHalf(r2);
    }
  },
  { immediate: true },
);

function clearPattern() {
  lastAssembled.value = undefined;
  app.model.data.pattern = undefined;
  app.model.data.patternParts = undefined;
}

// Accordion fields + mode → main field + patternParts
watch(
  [r1, r2, () => app.model.data.r2Mode, () => app.model.data.r2UseWildcards],
  () => {
    if (fieldsDisabled.value) return;
    const half1 = fieldsToHalf(r1);
    if (!half1) {
      clearPattern();
      return;
    }

    let parts: PatternParts;
    if (isGenerateMode.value) {
      const auto = autoR2.value;
      if (!auto) {
        clearPattern();
        return;
      }
      parts = { r1: half1, r2: auto };
    } else {
      if (r2HasAnyContent.value) {
        const half2 = fieldsToHalf(r2);
        if (!half2) {
          clearPattern();
          return;
        }
        parts = { r1: half1, r2: half2 };
      } else {
        parts = { r1: half1 };
      }
    }

    const assembled = assemblePattern(parts);
    lastAssembled.value = assembled;
    app.model.data.pattern = assembled;
    app.model.data.patternParts = parts;
  },
  { deep: true },
);

// Generate mode: keep r2Fields in sync with autoR2 (display only)
watch(
  [isGenerateMode, r1],
  () => {
    if (!isGenerateMode.value) return;
    const auto = autoR2.value;
    if (auto) setFieldsFromHalf(r2, auto);
    else clearHalf(r2);
  },
  { deep: true, immediate: true },
);

// ── Mode switch ────────────────────────────────────────────────────────────

function handleModeChange(newMode: R2Mode) {
  if (newMode === "generate" && !autoR2.value) return; // R1 not valid, nothing to generate
  if (newMode === "generate") {
    const auto = autoR2.value;
    if (auto) setFieldsFromHalf(r2, auto);
    else clearHalf(r2);
  }
  app.model.data.r2Mode = newMode;
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

function buildSegmentsFromMismatches(text: string, indices: Set<number>): Segment[] {
  if (!text || !indices.size) return [{ text }];
  const segs: Segment[] = [];
  let i = 0;
  while (i < text.length) {
    if (indices.has(i)) {
      let j = i + 1;
      while (j < text.length && indices.has(j)) j++;
      segs.push({ text: text.slice(i, j), hl: "mismatch" });
      i = j;
    } else {
      let j = i + 1;
      while (j < text.length && !indices.has(j)) j++;
      segs.push({ text: text.slice(i, j) });
      i = j;
    }
  }
  return segs;
}

const previewSegments = computed((): Segment[] => {
  const half1 = fieldsToHalf(r1);
  if (!half1) return [];

  const useWildcards = isGenerateMode.value && (app.model.data.r2UseWildcards ?? true);
  const { min: r1min, max: r1max } = half1.umi;
  const r1UmiRange = r1min === r1max ? `${r1min}` : `${r1min}:${r1max}`;
  const r1Trim = half1.rightTrim !== undefined ? `>{${half1.rightTrim}}` : "";

  // Resolve R2
  let half2: PatternHalf | null;
  if (isGenerateMode.value) {
    half2 = autoR2.value;
  } else {
    half2 = r2HasAnyContent.value ? fieldsToHalf(r2) : null;
  }

  let r1LeftSegs: Segment[];
  let r1RightSegs: Segment[];
  let r2LeftSegs: Segment[] | null = null;
  let r2RightSegs: Segment[] | null = null;
  let r2UmiRange = "";
  let r2Trim = "";

  if (useWildcards) {
    // Generate mode + wildcards on: homopolymer highlights on both sides
    r1LeftSegs = buildAnchorSegments(half1.leftAnchor, "", true);
    r1RightSegs = buildAnchorSegments(half1.rightAnchor, "", true);
    if (half2) {
      r2LeftSegs = buildAnchorSegments(half2.leftAnchor, "", true);
      r2RightSegs = buildAnchorSegments(half2.rightAnchor, "", true);
    }
  } else if (!isGenerateMode.value && half2) {
    // Manual mode: compute R2 mismatches vs autoR2, then mirror to R1
    const refAuto = autoR2.value;
    const r2LeftIdx = new Set(
      detectMismatches(half2.leftAnchor, refAuto?.leftAnchor ?? "").map((m) => m.index),
    );
    const r2RightIdx = new Set(
      detectMismatches(half2.rightAnchor, refAuto?.rightAnchor ?? "").map((m) => m.index),
    );
    // R2 left = RC(R1 right): mirror indices are reversed
    const r1RightLen = half1.rightAnchor.length;
    const r1RightIdx = new Set([...r2LeftIdx].map((i) => r1RightLen - 1 - i).filter((i) => i >= 0));
    // R2 right = RC(R1 left): mirror indices are reversed
    const r1LeftLen = half1.leftAnchor.length;
    const r1LeftIdx = new Set([...r2RightIdx].map((i) => r1LeftLen - 1 - i).filter((i) => i >= 0));

    r1LeftSegs = buildSegmentsFromMismatches(half1.leftAnchor, r1LeftIdx);
    r1RightSegs = buildSegmentsFromMismatches(half1.rightAnchor, r1RightIdx);
    r2LeftSegs = buildSegmentsFromMismatches(half2.leftAnchor, r2LeftIdx);
    r2RightSegs = buildSegmentsFromMismatches(half2.rightAnchor, r2RightIdx);
  } else {
    // Generate mode, wildcards off: plain
    r1LeftSegs = [{ text: half1.leftAnchor }];
    r1RightSegs = [{ text: half1.rightAnchor }];
    if (half2) {
      r2LeftSegs = [{ text: half2.leftAnchor }];
      r2RightSegs = [{ text: half2.rightAnchor }];
    }
  }

  if (half2) {
    const { min: r2min, max: r2max } = half2.umi;
    r2UmiRange = r2min === r2max ? `${r2min}` : `${r2min}:${r2max}`;
    r2Trim = half2.rightTrim !== undefined ? `>{${half2.rightTrim}}` : "";
  }

  const r1Part: Segment[] = [
    { text: `^(${half1.umiName ?? "UMI"}:N{${r1UmiRange}})` },
    ...r1LeftSegs,
    { text: `(${half1.readName ?? "R1"}:*)` },
    ...r1RightSegs,
    { text: `${r1Trim}*` },
  ];

  if (!half2 || !r2LeftSegs || !r2RightSegs) return r1Part;

  return [
    ...r1Part,
    { text: "\\" },
    { text: `^(${half2.umiName ?? "UMI2"}:N{${r2UmiRange}})` },
    ...r2LeftSegs,
    { text: `(${half2.readName ?? "R2"}:*)` },
    ...r2RightSegs,
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
    <PlCheckbox
      v-if="isGenerateMode && autoR2"
      :model-value="app.model.data.r2UseWildcards ?? true"
      :disabled="fieldsDisabled"
      @update:model-value="(v) => (app.model.data.r2UseWildcards = v)"
    >
      Use wildcards
    </PlCheckbox>

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
      :model-value="r1.leftAnchor"
      label="Left anchor"
      placeholder="e.g. gttcctttctatgcggcccagcc"
      :required="true"
      :error="r1Errors.leftAnchor ?? undefined"
      :disabled="fieldsDisabled"
      @update:model-value="(v) => (r1.leftAnchor = v || undefined)"
    />
    <PlTextField
      :model-value="r1.rightAnchor"
      label="Right anchor"
      placeholder="e.g. gcggccgcacatcatcatcac"
      :required="true"
      :error="r1Errors.rightAnchor ?? undefined"
      :disabled="fieldsDisabled"
      @update:model-value="(v) => (r1.rightAnchor = v || undefined)"
    />

    <!-- R2 section -->
    <div :class="$style.r2Header">
      <div :class="$style.sectionLabel">R2</div>
      <PlBtnGroup
        :model-value="!autoR2 ? 'generate' : (app.model.data.r2Mode ?? 'generate')"
        :options="r2ModeOptions"
        :disabled="fieldsDisabled || !autoR2"
        @update:model-value="handleModeChange"
      />
    </div>
    <template v-if="!isGenerateMode">
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
        :model-value="r2.leftAnchor"
        label="Left anchor"
        placeholder="e.g. tgagtttttgttctgcggcc"
        :error="r2Errors.leftAnchor ?? undefined"
        :disabled="fieldsDisabled"
        @update:model-value="(v) => (r2.leftAnchor = v || undefined)"
      />
      <PlTextField
        :model-value="r2.rightAnchor"
        label="Right anchor"
        placeholder="e.g. ggccatggccgcatagaaagg"
        :error="r2Errors.rightAnchor ?? undefined"
        :disabled="fieldsDisabled"
        @update:model-value="(v) => (r2.rightAnchor = v || undefined)"
      />
    </template>
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

.r2Header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
  flex-wrap: wrap;
}

.r2Header .sectionLabel {
  margin-top: 0;
  margin-bottom: 0;
}

.row {
  display: flex;
  gap: 8px;

  > * {
    flex: 1;
    min-width: 0;
  }
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
