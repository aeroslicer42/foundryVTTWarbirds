import { WARBIRDS } from "../config.mjs";

/**
 * The dogfight round (core p70): every pilot rolls Dogfighting, the highest roll shoots first at anyone lower, ties go
 * to the higher Situational Awareness and an SA tie means neither may shoot the other. The larger flight gets +1 per
 * extra plane over the enemy count (max +2). These helpers are pure so they can be tested outside Foundry.
 */

/** Token dispositions on one side of the fight: friendly tokens; everything else is the opposition. */
export function sideOf(disposition) {
  return disposition === 1 ? "friendly" : "enemy";
}

/**
 * The outnumbering bonus for a flight of `own` planes facing `other` planes.
 * @param {number} own
 * @param {number} other
 * @returns {number}
 */
export function outnumberBonus(own, other) {
  if ( !other || (own <= other) ) return 0;
  return Math.min(2, own - other);
}

/**
 * Order the round and work out who may shoot whom.
 *
 * @param {object[]} entries   One per aircraft in the fight:
 *   {id, name, img, initiative, sa, side: "friendly"|"enemy", rolled: boolean, crippled: boolean,
 *    defence: {type, value}|null}
 * @param {object} options
 * @param {number} options.round
 * @returns {object}   The card data: order, sides, shooters, losers, standoffs, ready.
 */
export function summarizeDogfight(entries, { round=1 }={}) {
  const ready = entries.length > 0 && entries.every(e => e.rolled && (e.initiative !== null) && (e.initiative !== undefined));
  const order = [...entries].sort((a, b) => ((b.initiative ?? -Infinity) - (a.initiative ?? -Infinity)) || ((b.sa ?? 0) - (a.sa ?? 0)) || a.name.localeCompare(b.name))
    .map((e, i) => ({ ...e, rank: i + 1, sideLabel: `WARBIRDS.Dogfight.side.${e.side}` }));

  const counts = { friendly: entries.filter(e => e.side === "friendly").length, enemy: entries.filter(e => e.side === "enemy").length };
  const bonus = { friendly: outnumberBonus(counts.friendly, counts.enemy), enemy: outnumberBonus(counts.enemy, counts.friendly) };
  const bonusSide = bonus.friendly ? "friendly" : bonus.enemy ? "enemy" : null;

  const shooters = [];
  const losers = new Map();
  const standoffs = [];
  if ( ready ) {
    for ( const a of order ) {
      const targets = [];
      for ( const b of order ) {
        if ( (a.id === b.id) || (a.side === b.side) ) continue;
        const lead = a.initiative - b.initiative;
        let shoots = lead > 0;
        let tie = false;
        if ( lead === 0 ) {
          if ( a.sa > b.sa ) { shoots = true; tie = true; }
          else if ( (a.sa === b.sa) && (a.id < b.id) ) standoffs.push({ a: a.name, b: b.name });
        }
        if ( !shoots ) continue;
        targets.push({ id: b.id, name: b.name, lead, tie });
        if ( !losers.has(b.id) ) losers.set(b.id, { id: b.id, name: b.name, img: b.img, attackers: [], defence: null, crippled: !!b.crippled });
        losers.get(b.id).attackers.push({ id: a.id, name: a.name, lead, tie });
      }
      if ( targets.length ) shooters.push({ id: a.id, name: a.name, img: a.img, targets });
    }
    for ( const loser of losers.values() ) {
      const entry = entries.find(e => e.id === loser.id);
      if ( entry?.defence?.type ) {
        loser.defence = {
          type: entry.defence.type,
          label: WARBIRDS.aircraftDefences[entry.defence.type] ?? entry.defence.type,
          value: entry.defence.value ?? null
        };
      }
    }
  }
  return {
    type: "dogfight",
    round,
    ready,
    order,
    counts,
    bonus: bonusSide ? { side: bonusSide, sideLabel: `WARBIRDS.Dogfight.side.${bonusSide}`, value: bonus[bonusSide], own: counts[bonusSide], other: counts[bonusSide === "friendly" ? "enemy" : "friendly"] } : null,
    oneSided: ready && !shooters.length && !standoffs.length,
    shooters,
    losers: Array.from(losers.values()),
    standoffs,
    choices: Object.keys(WARBIRDS.aircraftDefences).map(key => ({ key, label: WARBIRDS.aircraftDefences[key] }))
  };
}
