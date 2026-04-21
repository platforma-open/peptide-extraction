// Shared segment definitions for the Peptide Recovery chart (detail view) and
// its compact cell (main sample table). Keeping one source of truth so labels,
// colors, and read-level math stay identical across both views.

import type { Color } from "@platforma-sdk/ui-vue";
import { Gradient } from "@platforma-sdk/ui-vue";
import type { FunnelEntry } from "./pipelineFunnel";

const viridis = Gradient("viridis");
const magma = Gradient("magma");

// Green for retained reads (matches the viridis "Success" shade used in
// mixcr-clonotyping's alignment bar). Red shades span magma indices 3–6 — the
// palette's red/orange band — to keep failure categories visually grouped.
const colors = {
  recovered: viridis.getNthOf(2, 5),
  patternMismatch: magma.getNthOf(3, 9),
  tagQuality: magma.getNthOf(4, 9),
  singleton: magma.getNthOf(5, 9),
  assembly: magma.getNthOf(6, 9),
};

export type RecoverySegment = {
  key: string;
  label: string;
  value: number;
  color: Color;
  description: string;
};

/**
 * Decompose the pipeline funnel into 5 read-level segments that sum to the
 * total input reads. Returns undefined if no input reads are available.
 */
export function buildRecoverySegments(
  funnel: FunnelEntry[] | undefined,
): { total: number; segments: RecoverySegment[] } | undefined {
  if (!funnel?.length) return undefined;

  const input = funnel.find((e) => e.step === "input");
  if (!input) return undefined;
  const total = input.reads;
  if (total === 0) return undefined;

  const parse = funnel.find((e) => e.step === "parse");
  const refine = funnel.find((e) => e.step === "refine");
  const output = funnel.find((e) => e.step === "output");

  const matched = parse?.reads ?? 0;
  const patternMismatch = Math.max(0, total - matched);

  // No-UMI pipeline: funnel has no `refine` entry. All matched reads are
  // recovered; the only loss is pattern mismatch.
  const hasUmi = refine !== undefined;
  if (!hasUmi) {
    const segments: RecoverySegment[] = [
      {
        key: "recovered",
        label: "Successfully extracted",
        value: matched,
        color: colors.recovered,
        description: "Reads that matched the tag pattern and yielded a valid peptide.",
      },
      {
        key: "patternMismatch",
        label: "No tag pattern match",
        value: patternMismatch,
        color: colors.patternMismatch,
        description: "Reads that did not match the tag pattern.",
      },
    ];
    return { total, segments };
  }

  const refineOut = refine.reads;
  const readsInContigs = output?.readsInContigs ?? 0;
  const readsDiscarded = output?.readsDiscarded ?? 0;

  // Read-level decomposition. By construction:
  //   recovered + patternMismatch + tagQuality + singleton + assembly = total
  const recovered = readsInContigs;
  const tagQuality = Math.max(0, matched - refineOut);
  const singleton = Math.max(0, refineOut - readsInContigs - readsDiscarded);
  const assembly = readsDiscarded;

  const segments: RecoverySegment[] = [
    {
      key: "recovered",
      label: "Successfully extracted",
      value: recovered,
      color: colors.recovered,
      description: "Reads that contributed to a valid peptide consensus.",
    },
    {
      key: "patternMismatch",
      label: "No tag pattern match",
      value: patternMismatch,
      color: colors.patternMismatch,
      description: "Reads that did not match the tag pattern.",
    },
    {
      key: "tagQuality",
      label: "Low-quality UMI",
      value: tagQuality,
      color: colors.tagQuality,
      description:
        "Reads whose UMI barcode failed mitool's tag-quality filter (e.g. ambiguous bases or low Q-score).",
    },
    {
      key: "singleton",
      label: "Insufficient UMI coverage",
      value: singleton,
      color: colors.singleton,
      description: "Reads in UMI groups below the min-reads-per-consensus threshold.",
    },
    {
      key: "assembly",
      label: "Discordant UMI group",
      value: assembly,
      color: colors.assembly,
      description:
        "Read pairs whose R1 or R2 disagreed with their UMI group's consensus — typically from sequencing errors or R2 truncation.",
    },
  ];

  return { total, segments };
}

export type RecoveryChartDatum = {
  label: string;
  value: number;
  color: Color;
  description: string;
};

/**
 * Build the `data` array consumed by PlChartStackedBar and
 * PlChartStackedBarCompact. Descriptions include the read count and percentage.
 */
export function buildRecoveryChartData(
  funnel: FunnelEntry[] | undefined,
): RecoveryChartDatum[] | undefined {
  const result = buildRecoverySegments(funnel);
  if (!result) return undefined;
  const { total, segments } = result;
  return segments.map((s) => ({
    label: s.label,
    value: s.value,
    color: s.color,
    description: [
      s.label,
      s.description,
      `Reads: ${s.value.toLocaleString()} (${((s.value / total) * 100).toFixed(1)}%)`,
    ].join("\n"),
  }));
}
