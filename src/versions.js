import semver from 'semver';

export const npmLatest = { version: '12.2.3', engines: '^22.22.2 || ^24.15.0 || >=26.0.0' };

export function nodeSelector(value) {
  if (typeof value !== 'string') return undefined;
  const version = value.trim();
  const range = semver.validRange(version);
  return range && range !== '*' ? { version, range } : undefined;
}

export function incompatible(selection, required) {
  return typeof required === 'string' && semver.validRange(required)
    && !semver.intersects(selection.range, required);
}

export function canResolveCompatibleNpm(selection) {
  return semver.intersects(selection.range, '~18.20.5 || ^20.17.0 || >=22.5.0');
}

const eol = {
  18: '2025-05-01', 19: '2023-06-01', 20: '2026-05-01', 21: '2024-06-01',
  22: '2027-05-01', 23: '2025-06-01', 24: '2028-05-01', 25: '2026-06-01',
  26: '2029-05-01',
};

export function eolMajor(selection, date) {
  const major = semver.minVersion(selection.range)?.major;
  if (major === undefined || !semver.subset(selection.range, String(major))) return undefined;
  if (major < 18 || (Object.hasOwn(eol, major) && date >= eol[major])) return major;
  return undefined;
}
