/**
 * Small helpers shared by data models, sheets and dice code.
 */

/**
 * Build a Health/Structure penalty track (core book p60 and p68).
 *
 * Box 1 carries no penalty; boxes 2-3 are -1, boxes 4-5 are -2 and every box from 6 on is -3.
 * Damage Resistance adds extra leading 0 boxes (standard warbird: Structure 5, DR 1 -> 0 0 -1 -1 -2).
 * Some Jet Age aircraft have hand-written tracks (MiG-23: 0 -1 -2) so a custom track string wins when given.
 *
 * @param {number} length         Number of boxes (Health or Structure).
 * @param {number} [dr=0]         Damage Resistance.
 * @param {string} [custom=""]    Optional explicit track, e.g. "0 -1 -2".
 * @returns {number[]}            The penalty under each box, most lenient first.
 */
export function buildPenaltyTrack(length, dr = 0, custom = "") {
  length = Math.max(0, Math.floor(Number(length) || 0));
  dr = Math.max(0, Math.floor(Number(dr) || 0));
  const track = [];

  const parsed = parseTrack(custom);
  if ( parsed.length ) {
    for ( let i = 0; i < length; i++ ) track.push(parsed[Math.min(i, parsed.length - 1)]);
    return track;
  }

  const zeros = 1 + dr;
  for ( let i = 1; i <= length; i++ ) {
    if ( i <= zeros ) track.push(0);
    else {
      const k = i - zeros;
      track.push(-Math.min(3, Math.ceil(k / 2)));
    }
  }
  return track;
}

/**
 * Parse a custom track string such as "0 0 -1 -1 -2" or "0,-1,-2" into integers.
 * @param {string} text
 * @returns {number[]}
 */
export function parseTrack(text) {
  if ( !text || (typeof text !== "string") ) return [];
  return text.split(/[\s,;]+/).map(t => t.trim()).filter(t => t.length)
    .map(t => Number(t)).filter(n => Number.isInteger(n)).map(n => (n === 0) ? 0 : -Math.abs(n));
}

/**
 * Describe the state of a creature or aircraft from damage taken vs. track length.
 * @param {number} damage   Damage taken (wounds or structure damage).
 * @param {number} max      Track length.
 * @param {number[]} track  The penalty track.
 * @returns {{penalty: number, filled: boolean, exceeded: boolean, doubled: boolean}}
 */
export function trackState(damage, max, track) {
  damage = Math.max(0, damage);
  const penalty = damage > 0 ? (track[Math.min(damage, max) - 1] ?? 0) : 0;
  return {
    penalty,
    filled: (max > 0) && (damage >= max),
    exceeded: damage > max,
    doubled: (max > 0) && (damage >= 2 * max)
  };
}

/**
 * Format a number with an explicit sign, e.g. +2 / -1 / +0.
 * @param {number} n
 * @returns {string}
 */
export function signed(n) {
  n = Number(n) || 0;
  return (n >= 0 ? "+" : "") + n;
}

/**
 * Sum a numeric property across an array of objects.
 * @param {object[]} items
 * @param {function(object): number} accessor
 * @returns {number}
 */
export function sumBy(items, accessor) {
  return items.reduce((total, item) => total + (Number(accessor(item)) || 0), 0);
}

/**
 * Sort entries of a TypedObjectField-style record into an array of {id, ...data} objects.
 * @param {Record<string, object>} record
 * @param {function(object, object): number} [compare]
 * @returns {object[]}
 */
export function recordToArray(record, compare) {
  const entries = Object.entries(record ?? {}).map(([id, data]) => ({ id, ...data }));
  if ( compare ) entries.sort(compare);
  return entries;
}
