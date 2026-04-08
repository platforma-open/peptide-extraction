import type { InferOutputsType, PlRef } from "@platforma-sdk/model";
import { BlockModel, isPColumnSpec } from "@platforma-sdk/model";

export type BlockArgs = {
  input?: PlRef;
  pattern?: string;
  minReadsPerConsensus?: number;
  errorBudget?: number;
  maxIndels?: number;
  autoR1OnlyAssembly?: boolean;
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

  .sections((_ctx) => [{ type: "link", href: "/", label: "Main" }])

  .argsValid(
    (ctx) =>
      ctx.args.input !== undefined && ctx.args.pattern !== undefined && ctx.args.pattern !== "",
  )

  .done();

export type BlockOutputs = InferOutputsType<typeof model>;
