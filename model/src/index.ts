import type { InferOutputsType, PlDataTableStateV2, PlRef } from "@platforma-sdk/model";
import {
  BlockModelV3,
  DataModelBuilder,
  createPlDataTableStateV2,
  createPlDataTableV2,
  isPColumnSpec,
  parseResourceMap,
} from "@platforma-sdk/model";
import type { PatternParts } from "./pattern";
import { applyWildcards, parsePattern } from "./pattern";
import { getPreset } from "./presets";

export { parsePattern } from "./pattern";
export type { LengthRange, PatternHalf, PatternParts } from "./pattern";
export { allPresets, getPreset, presetsById } from "./presets";
export type { Preset } from "./presets";

export type StopCodonType = "amber" | "ochre" | "opal";

export type StopCodonReplacements = {
  amber?: string;
  ochre?: string;
  opal?: string;
};

export type BlockData = {
  defaultBlockLabel?: string;
  customBlockLabel?: string;
  input?: PlRef;
  presetId?: string;
  pattern?: string;
  patternParts?: PatternParts;
  useWildcards?: boolean;
  unstranded?: boolean;
  minReadsPerConsensus?: number;
  minUmiQuality?: number;
  errorBudget?: number;
  maxIndels?: number;
  autoR1OnlyAssembly?: boolean;
  filterInvalidPeptides?: boolean;
  // No-UMI runs only: drop variants observed in only one read.
  removeReadSingletons?: boolean;
  /** Mirrored from the `inputIsPairedEnd` model output by the UI so `.args()`
   *  can validate the pattern shape against the input. `undefined` means
   *  pairedness is not (yet) known — the cross-check is skipped in that case. */
  inputIsPairedEnd?: boolean;
  stopCodonTypes?: StopCodonType[];
  stopCodonReplacements?: StopCodonReplacements;
  perProcessMemGB?: number;
  perProcessCPUs?: number;
  qcTableState: PlDataTableStateV2;
  resultsTableState: PlDataTableStateV2;
};

export const ProgressPrefix = "[==PROGRESS==]";

export const ProgressPattern =
  /(?<stage>[^:]*):(?: *(?<progress>[0-9.]+)%)?(?: *ETA: *(?<eta>.+))?/;

type BlockDataV1 = Omit<BlockData, "minUmiQuality">;

const dataModel = new DataModelBuilder()
  .from<BlockDataV1>("v1")
  .migrate<BlockData>("v2", (v1) => ({ ...v1, minUmiQuality: 20 }))
  .init(() => ({
    minReadsPerConsensus: 2,
    minUmiQuality: 20,
    errorBudget: 10,
    maxIndels: 1,
    autoR1OnlyAssembly: true,
    filterInvalidPeptides: true,
    removeReadSingletons: true,
    qcTableState: createPlDataTableStateV2(),
    resultsTableState: createPlDataTableStateV2(),
    useWildcards: true,
  }));

export const platforma = BlockModelV3.create(dataModel)

  .retentiveOutput("inputOptions", (ctx) => {
    return ctx.resultPool.getOptions((v) => {
      if (!isPColumnSpec(v)) return false;
      const domain = v.domain;
      return (
        v.name === "pl7.app/sequencing/data" &&
        (v.valueType as string) === "File" &&
        domain !== undefined &&
        (domain["pl7.app/fileExtension"] === "fastq" ||
          domain["pl7.app/fileExtension"] === "fastq.gz")
      );
    });
  })

  .output("started", (ctx) => ctx.outputs !== undefined)

  .output("isRunning", (ctx) => ctx.outputs?.getIsReadyOrError() === false)

  .output("stepLogs", (ctx) => {
    return ctx.outputs !== undefined
      ? parseResourceMap(ctx.outputs?.resolve("stepLogs"), (acc) => acc.getLogHandle(), false)
      : undefined;
  })

  // Populates the sample list as soon as processColumn enumerates samples.
  // Uses the flat parseLogStream output so the signal fires before any sample
  // finishes parsing
  .output("sampleKeys", (ctx) => {
    const acc = ctx.outputs?.resolve("parseLogStream");
    if (!acc || !acc.getInputsLocked()) return undefined;
    return parseResourceMap(acc, (a) => a.getLogHandle(), true);
  })

  .output("progress", (ctx) => {
    return ctx.outputs !== undefined
      ? parseResourceMap(
          ctx.outputs?.resolve("stepLogs"),
          (acc) => acc.getProgressLogWithInfo(ProgressPrefix),
          false,
        )
      : undefined;
  })

  // Live parse progress — reads the flat parseLogStream Log resource, which
  // is registered the moment mitool-pipeline's body runs (before parse
  // completes).
  .output("parseProgress", (ctx) => {
    return ctx.outputs !== undefined
      ? parseResourceMap(
          ctx.outputs?.resolve("parseLogStream"),
          (acc) => acc.getProgressLogWithInfo(ProgressPrefix),
          false,
        )
      : undefined;
  })

  .output("inputIsPairedEnd", (ctx): boolean | undefined => {
    const inputRef = ctx.data.input;
    if (inputRef === undefined) return undefined;
    const inputSpec = ctx.resultPool
      .getSpecs()
      .entries.find(
        (obj) => obj.ref.blockId === inputRef.blockId && obj.ref.name === inputRef.name,
      )?.obj;
    if (inputSpec === undefined || !isPColumnSpec(inputSpec)) return undefined;
    const axis = inputSpec.axesSpec.find((a) => a.name === "pl7.app/sequencing/readIndex");
    const raw = axis?.domain?.["pl7.app/readIndices"];
    if (typeof raw !== "string") return undefined;
    try {
      const indices = JSON.parse(raw);
      return Array.isArray(indices) && indices.includes("R2");
    } catch {
      return undefined;
    }
  })

  .output("sampleLabels", (ctx): Record<string, string> | undefined => {
    const inputRef = ctx.data.input;
    if (inputRef === undefined) return undefined;
    const inputSpec = ctx.resultPool
      .getSpecs()
      .entries.find(
        (obj) => obj.ref.blockId === inputRef.blockId && obj.ref.name === inputRef.name,
      )?.obj;
    if (inputSpec === undefined || !isPColumnSpec(inputSpec)) return undefined;
    const sampleAxisSpec = inputSpec.axesSpec[0];

    const sampleLabelsObj = ctx.resultPool.getData().entries.find((f) => {
      const spec = f.obj.spec;
      if (!isPColumnSpec(spec)) return false;
      if (spec.name !== "pl7.app/label" || spec.axesSpec.length !== 1) return false;
      const axisSpec = spec.axesSpec[0];
      if (axisSpec.name !== sampleAxisSpec.name) return false;
      if (sampleAxisSpec.domain === undefined || Object.keys(sampleAxisSpec.domain).length === 0)
        return true;
      if (axisSpec.domain === undefined) return false;
      for (const [domainName, domainValue] of Object.entries(sampleAxisSpec.domain))
        if (axisSpec.domain[domainName] !== domainValue) return false;
      return true;
    });

    if (sampleLabelsObj === undefined) return undefined;

    return Object.fromEntries(
      Object.entries(
        sampleLabelsObj.obj.data.getDataAsJson<{ data: Record<string, string> }>().data,
      ).map((e) => [JSON.parse(e[0])[0], e[1]]),
    ) as Record<string, string>;
  })

  .output("aaComposition", (ctx) => {
    return ctx.outputs
      ?.resolve({ field: "aaComposition", assertFieldType: "Input", allowPermanentAbsence: true })
      ?.getFileHandle();
  })

  .output("seqLogo", (ctx) => {
    return ctx.outputs
      ?.resolve({ field: "seqLogo", assertFieldType: "Input", allowPermanentAbsence: true })
      ?.getFileHandle();
  })

  .output("qcChecks", (ctx) => {
    return ctx.outputs
      ?.resolve({ field: "qcChecks", assertFieldType: "Input", allowPermanentAbsence: true })
      ?.getFileHandle();
  })

  .output("pipelineFunnel", (ctx) => {
    return ctx.outputs
      ?.resolve({ field: "pipelineFunnel", assertFieldType: "Input", allowPermanentAbsence: true })
      ?.getFileHandle();
  })

  .output("distributions", (ctx) => {
    return ctx.outputs
      ?.resolve({ field: "distributions", assertFieldType: "Input", allowPermanentAbsence: true })
      ?.getFileHandle();
  })

  .outputWithStatus("peptideTable", (ctx) => {
    const pCols = ctx.outputs?.resolve("peptides")?.getPColumns();
    if (pCols === undefined) {
      return undefined;
    }
    return createPlDataTableV2(ctx, pCols, ctx.data.resultsTableState);
  })

  .outputWithStatus("qcReportTable", (ctx) => {
    const pCols = ctx.outputs
      ?.resolve({ field: "qcReportTable", assertFieldType: "Input", allowPermanentAbsence: true })
      ?.getPColumns();
    if (pCols === undefined) {
      return undefined;
    }
    return createPlDataTableV2(ctx, pCols, ctx.data.qcTableState);
  })

  .sections((_ctx) => [
    { type: "link", href: "/", label: "Main" },
    { type: "link", href: "/qc", label: "QC Report Table" },
  ])

  .args((data) => {
    if (!data.input) throw new Error("Input dataset is required");
    const preset = getPreset(data.presetId);
    if (!preset) throw new Error("Select a preset");
    // Fixed-kit presets carry the pattern directly. User-configurable presets
    // (e.g. custom amplicon) let the user fill in a form and the assembled
    // pattern lives in data.pattern.
    const effectiveSourcePattern = preset.userConfigurable ? data.pattern : preset.pattern;
    if (!effectiveSourcePattern) throw new Error("Tag pattern is required");
    const patternParts = parsePattern(effectiveSourcePattern);
    if (!patternParts)
      throw new Error(
        "Tag pattern is invalid. For each read must have the shape " +
          "^[*][(UMI:N{min[:max]})][leftAnchor](R1:*|N{n}|N{min:max})[rightAnchor][>{trim}]*. " +
          "UMI captures are optional. Peptide (R) captures can be variable (*), fixed N{n}, or ranged N{min:max}. " +
          "UMI tags are named UMI, UMI1, UMI2, etc.; peptide tags R1, R2, etc. All defined tag names must be unique.",
      );

    const halves = patternParts.r2 ? [patternParts.r1, patternParts.r2] : [patternParts.r1];

    // At least one half must carry the peptide insert (R-capture). Without it
    // there is nothing to extract — mitool would yield an empty peptide table.
    const r1HasInsert = patternParts.r1.insertName !== undefined;
    const r2HasInsert = patternParts.r2?.insertName !== undefined;
    if (!r1HasInsert && !r2HasInsert) {
      throw new Error(
        "Pattern must capture the peptide insert in at least one read. " +
          'Enable "Has insert" on Read 1 or Read 2 in Build mode, ' +
          "or include a (R1:…) or (R2:…) tag in your pattern.",
      );
    }

    // Each insert capture needs a way to mark where the peptide ends —
    // either a specific length or a 3' anchor. Without one, the pattern
    // matches any trailing bases and the parser can't tell the peptide apart
    // from downstream sequence.
    for (const half of halves) {
      if (half.insertName === undefined) continue;
      if (half.insertLength === undefined && !half.rightAnchor) {
        const readLabel = half.insertName === "R2" ? "Read 2" : "Read 1";
        throw new Error(
          `${readLabel} insert needs either a specific length or a 3' anchor to mark where the peptide ends.`,
        );
      }
    }

    // Presets that declare hasUmi require at least one read to carry a UMI.
    if (preset.hasUmi === true) {
      const r1HasUmi = patternParts.r1.umi !== undefined;
      const r2HasUmi = patternParts.r2?.umi !== undefined;
      if (!r1HasUmi && !r2HasUmi) {
        throw new Error(
          `Preset "${preset.label}" requires at least one read to carry a UMI. ` +
            "Set a UMI length on Read 1 or Read 2, or pick a preset without UMIs.",
        );
      }
    }

    // Anchor characters must be DNA letters or IUPAC ambiguity codes
    const dnaIupacRe = /^[ACGTacgtMKRYWSBDHVNmkrywsbdhvn]*$/;
    for (const half of halves) {
      for (const anchor of [half.leftAnchor, half.rightAnchor]) {
        if (anchor && !dnaIupacRe.test(anchor)) {
          throw new Error(
            "Anchor sequences must use DNA letters or IUPAC codes only " +
              "(A, C, G, T, M, K, R, Y, W, S, B, D, H, V, N — uppercase or lowercase).",
          );
        }
      }
    }

    // Stop-codon replacement: every selected stop type must have an AA chosen,
    // otherwise the user's selection is silently a no-op.
    const stopTypeLabels: Record<StopCodonType, string> = {
      amber: "Amber (TAG)",
      ochre: "Ochre (TAA)",
      opal: "Opal/Umber (TGA)",
    };
    for (const t of data.stopCodonTypes ?? []) {
      const aa = data.stopCodonReplacements?.[t];
      if (!aa) {
        throw new Error(`Pick the amino acid that replaces ${stopTypeLabels[t]}.`);
      }
    }

    // Pattern shape must match the input dataset's read structure
    if (patternParts.r2 !== undefined && data.inputIsPairedEnd === false) {
      throw new Error(
        "Pattern includes a Read 2 half but the selected input is single-end. " +
          "Remove the R2 half or pick a paired-end input.",
      );
    }

    // UMI QC fields must be populated when the pattern carries a UMI.
    const hasUmi = patternParts.r1.umi !== undefined || patternParts.r2?.umi !== undefined;
    if (hasUmi) {
      const missing: string[] = [];
      if (data.minReadsPerConsensus === undefined) missing.push("Min reads per UMI");
      if (data.maxIndels === undefined) missing.push("Max UMI indels");
      if (data.minUmiQuality === undefined) missing.push("Min UMI quality");
      if (missing.length > 0) {
        throw new Error(
          `Set the following UMI QC fields in Advanced settings: ${missing.join(", ")}.`,
        );
      }
    }

    if (data.minReadsPerConsensus !== undefined && data.minReadsPerConsensus < 1)
      throw new Error("Min reads per consensus must be at least 1");
    if (data.minUmiQuality !== undefined && (data.minUmiQuality < 0 || data.minUmiQuality > 50))
      throw new Error("Min UMI quality must be between 0 and 50");
    if (data.errorBudget !== undefined && data.errorBudget < 0)
      throw new Error("Error budget must be 0 or greater");
    if (data.maxIndels !== undefined && data.maxIndels < 0)
      throw new Error("Max indels must be 0 or greater");
    if (data.perProcessMemGB !== undefined && data.perProcessMemGB < 1)
      throw new Error("Memory per process must be at least 1 GB");
    if (data.perProcessCPUs !== undefined && data.perProcessCPUs < 1)
      throw new Error("CPUs per process must be at least 1");
    const useWildcards = data.useWildcards ?? true;
    return {
      input: data.input,
      pattern: effectiveSourcePattern,
      effectivePattern: useWildcards
        ? applyWildcards(effectiveSourcePattern)
        : effectiveSourcePattern,
      patternParts,
      useWildcards: useWildcards,
      unstranded: data.unstranded ?? false,
      minReadsPerConsensus: data.minReadsPerConsensus,
      minUmiQuality: data.minUmiQuality,
      errorBudget: data.errorBudget,
      maxIndels: data.maxIndels,
      autoR1OnlyAssembly: data.autoR1OnlyAssembly,
      filterInvalidPeptides: data.filterInvalidPeptides ?? true,
      removeReadSingletons: data.removeReadSingletons ?? true,
      stopCodonTypes: data.stopCodonTypes,
      stopCodonReplacements: data.stopCodonReplacements,
      perProcessMemGB: data.perProcessMemGB,
      perProcessCPUs: data.perProcessCPUs,
      defaultBlockLabel: data.defaultBlockLabel ?? "",
      customBlockLabel: data.customBlockLabel ?? "",
    };
  })

  .title(() => "Peptide Profiling")

  .subtitle((ctx) => ctx.data.customBlockLabel || ctx.data.defaultBlockLabel || "")

  .done();

export type BlockOutputs = InferOutputsType<typeof platforma>;
