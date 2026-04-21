import { describe, expect, test } from "vitest";
import { applyWildcards, parsePattern } from "./pattern";

describe("parsePattern — new shapes", () => {
  test("Ph.D.-7 forward: ^* + left anchor + fixed-length capture + right anchor", () => {
    const p = "^*tttctattctcactct(R1:N{21})ggtggaggttcggccgaa*";
    const parts = parsePattern(p);
    expect(parts).not.toBeNull();
    const r1 = parts!.r1;
    expect(r1.hasLeadingWildcard).toBe(true);
    expect(r1.umi).toBeUndefined();
    expect(r1.umiName).toBeUndefined();
    expect(r1.insertName).toBe("R1");
    expect(r1.insertLength).toBe(21);
    expect(r1.leftAnchor).toBe("tttctattctcactct");
    expect(r1.rightAnchor).toBe("ggtggaggttcggccgaa");
    expect(r1.rightTrim).toBeUndefined();
    expect(parts!.r2).toBeUndefined();
  });

  test("Ph.D.-12 (insert-at-read-start): no UMI, no left anchor, fixed capture at start", () => {
    const p = "^(R1:N{36})ggtggaggttcggccgaa*";
    const parts = parsePattern(p);
    expect(parts).not.toBeNull();
    const r1 = parts!.r1;
    expect(r1.hasLeadingWildcard).toBe(false);
    expect(r1.umi).toBeUndefined();
    expect(r1.leftAnchor).toBe("");
    expect(r1.insertName).toBe("R1");
    expect(r1.insertLength).toBe(36);
    expect(r1.rightAnchor).toBe("ggtggaggttcggccgaa");
  });

  test("ranged R capture: (R1:N{18:21})", () => {
    const p = "^*tttctattctcactct(R1:N{18:21})ggtggaggttcggccgaa*";
    const parts = parsePattern(p);
    expect(parts).not.toBeNull();
    expect(parts!.r1.insertLength).toEqual({ min: 18, max: 21 });
  });
});

describe("parsePattern — existing shapes (regression)", () => {
  test("dual-UMI staggered paired-end with variable R captures", () => {
    // Mock dual-UMI paired-end pattern (mock constants, not tied to any real library)
    const p =
      "^(UMI:N{12:16})aaaaccccggggtttt(R1:*)tttttgggccccaaaa>{10}*" +
      "\\" +
      "^(UMI2:N{12:16})ccccaaaatttttggg(R2:*)ggggttttccccaaaa>{10}*";
    const parts = parsePattern(p);
    expect(parts).not.toBeNull();
    expect(parts!.r1.umi).toEqual({ min: 12, max: 16 });
    expect(parts!.r1.umiName).toBe("UMI");
    expect(parts!.r1.insertName).toBe("R1");
    expect(parts!.r1.insertLength).toBeUndefined();
    expect(parts!.r1.rightTrim).toBe(10);
    expect(parts!.r2?.umiName).toBe("UMI2");
    expect(parts!.r2?.insertName).toBe("R2");
    expect(parts!.r2?.rightTrim).toBe(10);
  });

  test("simple single-UMI fixed-length with trim", () => {
    const p = "^(UMI:N{12})GCCC(R1:*)GCGG>{10}*";
    const parts = parsePattern(p);
    expect(parts).not.toBeNull();
    expect(parts!.r1.umi).toEqual({ min: 12, max: 12 });
    expect(parts!.r1.leftAnchor).toBe("GCCC");
    expect(parts!.r1.rightAnchor).toBe("GCGG");
    expect(parts!.r1.rightTrim).toBe(10);
  });
});

describe("parsePattern — rejects", () => {
  test("empty string", () => {
    expect(parsePattern("")).toBeNull();
  });

  test("missing trailing wildcard", () => {
    expect(parsePattern("^*AAA(R1:N{21})GGG")).toBeNull();
  });

  test("missing R capture", () => {
    expect(parsePattern("^*AAA*")).toBeNull();
  });

  test("duplicate R names across halves", () => {
    const p = "^(UMI:N{12})AAA(R1:*)GGG*" + "\\" + "^(UMI2:N{12})CCC(R1:*)TTT*"; // R1 repeats in R2 half
    expect(parsePattern(p)).toBeNull();
  });
});

describe("applyWildcards — homopolymer replacement preserved", () => {
  test("Ph.D.-7 forward pattern round-trips (no homopolymers to replace)", () => {
    const p = "^*tttctattctcactct(R1:N{21})ggtggaggttcggccgaa*";
    const out = applyWildcards(p);
    expect(out).toBe(p);
  });

  test("Ph.D.-12 (insert-at-read-start) pattern round-trips cleanly", () => {
    const p = "^(R1:N{36})ggtggaggttcggccgaa*";
    const out = applyWildcards(p);
    expect(out).toBe(p);
  });

  test("homopolymer run in right anchor gets replaced", () => {
    // AAAAAA (6 As) in right anchor should become nnnnnn
    const p = "^*AAA(R1:N{10})CCCAAAAAATTTT*";
    const out = applyWildcards(p);
    expect(out).toContain("nnnnnn");
  });

  test("unparseable input returns unchanged", () => {
    const p = "not a valid pattern";
    expect(applyWildcards(p)).toBe(p);
  });
});
