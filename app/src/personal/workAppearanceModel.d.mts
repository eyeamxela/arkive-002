export type WorkAppearanceSettings = {
  palette: string[]; button: string; box: string; patternColor: string;
  pattern: 'grid' | 'dots' | 'diamonds' | 'lines' | 'plain'; patternSize: number; patternOpacity: number;
  gradient: 'none' | 'linear' | 'radial'; gradientColor: string; gradientStrength: number; roundness: number;
};
export const WORK_PALETTE: { name: string; color: string }[];
export const DEFAULT_APPEARANCE: WorkAppearanceSettings;
export const APPEARANCE_PRESETS: { name: string; palette: string[]; button: string; box: string; gradientColor: string }[];
export function presetAppearance(name: string): WorkAppearanceSettings;
export function workMaterial(color: string, settings: WorkAppearanceSettings | null): Record<string, string>;
export function workSurface(settings: WorkAppearanceSettings | null): Record<string, string>;
