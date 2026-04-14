import type { InferOutputsType, PlDataTableStateV2, PlRef } from "@platforma-sdk/model";
import {
  BlockModelV3,
  DataModelBuilder,
  createPlDataTableStateV2,
  createPlDataTableV2,
  isPColumnSpec,
  parseResourceMap,
} from "@platforma-sdk/model";

export type BlockData = {
  defaultBlockLabel?: string;
  customBlockLabel?: string;
  input?: PlRef;
  pattern?: string;
  minReadsPerConsensus?: number;
  errorBudget?: number;
  maxIndels?: number;
  autoR1OnlyAssembly?: boolean;
  perProcessMemGB?: number;
  perProcessCPUs?: number;
  qcTableState: PlDataTableStateV2;
  resultsTableState: PlDataTableStateV2;
};

export const ProgressPrefix = "[==PROGRESS==]";

export const ProgressPattern =
  /(?<stage>[^:]*):(?: *(?<progress>[0-9.]+)%)?(?: *ETA: *(?<eta>.+))?/;

// Legacy args type from V1/V2 — all fields were optional
type LegacyArgs = {
  input?: PlRef;
  pattern?: string;
  minReadsPerConsensus?: number;
  errorBudget?: number;
  maxIndels?: number;
  autoR1OnlyAssembly?: boolean;
  perProcessMemGB?: number;
  perProcessCPUs?: number;
};

const dataModel = new DataModelBuilder()
  .from<BlockData>("v1")
  .upgradeLegacy<LegacyArgs, Record<string, never>>(({ args }) => ({
    ...args,
    qcTableState: createPlDataTableStateV2(),
    resultsTableState: createPlDataTableStateV2(),
  }))
  .init(() => ({
    minReadsPerConsensus: 2,
    errorBudget: 10,
    maxIndels: 1,
    autoR1OnlyAssembly: true,
    qcTableState: createPlDataTableStateV2(),
    resultsTableState: createPlDataTableStateV2(),
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

  .output("stepLogs", (ctx) => {
    return ctx.outputs !== undefined
      ? parseResourceMap(ctx.outputs?.resolve("stepLogs"), (acc) => acc.getLogHandle(), false)
      : undefined;
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
    { type: "link", href: "/results", label: "Results" },
  ])

  .args((data) => {
    if (!data.input) throw new Error("Input dataset is required");
    if (!data.pattern) throw new Error("mitool parse pattern is required");
    if (data.minReadsPerConsensus !== undefined && data.minReadsPerConsensus < 1)
      throw new Error("Min reads per consensus must be at least 1");
    if (data.errorBudget !== undefined && data.errorBudget < 0)
      throw new Error("Error budget must be 0 or greater");
    if (data.maxIndels !== undefined && data.maxIndels < 0)
      throw new Error("Max indels must be 0 or greater");
    if (data.perProcessMemGB !== undefined && data.perProcessMemGB < 1)
      throw new Error("Memory per process must be at least 1 GB");
    if (data.perProcessCPUs !== undefined && data.perProcessCPUs < 1)
      throw new Error("CPUs per process must be at least 1");
    return {
      input: data.input,
      pattern: data.pattern,
      minReadsPerConsensus: data.minReadsPerConsensus,
      errorBudget: data.errorBudget,
      maxIndels: data.maxIndels,
      autoR1OnlyAssembly: data.autoR1OnlyAssembly,
      perProcessMemGB: data.perProcessMemGB,
      perProcessCPUs: data.perProcessCPUs,
      defaultBlockLabel: data.defaultBlockLabel ?? "",
      customBlockLabel: data.customBlockLabel ?? "",
    };
  })

  .title(() => "Peptide Extraction")

  .subtitle((ctx) => ctx.data.customBlockLabel || ctx.data.defaultBlockLabel || "")

  .done();

export type BlockOutputs = InferOutputsType<typeof platforma>;
