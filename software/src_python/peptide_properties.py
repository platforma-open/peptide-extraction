"""Compute peptide properties from nucleotide sequences using Biopython.

Input:  TSV file with at least a 'peptideKey' column containing nucleotide sequences.
Output: Two TSV files — properties (per peptide) and AA composition (long format).

Usage:
  python peptide_properties.py <input.tsv> <output_properties.tsv> <output_composition.tsv>
"""

import sys

import polars as pl
from Bio.Seq import Seq
from Bio.SeqUtils.ProtParam import ProteinAnalysis

def _translate(nt_seq: str) -> str:
    """Translate a codon-trimmed nucleotide sequence to amino acid, stopping at first stop codon."""
    if not nt_seq:
        return ""
    return str(Seq(nt_seq).translate(to_stop=True))


def _compute_props(aa_seq: str) -> dict:
    """Compute physicochemical properties for an amino acid sequence."""
    if not aa_seq:
        return {"charge": 0.0, "gravy": 0.0, "mw": 0.0, "pi": 0.0}
    analysis = ProteinAnalysis(aa_seq)
    return {
        "charge": round(analysis.charge_at_pH(7.0), 4),
        "gravy": round(analysis.gravy(), 4),
        "mw": round(analysis.molecular_weight(), 2),
        "pi": round(analysis.isoelectric_point(), 4),
    }


def main():
    if len(sys.argv) != 3:
        print(f"Usage: {sys.argv[0]} <input.tsv> <output_properties.tsv>",
              file=sys.stderr)
        sys.exit(1)

    input_path = sys.argv[1]
    output_props_path = sys.argv[2]

    # Read and build base table with nt trimming, translation, and stop codon removal
    df = (
        pl.scan_csv(input_path, separator="\t")
        .select("peptideKey")
        .unique()
        .collect()
        .with_columns(
            # Trim nt to codon boundary (multiple of 3)
            pl.col("peptideKey")
            .str.slice(0, pl.col("peptideKey").str.len_chars() - pl.col("peptideKey").str.len_chars() % 3)
            .alias("ntTrimmed")
        )
        .with_columns(
            # Translate nt -> aa (Biopython, per element)
            pl.col("ntTrimmed")
            .map_elements(_translate, return_dtype=pl.Utf8)
            .alias("aaSeqPeptide")
        )
        .with_columns(
            pl.col("peptideKey").alias("nSeqPeptide"),
            pl.col("peptideKey").str.len_chars().alias("ntLengthPeptide"),
            pl.col("aaSeqPeptide").str.len_chars().alias("aaLengthPeptide"),
            # QC flags (vectorized, no Biopython)
            (pl.col("peptideKey").str.len_chars() % 3 != 0).alias("hasTrailingNucleotides"),
            (pl.col("aaSeqPeptide").str.len_chars() < pl.col("ntTrimmed").str.len_chars() // 3).alias("hasEarlyStopCodon"),
        )
    )

    # Compute properties (Biopython, per element) -> struct column
    df = df.with_columns(
        pl.col("aaSeqPeptide")
        .map_elements(_compute_props, return_dtype=pl.Struct({
            "charge": pl.Float64,
            "gravy": pl.Float64,
            "mw": pl.Float64,
            "pi": pl.Float64,
        }))
        .alias("props")
    ).unnest("props")

    # Sort deterministically before generating labels
    df = df.sort("peptideKey")

    # Generate sequence-derived labels (like clonotype labels: P-XXXXX)
    # Strip digits, take first 5 chars, uppercase. Add rank suffix on collision.
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


if __name__ == "__main__":
    main()
