import { CABINET_PALETTE, folderMaterial, colorContrast } from './fileCabinetModel.mjs';

export const WORK_PALETTE = [...CABINET_PALETTE, { name: 'Lavender', color: '#d1c2ef' }, { name: 'Mist', color: '#bfc7d6' }];
export const DEFAULT_APPEARANCE = {
  palette: WORK_PALETTE.map(p => p.color), button: '#292631', box: '#f3ead7', patternColor: '#29281f',
  pattern: 'grid', patternSize: 28, patternOpacity: 7, gradient: 'none', gradientColor: '#f7eee2', gradientStrength: 12, roundness: 10,
};
export const APPEARANCE_PRESETS = [
  { name: 'Sand', palette: ['#ddc4a1', '#f2eee5', '#babaa4', '#c8bdad', '#aebbb0', '#d1c9d9', '#bdc9ce'], button: '#49463d', box: '#f3ede2', gradientColor: '#fff9ed' },
  { name: 'Clay', palette: ['#d2ac98', '#eee6db', '#b3b5a1', '#bbac9d', '#bfc4b2', '#c9b8bd', '#c1c9c9'], button: '#594c46', box: '#eee0d5', gradientColor: '#f5decb' },
  { name: 'Sage', palette: ['#bdc8b6', '#eef0e5', '#b7b99c', '#a5b3a8', '#d2d5c4', '#cec5d8', '#becbd0'], button: '#3d4b45', box: '#e4e8dc', gradientColor: '#f8f2d9' },
  { name: 'Dusk', palette: ['#cac3df', '#eeedf1', '#bcbcc9', '#aeb8c3', '#c3cec6', '#d8c5d1', '#b8c9d5'], button: '#484359', box: '#ece7ef', gradientColor: '#e6d6ed' },
];
export function presetAppearance(name) {
  const preset = APPEARANCE_PRESETS.find(p => p.name === name);
  if (!preset) return structuredClone(DEFAULT_APPEARANCE);
  const { name: _, ...settings } = preset;
  return { ...structuredClone(DEFAULT_APPEARANCE), ...settings, palette: [...settings.palette], gradient: 'radial' };
}
function mix(a, b, weight) {
  return '#' + [1, 3, 5].map(i => Math.round(parseInt(a.slice(i, i + 2), 16) * weight + parseInt(b.slice(i, i + 2), 16) * (1 - weight)).toString(16).padStart(2, '0')).join('');
}
/** Only standard palette slots are mapped; arbitrary saved folder colors stay intact. */
export function workMaterial(color, settings) {
  const slot = WORK_PALETTE.findIndex(p => p.color === color?.toLowerCase());
  const material = folderMaterial(settings && slot >= 0 ? settings.palette[slot] : color);
  if (!settings) return material;
  const fill = material['--fc-fill'], ink = material['--fc-ink'];
  let weight = settings.gradient === 'none' ? 0 : settings.gradientStrength / 100;
  // Limit the tint until both gradient endpoints retain readable primary AND secondary text.
  let end = mix(settings.gradientColor, fill, weight);
  while (weight > 0 && [ink, material['--fc-muted']].some(text => colorContrast(end, text) < 4.5)) {
    weight = Math.max(0, weight - .01); end = mix(settings.gradientColor, fill, weight);
  }
  let opacity = settings.patternOpacity / 100;
  let line = mix(settings.patternColor, fill, opacity);
  while (opacity > 0 && [ink, material['--fc-muted']].some(text => colorContrast(line, text) < 4.5)) {
    opacity = Math.max(0, opacity - .01); line = mix(settings.patternColor, fill, opacity);
  }
  const pattern = {
    grid: `linear-gradient(${line} 1px,transparent 1px),linear-gradient(90deg,${line} 1px,transparent 1px)`,
    dots: `radial-gradient(circle,${line} 1.5px,transparent 1.6px)`,
    diamonds: `linear-gradient(45deg,transparent 48%,${line} 49%,${line} 51%,transparent 52%),linear-gradient(-45deg,transparent 48%,${line} 49%,${line} 51%,transparent 52%)`,
    lines: `linear-gradient(${line} 1px,transparent 1px)`, plain: 'linear-gradient(transparent,transparent)',
  }[settings.pattern];
  const layers = settings.pattern === 'grid' || settings.pattern === 'diamonds' ? 2 : 1;
  const gradient = settings.gradient === 'radial' ? `radial-gradient(ellipse at 85% 10%,${end},${fill} 85%)` : `linear-gradient(135deg,${fill},${end})`;
  return { ...material, '--wa-paper-image': `${pattern},${gradient}`, '--wa-paper-size': [...Array(layers).fill(`${settings.patternSize}px ${settings.patternSize}px`), '100% 100%'].join(','), '--wa-gradient-end': end };
}
export function workSurface(settings) {
  if (!settings) return {};
  return { '--wa-button': settings.button, '--wa-button-ink': folderMaterial(settings.button)['--fc-ink'], '--wa-box': settings.box, '--wa-box-ink': folderMaterial(settings.box)['--fc-ink'], '--wa-radius': `${settings.roundness}px` };
}
