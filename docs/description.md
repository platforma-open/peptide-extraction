# Overview

This block extracts peptide sequences from raw sequencing data of NGS-based peptide selection campaigns (phage display, yeast display, mRNA display). It is a crucial first step for peptide discovery workflows, producing a quantified peptide library ready for selection-round comparison and lead identification.

The block takes paired-end FASTQ files and uses mitool to parse reads, identify the peptide-encoding region with user-provided primer / anchor patterns, perform UMI consensus when configured, translate to amino acids, and aggregate per-sample read / UMI counts into a unified peptide table.

The output dataset can then be used in downstream blocks for deeper analysis, such as clustering peptides into motif families, scoring round-over-round enrichment, flagging developability liabilities, or selecting top peptide leads for further characterization.

mitool is developed by MiLaboratories Inc. For more information, please see the [mitool reference](https://docs.platforma.bio/mixcr/reference/mitool-parse).
