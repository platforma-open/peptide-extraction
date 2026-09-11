import type { PlRef } from "@platforma-sdk/model";
import { describe, expect, it } from "vitest";
import { kind } from "./index";

const parse = (value: unknown) => kind.parseInitializationParams(value);

const ref: PlRef = { __isRef: true, blockId: "block-1", name: "dataset" };

describe("the envelope", () => {
  it("accepts an empty object — a block may be created with nothing pinned", () => {
    expect(parse({})).toEqual({});
  });

  it.each([undefined, null, 42, "params", [], true])("refuses %o", (value) => {
    expect(() => parse(value)).toThrow();
  });

  it("drops a key the contract does not name", () => {
    expect(parse({ presetId: "neb-phd-7", patternParts: { r1: {} } })).toEqual({
      presetId: "neb-phd-7",
    });
  });

  it("keeps a field that is present and falsy", () => {
    expect(parse({ unstranded: false, customBlockLabel: "", errorBudget: 0 })).toEqual({
      unstranded: false,
      customBlockLabel: "",
      errorBudget: 0,
    });
  });
});

describe("input", () => {
  it("accepts a block-output reference", () => {
    expect(parse({ input: ref })).toEqual({ input: ref });
  });

  it.each([{ blockId: "block-1", name: "dataset" }, "block-1/dataset", null, 7])(
    "refuses %o",
    (value) => {
      expect(() => parse({ input: value })).toThrow("'input' must be");
    },
  );
});

describe("presetId, pattern and customBlockLabel", () => {
  it("carries the preset and the pattern the scientist assembled", () => {
    const params = { presetId: "generic-amplicon-umi", pattern: "^(UMI:N{12})(R1:*)*" };
    expect(parse(params)).toEqual(params);
  });

  it("accepts a preset id this version of the block does not know", () => {
    // The preset list lives in the model and grows. An id from a newer block is
    // refused by the args lambda when the block runs, with a message about the
    // preset — not here, where it would look like a malformed template.
    expect(parse({ presetId: "kit-from-the-future" })).toEqual({
      presetId: "kit-from-the-future",
    });
  });

  it("accepts a pattern that does not parse", () => {
    // Half-written patterns are ordinary editor state.
    expect(parse({ pattern: "^(R1:" })).toEqual({ pattern: "^(R1:" });
  });

  it.each(["presetId", "pattern", "customBlockLabel"])("refuses a non-string %s", (field) => {
    expect(() => parse({ [field]: 7 })).toThrow(`'${field}' must be a string.`);
  });
});

describe("the boolean knobs", () => {
  const fields = [
    "useWildcards",
    "unstranded",
    "autoR1OnlyAssembly",
    "filterInvalidPeptides",
    "removeReadSingletons",
  ];

  it.each(fields)("carries %s in both states", (field) => {
    expect(parse({ [field]: true })).toEqual({ [field]: true });
    expect(parse({ [field]: false })).toEqual({ [field]: false });
  });

  it.each(fields)("refuses a non-boolean %s", (field) => {
    expect(() => parse({ [field]: "true" })).toThrow(`'${field}' must be a boolean.`);
  });
});

describe("the numeric knobs", () => {
  it.each([
    ["minReadsPerConsensus", 1, 0],
    ["errorBudget", 0, -1],
    ["maxIndels", 0, -1],
    ["perProcessMemGB", 1, 0],
    ["perProcessCPUs", 1, 0],
  ])("%s accepts %d and refuses %d", (field, ok, bad) => {
    expect(parse({ [field]: ok })).toEqual({ [field]: ok });
    expect(() => parse({ [field]: bad })).toThrow(`'${field}' must be`);
  });

  it("minUmiQuality spans 0 to 50 inclusive", () => {
    expect(parse({ minUmiQuality: 0 })).toEqual({ minUmiQuality: 0 });
    expect(parse({ minUmiQuality: 50 })).toEqual({ minUmiQuality: 50 });
    expect(() => parse({ minUmiQuality: -1 })).toThrow("'minUmiQuality' must be");
    expect(() => parse({ minUmiQuality: 51 })).toThrow("'minUmiQuality' must be");
  });

  it("accepts a fractional count, because the args lambda does", () => {
    expect(parse({ minReadsPerConsensus: 2.5 })).toEqual({ minReadsPerConsensus: 2.5 });
  });

  it.each([NaN, Infinity, -Infinity, "4", null])("refuses %o as a count", (value) => {
    expect(() => parse({ perProcessCPUs: value })).toThrow("'perProcessCPUs' must be");
  });
});

describe("stopCodonTypes", () => {
  it("accepts any subset, including none", () => {
    expect(parse({ stopCodonTypes: [] })).toEqual({ stopCodonTypes: [] });
    expect(parse({ stopCodonTypes: ["amber", "opal"] })).toEqual({
      stopCodonTypes: ["amber", "opal"],
    });
  });

  it.each([["stop"], "amber", [1], null, { amber: true }])("refuses %o", (value) => {
    expect(() => parse({ stopCodonTypes: value })).toThrow("'stopCodonTypes' must be");
  });
});

describe("stopCodonReplacements", () => {
  it("accepts a replacement for some of the stop codons", () => {
    expect(parse({ stopCodonReplacements: { amber: "Q" } })).toEqual({
      stopCodonReplacements: { amber: "Q" },
    });
    expect(parse({ stopCodonReplacements: {} })).toEqual({ stopCodonReplacements: {} });
  });

  it("accepts a replacement for a stop codon that is not selected", () => {
    // The settings panel clears orphaned replacements on its own, but the state
    // exists between the two writes, and a template may be written by hand.
    expect(parse({ stopCodonTypes: ["amber"], stopCodonReplacements: { opal: "W" } })).toEqual({
      stopCodonTypes: ["amber"],
      stopCodonReplacements: { opal: "W" },
    });
  });

  it.each([{ umber: "W" }, { amber: 1 }, [], "Q", null])("refuses %o", (value) => {
    expect(() => parse({ stopCodonReplacements: value })).toThrow(
      "'stopCodonReplacements' must be",
    );
  });
});
