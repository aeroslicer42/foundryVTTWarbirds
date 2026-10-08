/**
 * Damage states as token status effects. The GM's client keeps them in step with the damage tracks: an aircraft's
 * Trailing Smoke / Crippled / Going Down, a vessel's Adrift / Destroyed and a person's Down but Not Out / Out of the
 * Fight / Dead. Going Down, Destroyed, Out of the Fight and Dead also mark the combatant defeated.
 * Icons are core Foundry ones (the default CONFIG.statusEffects set), so nothing needs shipping.
 */

export const STATUS_EFFECTS = [
  { id: "wbTrailingSmoke", name: "WARBIRDS.StatusEffect.trailingSmoke", img: "icons/svg/fire.svg" },
  { id: "wbCrippled", name: "WARBIRDS.StatusEffect.crippled", img: "icons/svg/downgrade.svg" },
  { id: "wbGoingDown", name: "WARBIRDS.StatusEffect.goingDown", img: "icons/svg/falling.svg" },
  { id: "wbAdrift", name: "WARBIRDS.StatusEffect.adrift", img: "icons/svg/anchor.svg" },
  { id: "wbDestroyed", name: "WARBIRDS.StatusEffect.destroyed", img: "icons/svg/skull.svg" },
  { id: "wbDownButNotOut", name: "WARBIRDS.StatusEffect.downButNotOut", img: "icons/svg/blood.svg" },
  { id: "wbOutOfTheFight", name: "WARBIRDS.StatusEffect.outOfTheFight", img: "icons/svg/unconscious.svg" }
];

/** Statuses that go on as a large overlay rather than a small icon. */
const OVERLAY = new Set(["wbGoingDown", "wbDestroyed", "wbOutOfTheFight"]);

/** Register the system statuses ahead of the core ones (init). */
export function registerStatusEffects() {
  const ids = new Set(STATUS_EFFECTS.map(s => s.id));
  CONFIG.statusEffects = [...STATUS_EFFECTS, ...CONFIG.statusEffects.filter(s => !ids.has(s.id))];
}

/**
 * Which system statuses an actor should carry, and whether it counts as defeated. Pure, for tests.
 * @param {Actor} actor
 * @returns {{statuses: Set<string>, defeated: boolean, dead: boolean}}
 */
export function desiredStatuses(actor) {
  const statuses = new Set();
  let defeated = false;
  let dead = false;
  const status = actor.system?.status;
  switch ( actor.type ) {
    case "aircraft":
      if ( status === "smoke" ) statuses.add("wbTrailingSmoke");
      if ( status === "crippled" ) statuses.add("wbCrippled");
      if ( status === "down" ) { statuses.add("wbGoingDown"); defeated = true; }
      break;
    case "vessel":
      if ( status === "adrift" ) statuses.add("wbAdrift");
      if ( status === "destroyed" ) { statuses.add("wbDestroyed"); defeated = true; }
      break;
    case "pilot":
    case "npc":
      if ( status === "down" ) statuses.add("wbDownButNotOut");
      if ( status === "out" ) { statuses.add("wbOutOfTheFight"); defeated = true; }
      if ( status === "dead" ) { dead = true; defeated = true; }
      break;
  }
  return { statuses, defeated, dead };
}

/**
 * Bring an actor's status effects and its combatants' defeated flag in line with its damage state.
 * Only writes what differs, so it is safe to call often. Meant for the active GM's client.
 * @param {Actor} actor
 * @returns {Promise<void>}
 */
export async function syncStatusEffects(actor) {
  if ( !actor || !["aircraft", "vessel", "pilot", "npc"].includes(actor.type) ) return;
  const want = desiredStatuses(actor);
  const current = actor.statuses ?? new Set();
  for ( const { id } of STATUS_EFFECTS ) {
    const active = want.statuses.has(id);
    if ( current.has(id) !== active ) await actor.toggleStatusEffect(id, { active, overlay: OVERLAY.has(id) });
  }
  // Dead people use the core "dead" status (the skull overlay the tracker already understands).
  const deadId = CONFIG.specialStatusEffects?.DEFEATED ?? "dead";
  if ( (actor.type === "pilot" || actor.type === "npc") && (current.has(deadId) !== want.dead) ) {
    await actor.toggleStatusEffect(deadId, { active: want.dead, overlay: true });
  }
  // Combatants in any encounter.
  for ( const combat of (game.combats ?? []) ) {
    for ( const combatant of combat.combatants ) {
      const same = (combatant.actor === actor) || (combatant.actor?.uuid === actor.uuid);
      if ( same && (!!combatant.defeated !== want.defeated) ) await combatant.update({ defeated: want.defeated });
    }
  }
}

/**
 * Sync every actor in the world and every token actor on the active scene (ready, and after a migration).
 * @returns {Promise<void>}
 */
export async function syncAllStatusEffects() {
  for ( const actor of game.actors ) await syncStatusEffects(actor);
  for ( const token of (canvas?.scene?.tokens ?? []) ) {
    if ( !token.actorLink && token.actor ) await syncStatusEffects(token.actor);
  }
}
