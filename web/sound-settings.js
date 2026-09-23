export const CHIMES = { bell: 'bell', chime: 'chime', beep: 'double beep' };
export const AMBIENCES = { off: 'off', brown: 'brown noise', rain: 'soft rain' };
export const SOUND_DEFAULTS = { chime: 'bell', soundVolume: 50, ambience: 'off', ambienceVolume: 30 };

export function validSoundSetting(key, value) {
  if (key === 'chime') return typeof value === 'string' && Object.hasOwn(CHIMES, value);
  if (key === 'ambience') return typeof value === 'string' && Object.hasOwn(AMBIENCES, value);
  if (key === 'soundVolume' || key === 'ambienceVolume') return Number.isInteger(value) && value >= 0 && value <= 100;
  return false;
}
