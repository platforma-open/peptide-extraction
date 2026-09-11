import type { PlRef } from "@platforma-sdk/model";
import { describe, expect, it } from "vitest";
import { kind } from "@platforma-open/milaboratories.peptide-profiling.kind";
import type { BlockData } from "./index";
import { initBlockData } from "./index";
import { deriveTemplateParams } from "./templateParams";

/**
 * Export a block's settings as a template and create a block from that template.
 *
 * The `JSON` hop is the point: a template is a file, so anything that survives
 * only as a live object reference is not actually carried.
 */
const roundTrip = (data: BlockData): BlockData =>
  initBlockData(
    kind.parseInitializationParams(JSON.parse(JSON.stringify(deriveTemplateParams(data)))),
  );

const ref: PlRef = { __isRef: true, blockId: "block-1", name: "dataset" };

/** A block with every authored field set to something other than its default. */
const configured: BlockData = {
  ...initBlockData(),
  input: ref,
  presetId: "generic-amplicon-umi",
  pattern: "^(UMI:N{12})ggccatggcc(R1:N{21})gcggccgc*",
  useWildcards: false,
  unstranded: true,
  minReadsPerConsensus: 5,
  minUmiQuality: 30,
  errorBudget: 25,
  maxIndels: 3,
  autoR1OnlyAssembly: false,
  filterInvalidPeptides: false,
  removeReadSingletons: true,
  stopCodonTypes: ["amber", "opal"],
  stopCodonReplacements: { amber: "Q", opal: "W" },
  perProcessMemGB: 32,
  perProcessCPUs: 8,
  customBlockLabel: "PhD-7 panning round 3",
};

describe("the template round trip", () => {
  it("carries every field the contract names", () => {
    const seeded = roundTrip(configured);

    for (const [field, value] of Object.entries(deriveTemplateParams(configured))) {
      expect(seeded[field as keyof BlockData]).toEqual(value);
    }
  });

  it("is idempotent", () => {
    const once = roundTrip(configured);
    expect(roundTrip(once)).toEqual(once);
  });

  it("carries the falsy values a `??` would swallow", () => {
    // Each of these is a deliberate choice whose value equals the default's
    // opposite, and each defaults to something truthy — so a seeded block that
    // silently reverted would look like a working block with the wrong settings.
    const seeded = roundTrip(configured);

    expect(seeded.useWildcards).toBe(false);
    expect(seeded.autoR1OnlyAssembly).toBe(false);
    expect(seeded.filterInvalidPeptides).toBe(false);
  });

  it("carries an empty custom label and a zero budget", () => {
    const seeded = roundTrip({ ...configured, customBlockLabel: "", errorBudget: 0 });

    expect(seeded.customBlockLabel).toBe("");
    expect(seeded.errorBudget).toBe(0);
  });

  it("carries a half-configured block", () => {
    // A template may be exported before the pattern is finished. Nothing in the
    // path refuses it: the args lambda is what decides a block can run.
    const seeded = roundTrip({ ...initBlockData(), input: ref, presetId: "neb-phd-7" });

    expect(seeded.input).toEqual(ref);
    expect(seeded.presetId).toBe("neb-phd-7");
    expect(seeded.pattern).toBeUndefined();
  });

  it("gives a block created with no params the model's defaults", () => {
    const fresh = initBlockData();

    expect(fresh.useWildcards).toBe(true);
    expect(fresh.minReadsPerConsensus).toBe(2);
    expect(fresh.minUmiQuality).toBe(20);
    expect(fresh.errorBudget).toBe(10);
    expect(fresh.maxIndels).toBe(1);
    expect(fresh.autoR1OnlyAssembly).toBe(true);
    expect(fresh.filterInvalidPeptides).toBe(true);
    expect(fresh.removeReadSingletons).toBe(false);
  });

  it("does not carry the derived and view-only fields", () => {
    const seeded = roundTrip({
      ...configured,
      defaultBlockLabel: "Sequencing data from Sample Set A",
      patternParts: { r1: { leftAnchor: "", rightAnchor: "", insertName: "R1" } },
      inputIsPairedEnd: true,
    });

    // Re-derived by the UI from `input` and `pattern`, and by the args lambda.
    expect(seeded.defaultBlockLabel).toBeUndefined();
    expect(seeded.patternParts).toBeUndefined();
    expect(seeded.inputIsPairedEnd).toBeUndefined();
    // A fresh view, not the one the template author was looking at.
    expect(seeded.qcTableState).toEqual(initBlockData().qcTableState);
  });
});
