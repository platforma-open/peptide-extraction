import type { InferOutputsType, PlRef } from "@platforma-sdk/model";
import { BlockModel, isPColumnSpec, parseResourceMap } from "@platforma-sdk/model";

export const ProgressPrefix = "[==PROGRESS==]";

export const ProgressPattern =
  /(?<stage>[^:]*):(?: *(?<progress>[0-9.]+)%)?(?: *ETA: *(?<eta>.+))?/;

export type BlockArgs = {
  input?: PlRef;
  pattern?: string;
  minReadsPerConsensus?: number;
  errorBudget?: number;
  maxIndels?: number;
  autoR1OnlyAssembly?: boolean;
  perProcessMemGB?: number;
  perProcessCPUs?: number;
};

export const model = BlockModel.create()

  .withArgs<BlockArgs>({
    minReadsPerConsensus: 2,
    errorBudget: 10,
    maxIndels: 1,
    autoR1OnlyAssembly: true,
  })

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
    const inputRef = ctx.args.input;
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

  .sections((_ctx) => [{ type: "link", href: "/", label: "Main" }])

  .argsValid(
    (ctx) =>
      ctx.args.input !== undefined && ctx.args.pattern !== undefined && ctx.args.pattern !== "",
  )

  .title(() => "Peptide Extraction")

  .done();

export type BlockOutputs = InferOutputsType<typeof model>;
