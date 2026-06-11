<script setup lang="ts">
import type {
  PatternHalf,
  PatternParts,
} from "@platforma-open/milaboratories.peptide-profiling.model";
import { allPresets, getPreset } from "@platforma-open/milaboratories.peptide-profiling.model";
import type { ListOption, SimpleOption } from "@platforma-sdk/ui-vue";
import { PlBtnGroup, PlCheckbox, PlDropdown, PlTextField, PlTooltip } from "@platforma-sdk/ui-vue";
import { computed, reactive, ref, watch } from "vue";
import { useApp } from "../app";
import {
  assemblePattern,
  detectMismatches,
  generateR2fromR1,
  parsePattern,
  validateAnchor,
  validateRightTrim,
  validateTrim,
} from "../pattern";

const app = useApp();

// ── Local field state ──────────────────────────────────────────────────────

type HalfFields = {
  hasLeadingWildcard: boolean;
  hasHetSpacer: boolean;
  // Text representation of the heterogeneity spacer length: "5" or "4:8".
  hetSpacerLength: string | undefined;
  hasUmi: boolean;
  // Text representation of the UMI length: "10" or "10:14".
  umiLength: string | undefined;
  umiName: string | undefined;
  // Whether this read captures the peptide insert. When false, the assembled
  // half has no `(R<n>:...)` group — only UMI/anchor/spacer + wildcard. Useful
  // in paired-end layouts where the insert lives on the other read and this
  // one carries just UMI / quality information.
  hasInsert: boolean;
  insertName: string | undefined;
  leftAnchor: string | undefined;
  rightAnchor: string | undefined;
  rightTrim: number | undefined;
  // Text representation of the insert length: "21" or "18:21". Empty = variable
  // (`*`). Required when no 3' anchor is provided.
  insertLength: string | undefined;
};

const emptyHalf = (): HalfFields => ({
  hasLeadingWildcard: false,
  hasHetSpacer: false,
  hetSpacerLength: undefined,
  hasUmi: true, // default to UMI present — matches most existing workflows
  umiLength: undefined,
  umiName: undefined,
  hasInsert: true, // default: read carries the peptide insert
  insertName: undefined,
  leftAnchor: undefined,
  rightAnchor: undefined,
  rightTrim: undefined,
  insertLength: undefined,
});

const r1 = reactive<HalfFields>(emptyHalf());
const r2 = reactive<HalfFields>(emptyHalf());

// ── Preset selection ──────────────────────────────────────────────────────

const presetOptions = computed((): ListOption<string>[] =>
  allPresets.map((p) => ({
    value: p.id,
    label: p.vendor ? `${p.label} — ${p.vendor}` : p.label,
  })),
);

const selectedPreset = computed(() => getPreset(app.model.data.presetId));

const isUserConfigurablePreset = computed(() => selectedPreset.value?.userConfigurable === true);

/** When the preset declares `hasUmi`, the toggle is hidden and the value is
 *  locked to what the preset says. Returns undefined for presets that let the
 *  user choose. */
const presetForcedHasUmi = computed(() => selectedPreset.value?.hasUmi);

function setPresetId(id: string | undefined) {
  app.model.data.presetId = id;
  const p = getPreset(id);
  if (!p) return;
  if (p.userConfigurable) {
    // Seed defaults for the configurable editor. Preserve any existing user
    // input in the fields so a preset swap within the "generic" family
    // doesn't wipe work in progress.
    if (p.hasUmi !== undefined) {
      r1.hasUmi = p.hasUmi;
      r2.hasUmi = p.hasUmi;
    }
  } else {
    // Fixed kit preset: pattern is owned by the preset itself.
    app.model.data.pattern = p.pattern;
  }
}

// Lock hasUmi to the preset's declaration whenever it changes (covers load-from-saved).
watch(
  presetForcedHasUmi,
  (forced) => {
    if (forced === undefined) return;
    r1.hasUmi = forced;
    r2.hasUmi = forced;
  },
  { immediate: true },
);

// ── Editor mode (Add: raw text vs. Build: field-based) ────────────────────

type EditorMode = "write" | "build";
const editorModeOptions: SimpleOption<EditorMode>[] = [
  { value: "write", text: "Pattern string" },
  { value: "build", text: "Pattern builder" },
];
const editorMode = ref<EditorMode>("write");

const readTab = ref<"r1" | "r2">("r1");

// Paired-end vs single-end is derived from the selected input dataset
const isPairedEnd = computed<boolean>(() => app.model.outputs.inputIsPairedEnd === true);

// Snap the active read-tab back to Read 1 whenever the input becomes single-end
// while the user is parked on the Read 2 tab.
watch(isPairedEnd, (paired) => {
  if (!paired && readTab.value === "r2") readTab.value = "r1";
});

// ── Validation ─────────────────────────────────────────────────────────────

/** Insert length is mandatory when nothing flanks the insert on the 3' side —
 *  without a right anchor or fixed length the parser can't tell where the
 *  insert ends. */
const r1InsertLengthRequired = computed(() => !r1.rightAnchor?.trim());
const r2InsertLengthRequired = computed(() => !r2.rightAnchor?.trim());

const r1Errors = computed(() => ({
  umi: r1.hasUmi ? validateLengthSpec(r1.umiLength, true, { allowZero: true }) : null,
  leftAnchor: r1.leftAnchor ? validateAnchor(r1.leftAnchor) : null,
  rightAnchor: r1.rightAnchor ? validateAnchor(r1.rightAnchor) : null,
  hetSpacer: r1.hasHetSpacer ? validateLengthSpec(r1.hetSpacerLength, true) : null,
  insertLength: validateLengthSpec(r1.insertLength, r1InsertLengthRequired.value, {
    requiredMessage:
      "A specific insert length or a 3' anchor is needed to mark where the peptide ends",
  }),
}));

const r2HasAnyContent = computed(
  () =>
    (r2.hasUmi && !!r2.umiLength) ||
    !!r2.leftAnchor ||
    !!r2.rightAnchor ||
    r2.rightTrim !== undefined ||
    !!r2.insertLength ||
    r2.hasHetSpacer,
);

const r2Errors = computed(() => ({
  umi: r2.hasUmi ? validateLengthSpec(r2.umiLength, true, { allowZero: true }) : null,
  leftAnchor: r2.leftAnchor ? validateAnchor(r2.leftAnchor) : null,
  rightAnchor: r2.rightAnchor ? validateAnchor(r2.rightAnchor) : null,
  hetSpacer: r2.hasHetSpacer ? validateLengthSpec(r2.hetSpacerLength, true) : null,
  insertLength: validateLengthSpec(r2.insertLength, r2InsertLengthRequired.value, {
    requiredMessage:
      "A specific insert length or a 3' anchor is needed to mark where the peptide ends",
  }),
}));

/** Parse a length-spec string (e.g. "10" or "10:14"). Returns null for empty
 *  input, "invalid" when malformed, or the parsed range. When `allowZero` is
 *  set, a bare `"0"` parses to `{min:0,max:0}` — callers treat this as a
 *  "no value" sentinel (e.g. "no UMI on this read"). */
function parseLengthSpec(
  value: string | undefined,
  opts?: { allowZero?: boolean },
): { min: number; max: number } | null | "invalid" {
  if (!value || !value.trim()) return null;
  const m = /^(\d+)(?::(\d+))?$/.exec(value.trim());
  if (!m) return "invalid";
  const min = parseInt(m[1], 10);
  const floor = opts?.allowZero ? 0 : 1;
  if (!Number.isInteger(min) || min < floor) return "invalid";
  const max = m[2] !== undefined ? parseInt(m[2], 10) : min;
  if (!Number.isInteger(max) || max < min) return "invalid";
  return { min, max };
}

function formatLengthSpec(spec: { min: number; max: number } | undefined): string | undefined {
  if (!spec) return undefined;
  return spec.min === spec.max ? `${spec.min}` : `${spec.min}:${spec.max}`;
}

function validateLengthSpec(
  value: string | undefined,
  required: boolean,
  opts?: { allowZero?: boolean; requiredMessage?: string },
): string | null {
  const parsed = parseLengthSpec(value, opts);
  if (parsed === null)
    return required ? (opts?.requiredMessage ?? "Value or range required") : null;
  if (parsed === "invalid") {
    return opts?.allowZero
      ? "Use 0 to disable, a value like 10, or a range like 10:14"
      : "Use a value like 10 or a range like 10:14";
  }
  return null;
}

// ── Parse error (from main field) ──────────────────────────────────────────

const patternParseError = computed(() => {
  const p = app.model.data.pattern;
  if (!p) return null;
  const parsed = parsePattern(p);
  if (parsed === null) {
    return (
      "Invalid pattern. Anchor sequences must use DNA/IUPAC letters only " +
      "(A C G T M K R Y W S B D H V N, uppercase or lowercase). " +
      "Other valid characters: ^ * ( ) : { } > and \\ (separates Read 1 from Read 2). " +
      "UMI tags must be named UMI, UMI1, UMI2…; peptide tags R1, R2… All tag names must be unique."
    );
  }
  // The pattern must capture the peptide insert in at least one read,
  // otherwise mitool has nothing to extract.
  const r1HasInsert = parsed.r1.insertName !== undefined;
  const r2HasInsert = parsed.r2?.insertName !== undefined;
  if (!r1HasInsert && !r2HasInsert) {
    return "Pattern must capture the peptide insert in at least one read. Include a (R1:…) or (R2:…) tag.";
  }
  // Each insert capture needs a way to mark where the peptide ends —
  // a specific length or a 3' anchor.
  const halves = parsed.r2 ? [parsed.r1, parsed.r2] : [parsed.r1];
  for (const half of halves) {
    if (half.insertName === undefined) continue;
    if (half.insertLength === undefined && !half.rightAnchor) {
      const readLabel = half.insertName === "R2" ? "Read 2" : "Read 1";
      return `${readLabel} insert needs either a specific length or a 3' anchor to mark where the peptide ends.`;
    }
  }
  // mitool's `>{n}` trim counts the contiguous anchor chars to its left, which
  // a `*` resets — raise it here before the pattern reaches mitool (which would
  // otherwise fail with "Not enough characters to the left of the '>' pattern").
  for (const half of halves) {
    const trimErr = validateRightTrim(half);
    if (trimErr) return trimErr;
  }
  // Cross-check the pattern shape against the selected input dataset: a
  // paired-end pattern (with an R2 half) cannot run on a single-end input
  // because there is no Read 2 file to match against.
  if (parsed.r2 !== undefined && app.model.data.input && !isPairedEnd.value) {
    return "Pattern includes a Read 2 half but the selected input is single-end. Remove the R2 half or pick a paired-end input.";
  }
  // UMI-bearing presets require at least one read to actually carry a UMI.
  if (selectedPreset.value?.hasUmi === true) {
    const r1HasUmi = parsed.r1.umi !== undefined;
    const r2HasUmi = parsed.r2?.umi !== undefined;
    if (!r1HasUmi && !r2HasUmi) {
      return `Preset "${selectedPreset.value.label}" requires at least one read to carry a UMI. Set a UMI length on Read 1 or Read 2, or pick a preset without UMIs.`;
    }
  }
  return null;
});

// ── Helpers: fields ↔ PatternHalf ──────────────────────────────────────────

function insertLengthFromFields(
  f: HalfFields,
): number | { min: number; max: number } | undefined | "invalid" {
  const parsed = parseLengthSpec(f.insertLength);
  if (parsed === null) return undefined;
  if (parsed === "invalid") return "invalid";
  return parsed.min === parsed.max ? parsed.min : parsed;
}

function hetSpacerFromFields(f: HalfFields): { min: number; max: number } | undefined {
  if (!f.hasHetSpacer) return undefined;
  const parsed = parseLengthSpec(f.hetSpacerLength);
  if (parsed === null || parsed === "invalid") return undefined;
  return parsed;
}

function umiFromFields(f: HalfFields): { min: number; max: number } | undefined {
  if (!f.hasUmi) return undefined;
  const parsed = parseLengthSpec(f.umiLength, { allowZero: true });
  if (parsed === null || parsed === "invalid") return undefined;
  // Explicit "0" means no UMI on this read (even if the preset forces hasUmi).
  if (parsed.min === 0 && parsed.max === 0) return undefined;
  return parsed;
}

/** Whether the user has explicitly disabled UMI on this half by typing "0". */
function isUmiExplicitlyDisabled(f: HalfFields): boolean {
  return f.umiLength?.trim() === "0";
}

/** Strict: returns null when the half is not ready to be assembled. */
function fieldsToHalf(f: HalfFields, defaultInsertName: "R1" | "R2"): PatternHalf | null {
  const leftAnchor = f.leftAnchor?.trim() ?? "";
  const rightAnchor = f.hasInsert ? (f.rightAnchor?.trim() ?? "") : "";
  if (leftAnchor && validateAnchor(leftAnchor)) return null;
  if (rightAnchor && validateAnchor(rightAnchor)) return null;
  if (f.rightTrim !== undefined && rightAnchor && validateTrim(f.rightTrim, rightAnchor))
    return null;

  const umi = umiFromFields(f);
  // When hasUmi is on, the UMI length must be provided — unless the user
  // has explicitly typed "0" to disable UMI for this read.
  if (f.hasUmi && !umi && !isUmiExplicitlyDisabled(f)) return null;

  const hetSpacer = hetSpacerFromFields(f);
  if (f.hasHetSpacer && !hetSpacer) return null;

  if (!f.hasInsert) {
    return {
      hasLeadingWildcard: f.hasLeadingWildcard,
      hetSpacer,
      umi,
      leftAnchor,
      rightAnchor: "",
      rightTrim: undefined,
      umiName: f.umiName,
      insertName: undefined,
      insertLength: undefined,
    };
  }

  const insertLength = insertLengthFromFields(f);
  if (insertLength === "invalid") return null;
  // Insert length is mandatory when no right anchor is present
  if (!rightAnchor && insertLength === undefined) return null;

  return {
    hasLeadingWildcard: f.hasLeadingWildcard,
    hetSpacer,
    umi,
    leftAnchor,
    rightAnchor,
    rightTrim: f.rightTrim,
    umiName: f.umiName,
    insertName: f.insertName ?? defaultInsertName,
    insertLength,
  };
}

/** Lenient: returns a half with whatever fields are available — used for the
 *  live preview so the assembled pattern reflects current state even when
 *  incomplete. Returns null only when there's nothing distinguishing at all. */
function fieldsToHalfLenient(f: HalfFields, defaultInsertName: "R1" | "R2"): PatternHalf | null {
  const hasAny =
    f.hasLeadingWildcard ||
    f.hasHetSpacer ||
    (f.hasUmi && !!f.umiLength) ||
    !!f.leftAnchor ||
    !!f.rightAnchor ||
    f.rightTrim !== undefined ||
    !!f.insertLength ||
    f.hasInsert;
  if (!hasAny) return null;

  if (!f.hasInsert) {
    return {
      hasLeadingWildcard: f.hasLeadingWildcard,
      hetSpacer: hetSpacerFromFields(f),
      umi: umiFromFields(f),
      leftAnchor: f.leftAnchor?.trim() ?? "",
      rightAnchor: "",
      rightTrim: undefined,
      umiName: f.umiName,
      insertName: undefined,
      insertLength: undefined,
    };
  }

  const lenientInsert = insertLengthFromFields(f);
  return {
    hasLeadingWildcard: f.hasLeadingWildcard,
    hetSpacer: hetSpacerFromFields(f),
    umi: umiFromFields(f),
    leftAnchor: f.leftAnchor?.trim() ?? "",
    rightAnchor: f.rightAnchor?.trim() ?? "",
    rightTrim: f.rightTrim,
    umiName: f.umiName,
    insertName: f.insertName ?? defaultInsertName,
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
  const hetEq =
    (a.hetSpacer === undefined && b.hetSpacer === undefined) ||
    (a.hetSpacer !== undefined &&
      b.hetSpacer !== undefined &&
      a.hetSpacer.min === b.hetSpacer.min &&
      a.hetSpacer.max === b.hetSpacer.max);
  return (
    umiEq &&
    hetEq &&
    (a.hasLeadingWildcard === true) === (b.hasLeadingWildcard === true) &&
    (a.insertName !== undefined) === (b.insertName !== undefined) &&
    a.leftAnchor === b.leftAnchor &&
    a.rightAnchor === b.rightAnchor &&
    a.rightTrim === b.rightTrim &&
    insertLengthEquals(a.insertLength, b.insertLength)
  );
}

function setFieldsFromHalf(fields: HalfFields, h: PatternHalf) {
  fields.hasLeadingWildcard = h.hasLeadingWildcard === true;
  fields.hasHetSpacer = h.hetSpacer !== undefined;
  fields.hetSpacerLength = formatLengthSpec(h.hetSpacer);
  fields.hasUmi = h.umi !== undefined;
  fields.umiLength = formatLengthSpec(h.umi);
  fields.umiName = h.umiName;
  fields.hasInsert = h.insertName !== undefined;
  fields.insertName = h.insertName;
  fields.leftAnchor = h.leftAnchor || undefined;
  fields.rightAnchor = h.rightAnchor || undefined;
  fields.rightTrim = h.rightTrim;
  if (h.insertLength === undefined) {
    fields.insertLength = undefined;
  } else if (typeof h.insertLength === "number") {
    fields.insertLength = `${h.insertLength}`;
  } else {
    fields.insertLength = formatLengthSpec(h.insertLength);
  }
}

function clearHalf(fields: HalfFields) {
  Object.assign(fields, emptyHalf());
}

// ── Bidirectional sync ─────────────────────────────────────────────────────

const lastAssembled = ref<string | undefined>(undefined);

/** Whether Read 2's half is currently a straight mirror of Read 1's. Starts
 *  true (mirror is the default for a fresh template) and flips to false when
 *  we parse a pattern where Read 2 diverges from RC of Read 1 — e.g. the user
 *  pasted a custom paired-end pattern in Define mode. When false, the Read 1
 *  → Read 2 mirror watcher stops firing so the user's intentional divergence
 *  survives Define → Build round-trips and subsequent Read 1 edits. */
const r2FollowsR1 = ref<boolean>(true);

// Main field → accordion fields
watch(
  () => app.model.data.pattern,
  (pattern) => {
    if (pattern === lastAssembled.value) return;
    if (!pattern) {
      clearHalf(r1);
      clearHalf(r2);
      r2FollowsR1.value = true;
      return;
    }
    const parsed = parsePattern(pattern);
    if (!parsed) {
      app.model.data.patternParts = undefined;
      return;
    }

    app.model.data.patternParts = parsed;
    setFieldsFromHalf(r1, parsed.r1);

    if (parsed.r2) {
      setFieldsFromHalf(r2, parsed.r2);
      // Detect divergence: if the parsed Read 2 half doesn't equal what the
      // mirror would produce from the parsed Read 1 half, treat Read 2 as
      // user-customised and stop auto-mirroring until it is cleared.
      const expectedR2 = generateR2fromR1(parsed.r1);
      r2FollowsR1.value = halfEquals(parsed.r2, expectedR2);
    } else {
      clearHalf(r2);
      r2FollowsR1.value = true;
    }
  },
  { immediate: true },
);

function clearPattern() {
  lastAssembled.value = undefined;
  app.model.data.pattern = undefined;
  app.model.data.patternParts = undefined;
}

function reassembleFromFields() {
  const half1 = fieldsToHalfLenient(r1, "R1");
  if (!half1) {
    clearPattern();
    return;
  }

  let parts: PatternParts;
  if (!isPairedEnd.value) {
    parts = { r1: half1 };
  } else if (r2HasAnyContent.value) {
    const half2 = fieldsToHalfLenient(r2, "R2");
    parts = half2 ? { r1: half1, r2: half2 } : { r1: half1 };
  } else {
    parts = { r1: half1 };
  }

  const assembled = assemblePattern(parts);
  lastAssembled.value = assembled;
  app.model.data.pattern = assembled;

  const effectiveParts = parsePattern(assembled);
  app.model.data.patternParts = effectiveParts ?? parts;
  if (effectiveParts) {
    r1.rightTrim = effectiveParts.r1.rightTrim;
    if (effectiveParts.r2) r2.rightTrim = effectiveParts.r2.rightTrim;
  }
}

// Fields → pattern: fires when building a user-configurable preset.
watch(
  [r1, r2, isPairedEnd, () => app.model.data.useWildcards],
  () => {
    if (isUserConfigurablePreset.value && editorMode.value === "build") reassembleFromFields();
  },
  { deep: true },
);

// Switching to Build: reassemble if the raw text is invalid. Valid text is the source of truth.
watch(editorMode, (mode) => {
  if (mode === "build" && patternParseError.value) {
    r1.rightTrim = undefined;
    r2.rightTrim = undefined;
    reassembleFromFields();
  }
});

// Paired-end: the Read 2 half mirrors the Read 1 half by default. Anchor
// pairs are reverse-complemented; UMI, spacer, insert length are copied.
// User edits to Read 2 persist until the next Read 1 change. Only fires in
// Build mode — in Define mode the raw pattern text is authoritative and
// Read 2 state comes from parsing it. Also skipped when Read 2 has been
// explicitly diverged (e.g. the user pasted a non-mirror pattern in Define
// mode), so the round-trip Define → Build preserves the custom Read 2.
watch(
  [isPairedEnd, r1],
  () => {
    if (!isPairedEnd.value) return;
    if (editorMode.value !== "build") return;
    if (!r2FollowsR1.value) return;
    if (!r1.rightAnchor) return; // need Read 1's 3' anchor to derive Read 2's 5' anchor
    const half1 = fieldsToHalf(r1, "R1");
    if (!half1) return;
    setFieldsFromHalf(r2, generateR2fromR1(half1));
  },
  { deep: true, immediate: true },
);

// ── Pattern preview ───────────────────────────────────────────────────────

type Segment = { text: string; hl?: "mismatch" };

/** Break an anchor string into runs of mismatch/match so each run can be
 *  rendered with (or without) the highlight class. */
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

function formatInsertLength(insertLength: PatternHalf["insertLength"]): string {
  if (insertLength === undefined) return "*";
  if (typeof insertLength === "number") return `N{${insertLength}}`;
  return insertLength.min === insertLength.max
    ? `N{${insertLength.min}}`
    : `N{${insertLength.min}:${insertLength.max}}`;
}

function formatRange(r: { min: number; max: number } | undefined): string {
  if (!r) return "";
  return r.min === r.max ? `N{${r.min}}` : `N{${r.min}:${r.max}}`;
}

const previewSegments = computed((): Segment[] => {
  const half1 = fieldsToHalfLenient(r1, "R1");
  if (!half1) return [];

  const r1Prefix =
    "^" +
    (half1.hasLeadingWildcard ? "*" : "") +
    (half1.hetSpacer ? formatRange(half1.hetSpacer) : "");
  const r1UmiSegment = half1.umi ? `(${half1.umiName ?? "UMI"}:${formatRange(half1.umi)})` : "";
  const r1Trim = half1.rightTrim !== undefined ? `>{${half1.rightTrim}}` : "";

  const half2: PatternHalf | null = isPairedEnd.value
    ? r2HasAnyContent.value
      ? fieldsToHalfLenient(r2, "R2")
      : null
    : null;

  // Divergence highlighting: when paired-end, compare Read 2's anchors to
  // what they would be if auto-generated (reverse-complement of Read 1's
  // anchors). Positions that differ are painted red on BOTH halves so the
  // user can see exactly where the two reads stop being mirrors of each
  // other.
  let r2LeftMismatch = new Set<number>();
  let r2RightMismatch = new Set<number>();
  let r1LeftMirror = new Set<number>();
  let r1RightMirror = new Set<number>();
  if (half2) {
    const refAuto = generateR2fromR1(half1);
    r2LeftMismatch = new Set(
      detectMismatches(half2.leftAnchor, refAuto.leftAnchor).map((m) => m.index),
    );
    r2RightMismatch = new Set(
      detectMismatches(half2.rightAnchor, refAuto.rightAnchor).map((m) => m.index),
    );
    // Read 2 leftAnchor = RC(Read 1 rightAnchor); mirror indices are reversed.
    const r1RightLen = half1.rightAnchor.length;
    r1RightMirror = new Set(
      [...r2LeftMismatch].map((i) => r1RightLen - 1 - i).filter((i) => i >= 0),
    );
    // Read 2 rightAnchor = RC(Read 1 leftAnchor); mirror indices are reversed.
    const r1LeftLen = half1.leftAnchor.length;
    r1LeftMirror = new Set(
      [...r2RightMismatch].map((i) => r1LeftLen - 1 - i).filter((i) => i >= 0),
    );
  }

  const r1Part: Segment[] = [
    { text: r1Prefix + r1UmiSegment },
    ...buildAnchorSegments(half1.leftAnchor, r1LeftMirror),
    ...(half1.insertName !== undefined
      ? [
          {
            text: `(${half1.insertName}:${formatInsertLength(half1.insertLength)})`,
          } as Segment,
          ...buildAnchorSegments(half1.rightAnchor, r1RightMirror),
        ]
      : []),
    { text: `${r1Trim}*` },
  ];

  if (!half2) return r1Part;

  const r2Prefix =
    "^" +
    (half2.hasLeadingWildcard ? "*" : "") +
    (half2.hetSpacer ? formatRange(half2.hetSpacer) : "");
  const r2UmiSegment = half2.umi ? `(${half2.umiName ?? "UMI2"}:${formatRange(half2.umi)})` : "";
  const r2Trim = half2.rightTrim !== undefined ? `>{${half2.rightTrim}}` : "";

  return [
    ...r1Part,
    { text: "\\" },
    { text: r2Prefix + r2UmiSegment },
    ...buildAnchorSegments(half2.leftAnchor, r2LeftMismatch),
    ...(half2.insertName !== undefined
      ? [
          {
            text: `(${half2.insertName}:${formatInsertLength(half2.insertLength)})`,
          } as Segment,
          ...buildAnchorSegments(half2.rightAnchor, r2RightMismatch),
        ]
      : []),
    { text: `${r2Trim}*` },
  ];
});
</script>

<template>
  <!-- Preset dropdown is always visible and is the only source of truth for which kit/template to run. -->
  <PlDropdown
    :model-value="app.model.data.presetId"
    :options="presetOptions"
    label="Preset"
    :required="true"
    :error="!selectedPreset ? 'Select a preset' : undefined"
    clearable
    @update:model-value="setPresetId"
  />

  <!-- User-configurable preset: unlock the full Add/Build editor. -->
  <template v-if="isUserConfigurablePreset">
    <PlBtnGroup v-model="editorMode" :options="editorModeOptions" class="fullWidthGroup" />

    <!-- Add mode: raw tag pattern text -->
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
      <div v-if="previewSegments.length" class="preview">
        <span
          v-for="(seg, i) in previewSegments"
          :key="i"
          :class="{ hlMismatch: seg.hl === 'mismatch' }"
          >{{ seg.text }}</span
        >
      </div>

      <!-- Read tabs. Read 2 tab appears only when the selected input dataset
           is paired-end (derived from the input's readIndex axis). -->
      <div class="readTabs">
        <button :class="['readTab', { readTabActive: readTab === 'r1' }]" @click="readTab = 'r1'">
          Read 1
        </button>
        <button
          v-if="isPairedEnd"
          :class="['readTab', { readTabActive: readTab === 'r2' }]"
          @click="readTab = 'r2'"
        >
          Read 2
        </button>
      </div>

      <!-- Read 1 fields (always visible; gated by tab when paired-end) -->
      <template v-if="!isPairedEnd || readTab === 'r1'">
        <div style="display: flex; align-items: center; gap: 4px">
          <PlCheckbox v-model="r1.hasLeadingWildcard">Leading wildcard</PlCheckbox>
          <PlTooltip class="info">
            <template #tooltip>
              Prepend <code>^*</code> to the pattern. Allows any upstream content before the
              informative part of the read (e.g. variable-length adapter or barcode leftover from
              demultiplexing).
            </template>
          </PlTooltip>
        </div>

        <!-- Heterogeneity spacer — only shown when this read has a UMI. -->
        <div v-if="r1.hasUmi" style="display: flex; align-items: center; gap: 4px">
          <PlCheckbox v-model="r1.hasHetSpacer">Has heterogeneity spacer</PlCheckbox>
          <PlTooltip class="info">
            <template #tooltip>
              A fixed or variable-length <code>N</code> span at the read start used to diversify
              Illumina cluster signal. Not a molecular barcode — its bases are non-informative and
              hence discarded.
            </template>
          </PlTooltip>
        </div>
        <PlTextField
          v-if="r1.hasUmi && r1.hasHetSpacer"
          :model-value="r1.hetSpacerLength"
          label="Spacer length (value or range)"
          placeholder="e.g. 5 or 4:8"
          :required="true"
          :error="r1Errors.hetSpacer ?? undefined"
          @update:model-value="(v) => (r1.hetSpacerLength = v || undefined)"
        >
          <template #tooltip>
            Type a single value (e.g. <code>5</code>) for a fixed-length spacer, or a range (e.g.
            <code>4:8</code>) for a variable spacer.
          </template>
        </PlTextField>

        <PlCheckbox v-if="presetForcedHasUmi === undefined" v-model="r1.hasUmi">
          Has UMI
          <template #tooltip>Uncheck for libraries without a molecular barcode.</template>
        </PlCheckbox>
        <PlTextField
          v-if="r1.hasUmi"
          :model-value="r1.umiLength"
          label="UMI length (value or range)"
          placeholder="e.g. 0, 10, or 10:14"
          :required="true"
          :error="r1Errors.umi ?? undefined"
          @update:model-value="(v) => (r1.umiLength = v || undefined)"
        >
          <template #tooltip>
            Type a single value (e.g. <code>10</code>) for a fixed-length UMI, or a range (e.g.
            <code>10:14</code>) for a variable UMI length. Type <code>0</code> to disable UMI on
            this read (useful in paired-end layouts where only one read carries the UMI).
          </template>
        </PlTextField>

        <PlTextField
          :model-value="r1.leftAnchor"
          label="5' anchor"
          placeholder="e.g. tttctattctcactct"
          :error="r1Errors.leftAnchor ?? undefined"
          @update:model-value="(v) => (r1.leftAnchor = v || undefined)"
        >
          <template #tooltip>
            Constant sequence flanking the insert on its 5' side (lowercase = fuzzy match). Leave
            empty if the insert is not preceded by any known sequence.
          </template>
        </PlTextField>

        <div v-if="isPairedEnd" style="display: flex; align-items: center; gap: 4px">
          <PlCheckbox v-model="r1.hasInsert">Has insert</PlCheckbox>
          <PlTooltip class="info">
            <template #tooltip>
              Uncheck if Read 1 does not carry the peptide insert. Useful in paired-end layouts
              where the peptide is only captured on Read 2 and Read 1 carries just the UMI.
            </template>
          </PlTooltip>
        </div>

        <PlTextField
          v-if="r1.hasInsert"
          :model-value="r1.insertLength"
          label="Insert length (value or range)"
          placeholder="e.g. 21 or 18:21"
          :required="r1InsertLengthRequired"
          :error="r1Errors.insertLength ?? undefined"
          @update:model-value="(v) => (r1.insertLength = v || undefined)"
        >
          <template #tooltip>
            <b>Optional.</b> If you leave this empty, the insert will be whatever sits between the
            5' and 3' anchors — whatever length that turns out to be.<br /><br />
            Fill it in to fix the peptide length: type a single number like <code>21</code> for a
            library with a fixed-length peptide (e.g. a 7-mer = 21 nt), or a range like
            <code>18:21</code> when the library mixes peptides of different lengths (e.g. 6- to
            7-mers).<br /><br />
            Only becomes required when you haven't provided a 3' anchor — without either a length or
            a 3' anchor, there's no way to know where the insert ends.
          </template>
        </PlTextField>

        <PlTextField
          v-if="r1.hasInsert"
          :model-value="r1.rightAnchor"
          label="3' anchor"
          placeholder="e.g. ggtggaggttcggccgaa"
          :error="r1Errors.rightAnchor ?? undefined"
          @update:model-value="(v) => (r1.rightAnchor = v || undefined)"
        >
          <template #tooltip>
            Constant sequence flanking the insert on its 3' side. Leave empty only if the insert has
            a fixed or ranged length — in that case the insert length above becomes mandatory
            (lowercase = fuzzy match).
          </template>
        </PlTextField>
      </template>

      <!-- Read 2 fields (paired-end only). Fields start mirrored from Read 1
           (anchors reverse-complemented); any edit here persists until Read 1
           changes. -->
      <template v-if="isPairedEnd && readTab === 'r2'">
        <div style="display: flex; align-items: center; gap: 4px">
          <PlCheckbox v-model="r2.hasLeadingWildcard">Leading wildcard</PlCheckbox>
          <PlTooltip class="info">
            <template #tooltip>Prepend <code>^*</code> to Read 2's pattern.</template>
          </PlTooltip>
        </div>

        <div v-if="r2.hasUmi" style="display: flex; align-items: center; gap: 4px">
          <PlCheckbox v-model="r2.hasHetSpacer">Has heterogeneity spacer</PlCheckbox>
          <PlTooltip class="info">
            <template #tooltip>Anonymous N-span at the start of Read 2.</template>
          </PlTooltip>
        </div>
        <PlTextField
          v-if="r2.hasUmi && r2.hasHetSpacer"
          :model-value="r2.hetSpacerLength"
          label="Spacer length (value or range)"
          placeholder="e.g. 5 or 4:8"
          :required="true"
          :error="r2Errors.hetSpacer ?? undefined"
          @update:model-value="(v) => (r2.hetSpacerLength = v || undefined)"
        />

        <PlCheckbox v-if="presetForcedHasUmi === undefined" v-model="r2.hasUmi">
          Has UMI
          <template #tooltip>Uncheck for libraries without a molecular barcode.</template>
        </PlCheckbox>
        <PlTextField
          v-if="r2.hasUmi"
          :model-value="r2.umiLength"
          label="UMI length (value or range)"
          placeholder="e.g. 0, 10, or 10:14"
          :required="true"
          :error="r2Errors.umi ?? undefined"
          @update:model-value="(v) => (r2.umiLength = v || undefined)"
        >
          <template #tooltip>
            Type a single value (e.g. <code>10</code>) for a fixed-length UMI, or a range (e.g.
            <code>10:14</code>) for a variable UMI. Type <code>0</code> to disable UMI on this read
            (useful in paired-end layouts where only one read carries the UMI).
          </template>
        </PlTextField>

        <PlTextField
          :model-value="r2.leftAnchor"
          label="5' anchor"
          placeholder="RC of Read 1's 3' anchor"
          :error="r2Errors.leftAnchor ?? undefined"
          @update:model-value="(v) => (r2.leftAnchor = v || undefined)"
        >
          <template #tooltip>
            Constant sequence on the 5' side of the insert as it appears on Read 2. Because Read 2
            is sequenced in the opposite direction, this is the
            <b>reverse complement of Read 1's 3' anchor</b> — pre-filled for you. Edit only if your
            Read 2 primer diverges from the mirror layout (lowercase letters are fuzzy-matched).
          </template>
        </PlTextField>

        <div style="display: flex; align-items: center; gap: 4px">
          <PlCheckbox v-model="r2.hasInsert">Has insert</PlCheckbox>
          <PlTooltip class="info">
            <template #tooltip>
              Uncheck if Read 2 does not carry the peptide insert — Read 2 will provide only UMI /
              flanks / quality information.
            </template>
          </PlTooltip>
        </div>

        <PlTextField
          v-if="r2.hasInsert"
          :model-value="r2.insertLength"
          label="Insert length (value or range)"
          placeholder="e.g. 21 or 18:21"
          :required="r2InsertLengthRequired"
          :error="r2Errors.insertLength ?? undefined"
          @update:model-value="(v) => (r2.insertLength = v || undefined)"
        >
          <template #tooltip>
            <b>Optional.</b> If you leave this empty, the insert will be whatever sits between Read
            2's 5' and 3' anchors.<br /><br />
            Fill it in with a single number like <code>21</code> for a fixed-length peptide, or a
            range like <code>18:21</code> for a mixed-length library.<br /><br />
            Only becomes required when you haven't provided a 3' anchor.
          </template>
        </PlTextField>

        <PlTextField
          v-if="r2.hasInsert"
          :model-value="r2.rightAnchor"
          label="3' anchor"
          placeholder="RC of Read 1's 5' anchor"
          :error="r2Errors.rightAnchor ?? undefined"
          @update:model-value="(v) => (r2.rightAnchor = v || undefined)"
        >
          <template #tooltip>
            Constant sequence on the 3' side of the insert as it appears on Read 2 — the
            <b>reverse complement of Read 1's 5' anchor</b>, pre-filled for you. Leave empty only if
            the insert has a fixed or ranged length (set above); otherwise this anchor marks where
            the peptide ends on Read 2 (lowercase letters are fuzzy-matched).
          </template>
        </PlTextField>
      </template>
    </template>
  </template>
</template>

<style scoped>
.fullWidthGroup {
  width: 100%;
}

.readTabs {
  display: flex;
  align-items: center;
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
