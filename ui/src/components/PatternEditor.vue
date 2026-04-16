<script setup lang="ts">
import type {
  PatternHalf,
  PatternParts,
} from "@platforma-open/milaboratories.peptide-extraction.model";
import type { SimpleOption } from "@platforma-sdk/ui-vue";
import { PlBtnGroup, PlCheckbox, PlNumberField, PlTextField } from "@platforma-sdk/ui-vue";
import { computed, reactive, ref, watch } from "vue";
import { useApp } from "../app";
import type { HomopolymerRun } from "../pattern";
import {
  assemblePattern,
  detectHomopolymers,
  detectMismatches,
  generateR2fromR1,
  defaultTrim,
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

const isGenerateMode = computed(() => (app.model.data.r2Mode ?? "generate") === "generate");

// ── Editor mode (write raw pattern vs. build from fields) ─────────────────

type EditorMode = "write" | "build";
const editorModeOptions: SimpleOption<EditorMode>[] = [
  { value: "write", text: "Write pattern" },
  { value: "build", text: "Build pattern" },
];
// Auto-detect: default to "build" if pattern parses, "write" if it doesn't
const editorMode = ref<EditorMode>("write");

const readTab = ref<"r1" | "r2">("r1");

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
  return parsePattern(p) === null
    ? "Invalid pattern. UMI tags: UMI, UMI1, UMI2... Peptide tags: R1, R2... All tag names must be unique."
    : null;
});

// ── Helpers: fields ↔ PatternHalf ──────────────────────────────────────────

/** Strict: returns null if any field is missing or invalid. */
function fieldsToHalf(f: HalfFields): PatternHalf | null {
  if (f.umiMin === undefined) return null;
  const leftAnchor = f.leftAnchor?.trim() ?? "";
  if (!leftAnchor) return null;
  const umi = { min: f.umiMin, max: f.umiMax ?? f.umiMin };
  if (validateUmiRange(umi)) return null;
  if (validateAnchor(leftAnchor)) return null;
  const rightAnchor = f.rightAnchor?.trim() ?? "";
  if (!rightAnchor) return null;
  if (validateAnchor(rightAnchor)) return null;
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

/** Lenient: returns a half with whatever fields are available. Allows empty/invalid anchors.
 *  Used for assembly and preview so the pattern always reflects the current field state. */
function fieldsToHalfLenient(f: HalfFields): PatternHalf | null {
  if (f.umiMin === undefined) return null;
  return {
    umi: { min: f.umiMin, max: f.umiMax ?? f.umiMin },
    leftAnchor: f.leftAnchor?.trim() ?? "",
    rightAnchor: f.rightAnchor?.trim() ?? "",
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
  // Preserve exactly what was parsed — default trim is only applied during Build mode assembly
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
    if (!parsed) {
      app.model.data.patternParts = undefined;
      return;
    }

    // Keep patternParts in sync with the current pattern text
    app.model.data.patternParts = parsed;

    setFieldsFromHalf(r1, parsed.r1);

    if (parsed.r2) {
      setFieldsFromHalf(r2, parsed.r2);
      // One-way switch: generate → manual if R2 no longer matches auto-generated.
      // Never switch back to generate automatically.
      if (app.model.data.r2Mode !== "manual") {
        const computedAuto = generateR2fromR1(parsed.r1);
        if (!halfEquals(parsed.r2, computedAuto)) {
          app.model.data.r2Mode = "manual";
        }
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

/** Reassemble the pattern from current field state and update the model. */
function reassembleFromFields() {
  const half1 = fieldsToHalfLenient(r1);
  if (!half1) {
    clearPattern();
    return;
  }

  let parts: PatternParts;
  if (isGenerateMode.value) {
    const auto = autoR2.value;
    if (!auto) {
      parts = { r1: half1 };
    } else {
      parts = { r1: half1, r2: auto };
    }
  } else {
    if (r2HasAnyContent.value) {
      const half2 = fieldsToHalfLenient(r2);
      if (half2) {
        parts = { r1: half1, r2: half2 };
      } else {
        parts = { r1: half1 };
      }
    } else {
      parts = { r1: half1 };
    }
  }

  const assembled = assemblePattern(parts);
  lastAssembled.value = assembled;
  app.model.data.pattern = assembled;

  // Re-parse the assembled pattern to get accurate parts (assembly may have applied default trims).
  // Update fields to match so preview, patternParts, and Tag Pattern all agree.
  const effectiveParts = parsePattern(assembled);
  app.model.data.patternParts = effectiveParts ?? parts;
  if (effectiveParts) {
    r1.rightTrim = effectiveParts.r1.rightTrim;
    if (effectiveParts.r2) r2.rightTrim = effectiveParts.r2.rightTrim;
  }
}

// Fields → pattern: only in Build mode. In Write mode, the raw text is the source of truth.
watch(
  [r1, r2, () => app.model.data.r2Mode, () => app.model.data.r2UseWildcards],
  () => {
    if (editorMode.value === "build") reassembleFromFields();
  },
  { deep: true },
);

// Switching to Build mode: only reassemble if the current pattern is invalid.
// Valid patterns (even without trim) are left as-is — the user's text is the source of truth.
watch(editorMode, (mode) => {
  if (mode === "build" && patternParseError.value) {
    r1.rightTrim = undefined;
    r2.rightTrim = undefined;
    reassembleFromFields();
  }
});

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

function handleModeChange(newMode: "generate" | "manual") {
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

/**
 * Build highlight segments for an anchor string.
 * Homopolymer runs and mismatch indices can be provided simultaneously.
 * Homopolymer takes priority over mismatch on the same character.
 */
function buildAnchorSegments(
  text: string,
  homoRuns: HomopolymerRun[],
  mismatchIndices: Set<number>,
): Segment[] {
  if (!text) return [];
  // Build per-character highlight map. Set mismatches first, then overwrite with homopolymers.
  const hl = Array.from<SegmentHl | undefined>({ length: text.length });
  for (const i of mismatchIndices) {
    if (i < text.length) hl[i] = "mismatch";
  }
  for (const { start, end } of homoRuns) {
    for (let i = start; i < end; i++) hl[i] = "homopolymer";
  }
  // Group consecutive characters with the same highlight into segments
  const segs: Segment[] = [];
  let i = 0;
  while (i < text.length) {
    const h = hl[i];
    let j = i + 1;
    while (j < text.length && hl[j] === h) j++;
    segs.push({ text: text.slice(i, j), hl: h });
    i = j;
  }
  return segs;
}

const previewSegments = computed((): Segment[] => {
  const half1 = fieldsToHalfLenient(r1);
  if (!half1) return [];

  const useWildcards = app.model.data.r2UseWildcards ?? true;
  const { min: r1min, max: r1max } = half1.umi;
  const r1UmiRange = r1min === r1max ? `${r1min}` : `${r1min}:${r1max}`;
  const r1Trim = half1.rightTrim !== undefined ? `>{${half1.rightTrim}}` : "";

  // Resolve R2
  let half2: PatternHalf | null;
  if (isGenerateMode.value) {
    half2 = autoR2.value;
  } else {
    half2 = r2HasAnyContent.value ? fieldsToHalfLenient(r2) : null;
  }

  // Mismatch indices (manual mode only, mirrored to R1)
  let r2LeftMismatch = new Set<number>();
  let r2RightMismatch = new Set<number>();
  let r1LeftMirror = new Set<number>();
  let r1RightMirror = new Set<number>();
  if (!isGenerateMode.value && half2) {
    const refAuto = autoR2.value;
    r2LeftMismatch = new Set(
      detectMismatches(half2.leftAnchor, refAuto?.leftAnchor ?? "").map((m) => m.index),
    );
    r2RightMismatch = new Set(
      detectMismatches(half2.rightAnchor, refAuto?.rightAnchor ?? "").map((m) => m.index),
    );
    // R2 left = RC(R1 right): mirror indices are reversed
    const r1RightLen = half1.rightAnchor.length;
    r1RightMirror = new Set(
      [...r2LeftMismatch].map((i) => r1RightLen - 1 - i).filter((i) => i >= 0),
    );
    // R2 right = RC(R1 left): mirror indices are reversed
    const r1LeftLen = half1.leftAnchor.length;
    r1LeftMirror = new Set(
      [...r2RightMismatch].map((i) => r1LeftLen - 1 - i).filter((i) => i >= 0),
    );
  }

  // Homopolymer runs (when wildcards enabled)
  const empty: HomopolymerRun[] = [];
  const r1LeftHomo = useWildcards ? detectHomopolymers(half1.leftAnchor) : empty;
  const r1RightHomo = useWildcards ? detectHomopolymers(half1.rightAnchor) : empty;

  const r1Part: Segment[] = [
    { text: `^(${half1.umiName ?? "UMI"}:N{${r1UmiRange}})` },
    ...buildAnchorSegments(half1.leftAnchor, r1LeftHomo, r1LeftMirror),
    { text: `(${half1.readName ?? "R1"}:*)` },
    ...buildAnchorSegments(half1.rightAnchor, r1RightHomo, r1RightMirror),
    { text: `${r1Trim}*` },
  ];

  if (!half2) return r1Part;

  const r2LeftHomo = useWildcards ? detectHomopolymers(half2.leftAnchor) : empty;
  const r2RightHomo = useWildcards ? detectHomopolymers(half2.rightAnchor) : empty;
  const { min: r2min, max: r2max } = half2.umi;
  const r2UmiRange = r2min === r2max ? `${r2min}` : `${r2min}:${r2max}`;
  const r2Trim = half2.rightTrim !== undefined ? `>{${half2.rightTrim}}` : "";

  return [
    ...r1Part,
    { text: "\\" },
    { text: `^(${half2.umiName ?? "UMI2"}:N{${r2UmiRange}})` },
    ...buildAnchorSegments(half2.leftAnchor, r2LeftHomo, r2LeftMismatch),
    { text: `(${half2.readName ?? "R2"}:*)` },
    ...buildAnchorSegments(half2.rightAnchor, r2RightHomo, r2RightMismatch),
    { text: `${r2Trim}*` },
  ];
});
</script>

<template>
  <PlBtnGroup v-model="editorMode" :options="editorModeOptions" />

  <!-- Write mode: raw pattern text field -->
  <template v-if="editorMode === 'write'">
    <PlTextField
      v-model="app.model.data.pattern"
      label="Tag pattern"
      :error="patternParseError ?? undefined"
    >
      <template #tooltip>
        Use <code>UMI</code>/<code>UMI2</code> for molecular barcodes and <code>R1</code>/<code
          >R2</code
        >
        for peptide sequences.<br /><br />
        Syntax:
        <a href="https://mixcr.com/mixcr/reference/ref-tag-pattern/" target="_blank">
          mixcr.com/mixcr/reference/ref-tag-pattern
        </a>
      </template>
    </PlTextField>
  </template>

  <!-- Build mode: field-based editor -->
  <template v-if="editorMode === 'build'">
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

    <!-- R1 / R2 tabs -->
    <div :class="$style.readTabs">
      <button
        :class="[$style.readTab, readTab === 'r1' && $style.readTabActive]"
        @click="readTab = 'r1'"
      >
        Read 1
      </button>
      <button
        :class="[$style.readTab, readTab === 'r2' && $style.readTabActive]"
        @click="readTab = 'r2'"
      >
        Read 2
      </button>
    </div>

    <!-- R1 fields -->
    <template v-if="readTab === 'r1'">
      <div :class="$style.row">
        <PlNumberField
          v-model="r1.umiMin"
          label="UMI min length"
          :min-value="1"
          :required="true"
          :error-message="r1Errors.umi ?? undefined"
        >
          <template #tooltip>Length range for the random UMI barcode sequence</template>
        </PlNumberField>
        <PlNumberField
          v-model="r1.umiMax"
          label="UMI max length"
          :min-value="r1.umiMin ?? 1"
          :clearable="true"
        />
      </div>
      <PlTextField
        :model-value="r1.leftAnchor"
        label="Left anchor"
        placeholder="e.g. gttcctttctatgcggcccagcc"
        :required="true"
        :error="r1Errors.leftAnchor ?? undefined"
        @update:model-value="(v) => (r1.leftAnchor = v || undefined)"
      >
        <template #tooltip>
          5' constant region flanking the peptide insert (lowercase = fuzzy match)
        </template>
      </PlTextField>
      <PlTextField
        :model-value="r1.rightAnchor"
        label="Right anchor"
        placeholder="e.g. gcggccgcacatcatcatcac"
        :required="true"
        :error="r1Errors.rightAnchor ?? undefined"
        @update:model-value="(v) => (r1.rightAnchor = v || undefined)"
      >
        <template #tooltip>
          3' constant region flanking the peptide insert (lowercase = fuzzy match)
        </template>
      </PlTextField>
    </template>

    <!-- R2 fields -->
    <template v-if="readTab === 'r2'">
      <PlCheckbox
        :model-value="isGenerateMode"
        :disabled="!autoR2"
        @update:model-value="(v) => handleModeChange(v ? 'generate' : 'manual')"
      >
        Auto-generate from R1
      </PlCheckbox>
      <template v-if="!isGenerateMode">
        <div :class="$style.row">
          <PlNumberField
            v-model="r2.umiMin"
            label="UMI min length"
            :min-value="1"
            :required="true"
            :error-message="r2Errors.umi ?? undefined"
          >
            <template #tooltip>Length range for the random UMI barcode sequence</template>
          </PlNumberField>
          <PlNumberField
            v-model="r2.umiMax"
            label="UMI max length"
            :min-value="r2.umiMin ?? 1"
            :clearable="true"
          />
        </div>
        <PlTextField
          :model-value="r2.leftAnchor"
          label="Left anchor"
          placeholder="e.g. tgagtttttgttctgcggcc"
          :required="true"
          :error="r2Errors.leftAnchor ?? undefined"
          @update:model-value="(v) => (r2.leftAnchor = v || undefined)"
        >
          <template #tooltip>
            5' constant region flanking the peptide insert (lowercase = fuzzy match)
          </template>
        </PlTextField>
        <PlTextField
          :model-value="r2.rightAnchor"
          label="Right anchor"
          placeholder="e.g. ggccatggccgcatagaaagg"
          :required="true"
          :error="r2Errors.rightAnchor ?? undefined"
          @update:model-value="(v) => (r2.rightAnchor = v || undefined)"
        >
          <template #tooltip>
            3' constant region flanking the peptide insert (lowercase = fuzzy match)
          </template>
        </PlTextField>
      </template>
    </template>
  </template>
</template>

<style module>
.readTabs {
  display: flex;
  gap: 0;
  border-bottom: 1px solid var(--pl-border, #ddd);
  margin-top: 8px;
}

.readTab {
  all: unset;
  cursor: pointer;
  padding: 6px 16px;
  font-size: 13px;
  font-weight: 500;
  color: var(--pl-text-secondary, #888);
  border-bottom: 2px solid transparent;
  transition:
    color 0.15s,
    border-color 0.15s;
}

.readTab:hover {
  color: var(--pl-text-primary, #222);
}

.readTabActive {
  color: var(--pl-text-primary, #222);
  border-bottom-color: var(--pl-accent, #2563eb);
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
