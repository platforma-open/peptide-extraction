"""Mock peptide properties — same output format as peptide_properties.py but with
random/placeholder values. Used until Biopython is available in the runtime.

Usage:
  python peptide_properties_mock.py <input.tsv> <output_properties.tsv> <output_composition.tsv>
"""

import random
import sys

import polars as pl

AMINO_ACIDS = ["A", "C", "D", "E", "F", "G", "H", "I", "K", "L",
               "M", "N", "P", "Q", "R", "S", "T", "V", "W", "Y"]

CODON_TABLE = {
    "TTT": "F", "TTC": "F", "TTA": "L", "TTG": "L",
    "TCT": "S", "TCC": "S", "TCA": "S", "TCG": "S",
    "TAT": "Y", "TAC": "Y", "TAA": "*", "TAG": "*",
    "TGT": "C", "TGC": "C", "TGA": "*", "TGG": "W",
    "CTT": "L", "CTC": "L", "CTA": "L", "CTG": "L",
    "CCT": "P", "CCC": "P", "CCA": "P", "CCG": "P",
    "CAT": "H", "CAC": "H", "CAA": "Q", "CAG": "Q",
    "CGT": "R", "CGC": "R", "CGA": "R", "CGG": "R",
    "ATT": "I", "ATC": "I", "ATA": "I", "ATG": "M",
    "ACT": "T", "ACC": "T", "ACA": "T", "ACG": "T",
    "AAT": "N", "AAC": "N", "AAA": "K", "AAG": "K",
    "AGT": "S", "AGC": "S", "AGA": "R", "AGG": "R",
    "GTT": "V", "GTC": "V", "GTA": "V", "GTG": "V",
    "GCT": "A", "GCC": "A", "GCA": "A", "GCG": "A",
    "GAT": "D", "GAC": "D", "GAA": "E", "GAG": "E",
    "GGT": "G", "GGC": "G", "GGA": "G", "GGG": "G",
}


def _translate(nt_seq: str) -> str:
    """Simple codon table translation, stop at first stop codon."""
    aa = []
    for i in range(0, len(nt_seq) - 2, 3):
        codon = nt_seq[i:i + 3].upper()
        residue = CODON_TABLE.get(codon, "X")
        if residue == "*":
            break
        aa.append(residue)
    return "".join(aa)


def main():
    if len(sys.argv) != 4:
        print(f"Usage: {sys.argv[0]} <input.tsv> <output_properties.tsv> <output_composition.tsv>",
              file=sys.stderr)
        sys.exit(1)

    input_path = sys.argv[1]
    output_props_path = sys.argv[2]
    output_comp_path = sys.argv[3]

    random.seed(42)

    peptides = (
        pl.scan_csv(input_path, separator="\t")
        .select("peptideKey")
        .unique()
        .collect()
        .to_series()
        .to_list()
    )

    # Build properties table
    df = pl.DataFrame({"peptideKey": peptides})

    df = df.with_columns(
        pl.col("peptideKey")
        .str.slice(0, pl.col("peptideKey").str.len_chars() - pl.col("peptideKey").str.len_chars() % 3)
        .alias("ntTrimmed")
    ).with_columns(
        pl.col("ntTrimmed")
        .map_elements(_translate, return_dtype=pl.Utf8)
        .alias("aaSeqPeptide")
    ).with_columns(
        pl.col("peptideKey").alias("nSeqPeptide"),
        pl.col("peptideKey").str.len_chars().alias("ntLengthPeptide"),
        pl.col("aaSeqPeptide").str.len_chars().alias("aaLengthPeptide"),
        (pl.col("peptideKey").str.len_chars() % 3 != 0).alias("hasTrailingNucleotides"),
        (pl.col("aaSeqPeptide").str.len_chars() < pl.col("ntTrimmed").str.len_chars() // 3).alias("hasEarlyStopCodon"),
    )

    # Mock properties — random values in realistic ranges
    n = len(peptides)
    df = df.with_columns(
        pl.Series("charge", [round(random.uniform(-5, 5), 4) for _ in range(n)]),
        pl.Series("gravy", [round(random.uniform(-2, 2), 4) for _ in range(n)]),
        pl.Series("mw", [round(random.uniform(500, 5000), 2) for _ in range(n)]),
        pl.Series("pi", [round(random.uniform(3, 11), 4) for _ in range(n)]),
    )

    # Sort deterministically, generate sequence-derived labels
    df = df.sort("peptideKey")

    df = df.with_columns(
        pl.col("peptideKey")
        .str.replace_all(r"\d", "")
        .str.slice(0, 5)
        .str.to_uppercase()
        .alias("_labelPrefix")
    ).with_columns(
        pl.col("peptideKey")
        .rank("ordinal")
        .over("_labelPrefix")
        .cast(pl.Int64)
        .alias("_labelRank")
    ).with_columns(
        pl.when(pl.col("_labelRank") > 1)
        .then(pl.format("P-{}-{}", pl.col("_labelPrefix"), pl.col("_labelRank")))
        .otherwise(pl.format("P-{}", pl.col("_labelPrefix")))
        .alias("peptideLabel")
    ).drop("_labelPrefix", "_labelRank")

    # Merge with aggregation columns from input
    agg_df = pl.read_csv(input_path, separator="\t")
    df = df.join(agg_df, on="peptideKey", how="left")

    # Write properties TSV
    df.select(
        "peptideKey", "nSeqPeptide", "aaSeqPeptide", "ntLengthPeptide", "aaLengthPeptide",
        pl.col("charge").alias("peptideCharge"),
        pl.col("gravy").alias("peptideHydrophobicity"),
        pl.col("mw").alias("peptideMolecularWeight"),
        pl.col("pi").alias("peptideIsoelectricPoint"),
        "peptideLabel",
        "hasTrailingNucleotides",
        "hasEarlyStopCodon",
        "uniqueMoleculeCountSum",
        "sampleCount",
        "uniqueMoleculeFractionMean",
    ).write_csv(output_props_path, separator="\t")

    # Write AA composition TSV (mock: random fractions that sum to ~1)
    aa_series = pl.Series("aminoAcid", AMINO_ACIDS)
    comp = df.select(
        "peptideKey",
        pl.col("aaSeqPeptide")
        .map_elements(lambda _: _random_composition(), return_dtype=pl.List(pl.Float64))
        .alias("fractions"),
        pl.lit(aa_series).implode().alias("aminoAcid"),
    ).explode("fractions", "aminoAcid").rename({"fractions": "peptideAaPercent"}).drop_nans("peptideAaPercent")

    comp.write_csv(output_comp_path, separator="\t")


def _random_composition() -> list[float]:
    """Generate random AA percentages that sum to ~100. Zero entries become NaN."""
    raw = [random.random() for _ in AMINO_ACIDS]
    total = sum(raw)
    # Randomly set some to NaN to mimic absent amino acids
    return [round(v / total * 100, 6) if random.random() > 0.3 else float("nan") for v in raw]


if __name__ == "__main__":
    main()
