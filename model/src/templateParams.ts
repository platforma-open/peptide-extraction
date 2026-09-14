import type { BlockParams } from "@platforma-open/milaboratories.peptide-profiling.kind";
import type { BlockData } from "./index";

/**
 * What a project template carries for this block: everything the scientist
 * authored, and nothing the block can work out for itself.
 *
 * The inverse of `initBlockData`. Kept as its own function rather than inlined
 * into the model so the pair can be exercised as a round trip in a unit test.
 */
export function deriveTemplateParams(data: BlockData): BlockParams {
  return {
    input: data.input,
    presetId: data.presetId,
    pattern: data.pattern,
    useWildcards: data.useWildcards,
    unstranded: data.unstranded,
    minReadsPerConsensus: data.minReadsPerConsensus,
    minUmiQuality: data.minUmiQuality,
    errorBudget: data.errorBudget,
    maxIndels: data.maxIndels,
    autoR1OnlyAssembly: data.autoR1OnlyAssembly,
    filterInvalidPeptides: data.filterInvalidPeptides,
    removeReadSingletons: data.removeReadSingletons,
    stopCodonTypes: data.stopCodonTypes,
    stopCodonReplacements: data.stopCodonReplacements,
    perProcessMemGB: data.perProcessMemGB,
    perProcessCPUs: data.perProcessCPUs,
    customBlockLabel: data.customBlockLabel,
  };
}
