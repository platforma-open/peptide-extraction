import type { Preset } from "./types";
import nebPhd7 from "./neb/phd-7";
import nebPhd12 from "./neb/phd-12";
import genericAmpliconDualUmi from "./generic/amplicon-dual-umi";

export type { Preset } from "./types";

export const allPresets: readonly Preset[] = [nebPhd7, nebPhd12, genericAmpliconDualUmi] as const;

export const presetsById: Readonly<Record<string, Preset>> = Object.freeze(
  Object.fromEntries(allPresets.map((p) => [p.id, p])),
);

export function getPreset(id: string | undefined): Preset | undefined {
  return id ? presetsById[id] : undefined;
}
