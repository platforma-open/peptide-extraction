export type Preset = {
  id: string;
  vendor: string;
  kit: string;
  label: string;
  description: string;
  pattern: string;
  notes?: string;
  // When true, the preset exposes a small form in the UI and the assembled
  // pattern is taken from data.pattern (not preset.pattern). The preset.pattern
  // field is left empty for user-configurable entries.
  userConfigurable?: boolean;
  // When set on a userConfigurable preset, the UMI presence is owned by the
  // preset itself: the "Has UMI" toggle is hidden and the value is locked to
  // this declaration. Undefined means the user toggles UMI in the form.
  hasUmi?: boolean;
};
