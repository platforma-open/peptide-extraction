<script setup lang="ts">
import type {
  PatternHalf,
  PatternParts,
  PatternSource,
} from "@platforma-open/milaboratories.peptide-extraction.model";
import { allPresets, getPreset } from "@platforma-open/milaboratories.peptide-extraction.model";
import type { ListOption, SimpleOption } from "@platforma-sdk/ui-vue";
import {
  PlBtnGroup,
  PlCheckbox,
  PlDropdown,
  PlNumberField,
  PlTextField,
} from "@platforma-sdk/ui-vue";
import { computed, reactive, ref, watch } from "vue";
import { useApp } from "../app";
import {
  assemblePattern,
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
  hasUmi: boolean;
  umiMin: number | undefined;
  umiMax: number | undefined;
  umiName: string | undefined;
  insertName: string | undefined;
  leftAnchor: string | undefined;
  rightAnchor: string | undefined;
  rightTrim: number | undefined;
  // Insert length:
  //   hasInsertLength === false      → variable (`*`)
  //   hasInsertLength === true:
  //     insertMin set, insertMax unset  → fixed (`N{insertMin}`)
  //     insertMin & insertMax both set → ranged (`N{min:max}`), fixed if equal
  hasInsertLength: boolean;
  insertMin: number | undefined;
  insertMax: number | undefined;
};

const emptyHalf = (): HalfFields => ({
  hasUmi: true, // default to UMI present — matches most existing workflows
  umiMin: undefined,
  umiMax: undefined,
  umiName: undefined,
  insertName: undefined,
  leftAnchor: undefined,
  rightAnchor: undefined,
  rightTrim: undefined,
  hasInsertLength: false, // default to variable `*`
  insertMin: undefined,
  insertMax: undefined,
});

const r1 = reactive<HalfFields>(emptyHalf());
const r2 = reactive<HalfFields>(emptyHalf());

// ── Pattern source (preset vs custom) ──────────────────────────────────────

const patternSourceOptions: SimpleOption<PatternSource>[] = [
  { value: "preset", text: "Built-in preset" },
  { value: "custom", text: "Custom" },
];

const presetOptions = computed((): ListOption<string>[] =>
  allPresets.map((p) => ({
    value: p.id,
    label: p.vendor ? `${p.label} - ${p.vendor}` : p.label,
  })),
);

const selectedPreset = computed(() => getPreset(app.model.data.presetId));

function setPresetId(id: string | undefined) {
  app.model.data.presetId = id;
  const p = getPreset(id);
  if (p) app.model.data.pattern = p.pattern;
}

// ── Mode ───────────────────────────────────────────────────────────────────

const isGenerateMode = computed(() => (app.model.data.r2Mode ?? "generate") === "generate");

// ── Editor mode (write raw pattern vs. build from fields) ─────────────────

type EditorMode = "write" | "build";
const editorModeOptions: SimpleOption<EditorMode>[] = [
  { value: "write", text: "Add" },
  { value: "build", text: "Build" },
];
// Auto-detect: default to "build" if pattern parses, "write" if it doesn't
const editorMode = ref<EditorMode>("write");

const readTab = ref<"r1" | "r2">("r1");

// Auto-generated R2 from R1. Wildcards are NOT applied to the pattern string —
// useWildcards only controls preview highlighting and is passed to the backend.
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
    (r2.hasUmi && r2.umiMin !== undefined) ||
    !!r2.leftAnchor ||
    !!r2.rightAnchor ||
    r2.rightTrim !== undefined ||
    r2.hasInsertLength,
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

/** Compute the `insertLength` value for a PatternHalf from form fields.
 *  Follows the same shape as UMI min/max:
 *    - hasInsertLength false          → undefined (variable `*`)
 *    - insertMin set, insertMax unset → fixed (`N{insertMin}`)
 *    - insertMin & insertMax both set → ranged (`N{min:max}`; fixed when equal)
 *  Returns `"invalid"` when hasInsertLength is on but inputs are missing/inverted.
 */
function insertLengthFromFields(
  f: HalfFields,
): number | { min: number; max: number } | undefined | "invalid" {
  if (!f.hasInsertLength) return undefined;
  if (f.insertMin === undefined || f.insertMin < 1) return "invalid";
  if (f.insertMax === undefined) return f.insertMin;
  if (f.insertMax < f.insertMin) return "invalid";
  return f.insertMin === f.insertMax ? f.insertMin : { min: f.insertMin, max: f.insertMax };
}

/** Strict: returns null if any anchor is missing or any provided value is invalid.
 *  UMI is optional (controlled by `hasUmi`). Insert length is user-selected
 *  (`variable` | `fixed` | `ranged`). */
function fieldsToHalf(f: HalfFields): PatternHalf | null {
  const leftAnchor = f.leftAnchor?.trim() ?? "";
  if (!leftAnchor) return null;
  if (validateAnchor(leftAnchor)) return null;
  const rightAnchor = f.rightAnchor?.trim() ?? "";
  if (!rightAnchor) return null;
  if (validateAnchor(rightAnchor)) return null;
  if (f.rightTrim !== undefined && rightAnchor && validateTrim(f.rightTrim, rightAnchor))
    return null;

  let umi: { min: number; max: number } | undefined;
  if (f.hasUmi) {
    if (f.umiMin === undefined) return null;
    umi = { min: f.umiMin, max: f.umiMax ?? f.umiMin };
    if (validateUmiRange(umi)) return null;
  }

  const insertLength = insertLengthFromFields(f);
  if (insertLength === "invalid") return null;

  return {
    umi,
    leftAnchor,
    rightAnchor,
    rightTrim: f.rightTrim,
    umiName: f.umiName,
    insertName: f.insertName,
    insertLength,
  };
}

/** Lenient: returns a half with whatever fields are available. Allows empty/invalid anchors.
 *  Used for assembly and preview so the pattern always reflects the current field state.
 *  Returns null only when the half has no distinguishing content at all. */
function fieldsToHalfLenient(f: HalfFields): PatternHalf | null {
  const hasAny =
    (f.hasUmi && f.umiMin !== undefined) ||
    !!f.leftAnchor ||
    !!f.rightAnchor ||
    f.rightTrim !== undefined ||
    f.hasInsertLength;
  if (!hasAny) return null;
  const lenientInsert = insertLengthFromFields(f);
  return {
    umi:
      f.hasUmi && f.umiMin !== undefined ? { min: f.umiMin, max: f.umiMax ?? f.umiMin } : undefined,
    leftAnchor: f.leftAnchor?.trim() ?? "",
    rightAnchor: f.rightAnchor?.trim() ?? "",
    rightTrim: f.rightTrim,
    umiName: f.umiName,
    insertName: f.insertName,
    // Lenient: fall back to variable when inputs are incomplete so the preview still renders
    insertLength: lenientInsert === "invalid" ? undefined : lenientInsert,
  };
}

function insertLengthEquals(
  a: PatternHalf["insertLength"],
  b: PatternHalf["insertLength"],
): boolean {
  if (a === undefined && b === undefined) return true;
  if (typeof a === "number" && typeof b === "number") return a === b;
  if (a && b && typeof a === "object" && typeof b === "object")
    return a.min === b.min && a.max === b.max;
  return false;
}

function halfEquals(a: PatternHalf, b: PatternHalf): boolean {
  const umiEq =
    (a.umi === undefined && b.umi === undefined) ||
    (a.umi !== undefined &&
      b.umi !== undefined &&
      a.umi.min === b.umi.min &&
      a.umi.max === b.umi.max);
  return (
    umiEq &&
    a.leftAnchor === b.leftAnchor &&
    a.rightAnchor === b.rightAnchor &&
    a.rightTrim === b.rightTrim &&
    insertLengthEquals(a.insertLength, b.insertLength)
  );
}

function setFieldsFromHalf(fields: HalfFields, h: PatternHalf) {
  fields.hasUmi = h.umi !== undefined;
  fields.umiMin = h.umi?.min;
  fields.umiMax = h.umi && h.umi.max !== h.umi.min ? h.umi.max : undefined;
  fields.umiName = h.umiName;
  fields.insertName = h.insertName;
  fields.leftAnchor = h.leftAnchor || undefined;
  fields.rightAnchor = h.rightAnchor || undefined;
  // Preserve exactly what was parsed — default trim is only applied during Build mode assembly
  fields.rightTrim = h.rightTrim;
  // Insert length: mirror UMI shape (hasInsertLength + min/max)
  if (h.insertLength === undefined) {
    fields.hasInsertLength = false;
    fields.insertMin = undefined;
    fields.insertMax = undefined;
  } else if (typeof h.insertLength === "number") {
    fields.hasInsertLength = true;
    fields.insertMin = h.insertLength;
    fields.insertMax = undefined;
  } else {
    fields.hasInsertLength = true;
    fields.insertMin = h.insertLength.min;
    fields.insertMax = h.insertLength.max !== h.insertLength.min ? h.insertLength.max : undefined;
  }
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
  [r1, r2, () => app.model.data.r2Mode, () => app.model.data.useWildcards],
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

type Segment = { text: string; hl?: "mismatch" };

/**
 * Build highlight segments for an anchor string.
 * Mismatch indices are highlighted (manual R2 diverging from the
 * auto-generated reverse complement).
 */
function buildAnchorSegments(text: string, mismatchIndices: Set<number>): Segment[] {
  if (!text) return [];
  const segs: Segment[] = [];
  let i = 0;
  while (i < text.length) {
    const isMismatch = mismatchIndices.has(i);
    let j = i + 1;
    while (j < text.length && mismatchIndices.has(j) === isMismatch) j++;
    segs.push({ text: text.slice(i, j), hl: isMismatch ? "mismatch" : undefined });
    i = j;
  }
  return segs;
}

/** Render an insert-length spec in mitool pattern syntax. */
function formatInsertLength(insertLength: PatternHalf["insertLength"]): string {
  if (insertLength === undefined) return "*";
  if (typeof insertLength === "number") return `N{${insertLength}}`;
  return insertLength.min === insertLength.max
    ? `N{${insertLength.min}}`
    : `N{${insertLength.min}:${insertLength.max}}`;
}

const previewSegments = computed((): Segment[] => {
  const half1 = fieldsToHalfLenient(r1);
  if (!half1) return [];

  const r1UmiSegment = half1.umi
    ? `^(${half1.umiName ?? "UMI"}:N{${half1.umi.min === half1.umi.max ? half1.umi.min : `${half1.umi.min}:${half1.umi.max}`}})`
    : "^";
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

  const r1Part: Segment[] = [
    { text: r1UmiSegment },
    ...buildAnchorSegments(half1.leftAnchor, r1LeftMirror),
    { text: `(${half1.insertName ?? "R1"}:${formatInsertLength(half1.insertLength)})` },
    ...buildAnchorSegments(half1.rightAnchor, r1RightMirror),
    { text: `${r1Trim}*` },
  ];

  if (!half2) return r1Part;

  const r2UmiSegment = half2.umi
    ? `^(${half2.umiName ?? "UMI2"}:N{${half2.umi.min === half2.umi.max ? half2.umi.min : `${half2.umi.min}:${half2.umi.max}`}})`
    : "^";
  const r2Trim = half2.rightTrim !== undefined ? `>{${half2.rightTrim}}` : "";

  return [
    ...r1Part,
    { text: "\\" },
    { text: r2UmiSegment },
    ...buildAnchorSegments(half2.leftAnchor, r2LeftMismatch),
    { text: `(${half2.insertName ?? "R2"}:${formatInsertLength(half2.insertLength)})` },
    ...buildAnchorSegments(half2.rightAnchor, r2RightMismatch),
    { text: `${r2Trim}*` },
  ];
});
</script>

<template>
  <!-- Source + sub-mode toggles share one row. Each slot takes equal width so
       layout doesn't shift when switching source. The right slot is reserved
       for future sub-modes (e.g. preset-from-file). -->
  <div :class="$style.modeRow">
    <div :class="$style.modeSlot">
      <PlBtnGroup
        :model-value="app.model.data.patternSource ?? 'preset'"
        :options="patternSourceOptions"
        :class="$style.fullWidthGroup"
        @update:model-value="(v) => (app.model.data.patternSource = v)"
      />
    </div>
    <div :class="$style.modeSlot">
      <PlBtnGroup
        v-if="(app.model.data.patternSource ?? 'preset') === 'custom'"
        v-model="editorMode"
        :options="editorModeOptions"
        :class="$style.fullWidthGroup"
      />
    </div>
  </div>

  <!-- Built-in preset source -->
  <template v-if="(app.model.data.patternSource ?? 'preset') === 'preset'">
    <PlDropdown
      :model-value="app.model.data.presetId"
      :options="presetOptions"
      label="Preset"
      :required="true"
      :error="!selectedPreset ? 'Select a preset' : undefined"
      clearable
      @update:model-value="setPresetId"
    />
  </template>

  <!-- Custom pattern source: existing Add / Build editor -->
  <template v-if="(app.model.data.patternSource ?? 'preset') === 'custom'">
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
          :class="{ [$style.hlMismatch]: seg.hl === 'mismatch' }"
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
        <PlCheckbox v-model="r1.hasUmi">
          Has UMI
          <template #tooltip>
            Uncheck for libraries without a molecular barcode (e.g. NEB Ph.D. phage display kits).
          </template>
        </PlCheckbox>
        <div v-if="r1.hasUmi" :class="$style.row">
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
          placeholder="e.g. gctagcaacgatgactcgacatggcc"
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
          placeholder="e.g. tgcagtacgtagtcggatctag"
          :required="true"
          :error="r1Errors.rightAnchor ?? undefined"
          @update:model-value="(v) => (r1.rightAnchor = v || undefined)"
        >
          <template #tooltip>
            3' constant region flanking the peptide insert (lowercase = fuzzy match)
          </template>
        </PlTextField>
        <PlCheckbox v-model="r1.hasInsertLength">
          Delimited insert length
          <template #tooltip>
            Constrain the peptide insert to a specific length. Leave unchecked for variable-length
            libraries. Set only the min field for a fixed length (e.g. 21 for NEB Ph.D.-7); set both
            min and max for a range.
          </template>
        </PlCheckbox>
        <div v-if="r1.hasInsertLength" :class="$style.row">
          <PlNumberField
            v-model="r1.insertMin"
            label="Insert min length"
            :min-value="1"
            :required="true"
          />
          <PlNumberField
            v-model="r1.insertMax"
            label="Insert max length"
            :min-value="r1.insertMin ?? 1"
            :clearable="true"
          />
        </div>
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
        <PlCheckbox v-model="r2.hasUmi" :disabled="isGenerateMode">
          Has UMI
          <template #tooltip> Uncheck for libraries without a molecular barcode. </template>
        </PlCheckbox>
        <div v-if="r2.hasUmi" :class="$style.row">
          <PlNumberField
            v-model="r2.umiMin"
            label="UMI min length"
            :min-value="1"
            :required="true"
            :disabled="isGenerateMode"
            :error-message="r2Errors.umi ?? undefined"
          >
            <template #tooltip>Length range for the random UMI barcode sequence</template>
          </PlNumberField>
          <PlNumberField
            v-model="r2.umiMax"
            label="UMI max length"
            :min-value="r2.umiMin ?? 1"
            :clearable="true"
            :disabled="isGenerateMode"
          />
        </div>
        <PlTextField
          :model-value="r2.leftAnchor"
          label="Left anchor"
          placeholder="e.g. ctagatccgactacgtactgca"
          :required="true"
          :disabled="isGenerateMode"
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
          placeholder="e.g. cgatctagctgacagtcatcgttgctagc"
          :required="true"
          :disabled="isGenerateMode"
          :error="r2Errors.rightAnchor ?? undefined"
          @update:model-value="(v) => (r2.rightAnchor = v || undefined)"
        >
          <template #tooltip>
            3' constant region flanking the peptide insert (lowercase = fuzzy match)
          </template>
        </PlTextField>
        <PlCheckbox v-model="r2.hasInsertLength" :disabled="isGenerateMode">
          Delimited insert length
          <template #tooltip>
            Constrain the peptide insert to a specific length. In generate mode this follows R1.
          </template>
        </PlCheckbox>
        <div v-if="r2.hasInsertLength" :class="$style.row">
          <PlNumberField
            v-model="r2.insertMin"
            label="Insert min length"
            :min-value="1"
            :required="true"
            :disabled="isGenerateMode"
          />
          <PlNumberField
            v-model="r2.insertMax"
            label="Insert max length"
            :min-value="r2.insertMin ?? 1"
            :clearable="true"
            :disabled="isGenerateMode"
          />
        </div>
      </template>
    </template>
  </template>
</template>

<style module>
.modeRow {
  display: flex;
  gap: 12px;
  align-items: flex-end;
}

.modeSlot {
  flex: 1 1 0;
  min-width: 0;
}

.fullWidthGroup {
  width: 100%;
}

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

.hlMismatch {
  background-color: rgba(220, 50, 50, 0.25);
  border-radius: 2px;
}
</style>
