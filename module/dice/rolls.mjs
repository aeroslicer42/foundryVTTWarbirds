import { SYSTEM_ID, systemPath, WARBIRDS } from "../config.mjs";
import { signed } from "../utils.mjs";
import { promptCheck, promptAttack, promptBvr, messageMode } from "./dialogs.mjs";

const { renderTemplate } = foundry.applications.handlebars;

/* -------------------------------------------- */
/*  Core pipeline                               */
/* -------------------------------------------- */

/**
 * Evaluate a Rapidfire check (1d6 + bonus, or 2d6 keep one for a Knack) and post it to chat.
 *
 * @param {object} config
 * @param {Actor} config.actor
 * @param {string} config.title                        Card title ("Awareness", "Dogfighting"...).
 * @param {string} [config.subtitle]
 * @param {{label: string, value: number}[]} config.parts   Fixed bonus parts.
 * @param {number} [config.modifier=0]                 Situational modifier from the dialog.
 * @param {boolean} [config.knack=false]
 * @param {number} [config.extraDice=0]                Further dice rolled and dropped (helicopter Strafing).
 * @param {number|null} [config.difficulty=null]       Target number, or null for opposed / unknown.
 * @param {string} [config.difficultyLabel]
 * @param {string} [config.type="check"]
 * @param {string} [config.note]                       Extra rules note shown on the card.
 * @param {{combat: string, id: string}} [config.combatant]   Combatant whose initiative this roll sets (Dogfighting).
 * @returns {Promise<ChatMessage>}
 */
export async function rollCheck(config) {
  const parts = [...config.parts];
  if ( config.modifier ) parts.push({ label: game.i18n.localize("WARBIRDS.Roll.modifier"), value: config.modifier });
  const bonus = parts.reduce((n, p) => n + (Number(p.value) || 0), 0);
  const dice = 1 + (config.knack ? 1 : 0) + (config.extraDice ?? 0);
  const formula = `${dice > 1 ? `${dice}d6kh` : "1d6"}${bonus ? ` ${bonus >= 0 ? "+" : "-"} ${Math.abs(bonus)}` : ""}`;
  const roll = await new Roll(formula).evaluate();
  const die = roll.dice[0];
  const kept = die.results.find(r => r.active)?.result ?? die.total;
  const difficulty = (config.difficulty === undefined) ? null : config.difficulty;

  const card = {
    type: config.type ?? "check",
    title: config.title,
    subtitle: config.subtitle ?? "",
    actor: { uuid: config.actor.uuid, name: config.actor.name, img: config.actor.img },
    parts: parts.map(p => ({ label: p.label, value: signed(p.value) })),
    formula,
    knack: !!config.knack,
    dice: die.results.map(r => ({ result: r.result, active: r.active })),
    die: kept,
    bonus,
    total: roll.total,
    spent: 0,
    difficulty,
    difficultyLabel: config.difficultyLabel ?? game.i18n.localize("WARBIRDS.Roll.difficulty"),
    note: config.note ?? "",
    reserve: getReserve(config.actor),
    combatant: config.combatant ?? null
  };
  evaluateOutcome(card);

  const content = await renderTemplate(systemPath("templates/chat/check.hbs"), card);
  return ChatMessage.create({
    content,
    speaker: ChatMessage.getSpeaker({ actor: config.actor }),
    rolls: [roll],
    sound: CONFIG.sounds.dice,
    flags: { warbirds: { type: "check", card } }
  }, { messageMode: messageMode() });
}

/**
 * Success / failure, Lead and the critical-failure flag for a card.
 * @param {object} card
 */
function evaluateOutcome(card) {
  const total = card.total + card.spent;
  card.effectiveTotal = total;
  if ( card.difficulty === null || card.difficulty === undefined ) {
    card.success = null;
    card.lead = null;
    card.critFail = false;
    return;
  }
  card.success = total >= card.difficulty;
  card.lead = total - card.difficulty;
  // A natural 1 that misses by 3 or more may be turned into a critical failure (+1 XP, +1 Reserve).
  card.critFail = (card.die === 1) && (card.difficulty - total >= 3);
}

/**
 * Where this actor keeps Reserve, if anywhere.
 * @param {Actor} actor
 * @returns {{value: number, max: number, path: string}|null}
 */
export function getReserve(actor) {
  if ( actor.type === "pilot" ) return { value: actor.system.reserve.value, max: actor.system.reserve.max, path: "system.reserve.value" };
  if ( actor.type === "aircraft" ) {
    const pilot = actor.system.pilotActor;
    if ( pilot ) return { value: pilot.system.reserve.value, max: pilot.system.reserve.max, path: "system.reserve.value", uuid: pilot.uuid };
    return { value: actor.system.crew.reserve.value, max: actor.system.crew.reserve.max, path: "system.crew.reserve.value" };
  }
  return null;
}

/**
 * Roll one or more attacks with a weapon against a Defence, work out Lead and damage, and post a card.
 *
 * @param {object} config
 * @param {Actor} config.actor
 * @param {Item|null} config.item               The weapon item (null for improvised attacks).
 * @param {string} config.title
 * @param {{label: string, value: number}[]} config.parts
 * @param {number} config.modifier
 * @param {{name: string, damage: number, ap: number}} config.weapon
 * @param {number} config.attacks
 * @param {number|null} config.defence
 * @param {string} config.defenceLabel
 * @param {number|null} config.armour           Target Armour (aircraft) or Resist (people), before AP.
 * @param {string} config.armourLabel
 * @param {string} config.scale                 "none" | "down" (person vs vehicle, /3) | "up" (vehicle vs person, x3)
 * @param {object|null} config.target           {uuid, name, img}
 * @param {boolean} config.consumeAmmo
 * @param {{id: string|null, name: string, roll: number|null}} [config.part]   Vessel sub-system hit (null id = main).
 * @param {number} [config.extraDice=0]         Extra d6 rolled to hit, keeping the best (Meteor).
 * @param {boolean} [config.missOnOne=false]    A natural 1 always misses.
 * @param {object[]} [config.lines]             Several outcomes per roll: [{target, defence, defenceLabel, armour, part}]
 *                                              (a grouped-target weapon, or a heavy bomb hitting two locations).
 * @returns {Promise<ChatMessage>}
 */
export async function rollAttack(config) {
  const parts = [...config.parts];
  if ( config.modifier ) parts.push({ label: game.i18n.localize("WARBIRDS.Roll.modifier"), value: config.modifier });
  // Vehicle weapons are -2 against person-sized targets, unless the weapon is fragmentary (core p118).
  if ( (config.scale === "up") && !config.weapon.fragmentary ) parts.push({ label: game.i18n.localize("WARBIRDS.Roll.scaleUpPenalty"), value: -2 });
  const bonus = parts.reduce((n, p) => n + (Number(p.value) || 0), 0);
  const dice = 1 + (config.extraDice ?? 0);
  const formula = `${dice > 1 ? `${dice}d6kh` : "1d6"}${bonus ? ` ${bonus >= 0 ? "+" : "-"} ${Math.abs(bonus)}` : ""}`;
  const effectiveArmour = armour => (armour === null || armour === undefined) ? null : (config.weapon.ignoresArmour ? 0 : Math.max(0, armour - config.weapon.ap));
  const multi = Array.isArray(config.lines) && (config.lines.length > 0);
  const lines = multi ? config.lines : [{ target: null, defence: config.defence, armour: config.armour, part: config.part ?? null }];
  const armourEffective = effectiveArmour(config.armour);

  const rolls = [];
  const attacks = [];
  for ( let i = 0; i < config.attacks; i++ ) {
    const roll = await new Roll(formula).evaluate();
    rolls.push(roll);
    const die = roll.dice[0].total;
    const results = roll.dice[0].results.map(r => ({ result: r.result, active: r.active }));
    const autoMiss = !!config.missOnOne && (die === 1);
    lines.forEach((line, j) => {
      const attack = { index: multi ? `${i}.${j}` : String(i), die, dice: results, total: roll.total, hit: null, lead: null, damage: null, final: null, autoMiss };
      if ( multi ) Object.assign(attack, { target: line.target, part: line.part ?? null, defence: line.defence, defenceLabel: line.defenceLabel ?? "", armour: line.armour ?? null, armourEffective: effectiveArmour(line.armour) });
      const defence = line.defence;
      const armourEff = multi ? attack.armourEffective : armourEffective;
      if ( defence !== null && defence !== undefined ) {
        attack.hit = !autoMiss && (roll.total >= defence);
        attack.lead = roll.total - defence;
        if ( attack.hit ) {
          let damage = config.weapon.damage + attack.lead;
          if ( config.scale === "down" ) damage = Math.round(damage / 3);
          if ( config.scale === "up" ) damage = damage * 3;
          attack.damage = damage;
          attack.final = (armourEff === null) ? null : Math.max(0, damage - armourEff);
        }
      }
      else if ( autoMiss ) attack.hit = false;
      attacks.push(attack);
    });
  }

  const card = {
    type: "attack",
    title: config.title,
    actor: { uuid: config.actor.uuid, name: config.actor.name, img: config.actor.img },
    weapon: config.weapon,
    parts: parts.map(p => ({ label: p.label, value: signed(p.value) })),
    formula,
    bonus,
    extraDice: config.extraDice ?? 0,
    attacks,
    multi,
    defence: multi ? null : config.defence,
    defenceLabel: config.defenceLabel,
    armour: multi ? null : config.armour,
    armourEffective,
    armourLabel: config.armourLabel,
    target: config.target,
    part: multi ? null : (config.part ?? null),
    scale: config.scale,
    applied: {},
    kills: null,
    ammo: null
  };

  // Ammo, and the round the weapon fired (cooldowns and capacitor recharge are tracked against the active combat).
  if ( config.item ) {
    const updates = {};
    if ( config.consumeAmmo && config.item.system.ammo?.tracked ) {
      const remaining = Math.max(0, config.item.system.ammo.value - config.attacks);
      updates["system.ammo.value"] = remaining;
      card.ammo = { remaining, max: config.item.system.ammo.max, empty: remaining <= 0 };
    }
    const combat = globalThis.game?.combat;
    if ( combat?.started && (config.item.system.cooldown || (config.item.system.recharge === "round")) ) {
      updates["system.lastFired"] = { combat: combat.id, round: combat.round };
      if ( config.item.system.cooldown ) card.readyRound = combat.round + config.item.system.cooldown + 1;
    }
    if ( Object.keys(updates).length ) await config.item.update(updates);
  }
  card.footer = !!(card.ammo || card.readyRound);

  const content = await renderTemplate(systemPath("templates/chat/attack.hbs"), card);
  return ChatMessage.create({
    content,
    speaker: ChatMessage.getSpeaker({ actor: config.actor }),
    rolls,
    sound: CONFIG.sounds.dice,
    flags: { warbirds: { type: "attack", card } }
  }, { messageMode: messageMode() });
}

/* -------------------------------------------- */
/*  Targets                                     */
/* -------------------------------------------- */

/**
 * Describe a targeted token for the attack dialog.
 * @param {Token} token
 * @returns {object|null}
 */
function describeTarget(token) {
  const actor = token?.actor;
  if ( !actor ) return null;
  const base = { uuid: actor.uuid, name: token.name, img: actor.img };
  if ( actor.type === "aircraft" ) {
    const t = actor.system.totals;
    const r = actor.system.ratings;
    // The defence this aircraft chose on the dogfight round card (combatant flag, valid for the current round only).
    const combatant = token.combatant ?? null;
    const chosen = combatant?.flags?.warbirds?.defence;
    const chosenDefence = (chosen && (chosen.round === (combatant.combat ?? combatant.parent)?.round)) ? { type: chosen.type, value: chosen.value ?? null } : null;
    return { ...base, kind: "aircraft", defences: { break: r.breakDefence, escape: r.escapeDefence, shoot: r.shootDefence, performance: t.performance }, epm: t.epm, armour: t.armour, chosenDefence };
  }
  if ( (actor.type === "pilot") || (actor.type === "npc") ) {
    return { ...base, kind: "creature", defences: { defence: actor.system.defence.value }, resist: actor.system.resist.value };
  }
  if ( actor.type === "vessel" ) {
    const t = actor.system.totals;
    return {
      ...base, kind: "vessel",
      defences: { main: t.defence }, armour: actor.system.armour, threat: t.threat,
      parts: t.subsystems.map(s => ({ id: s.id, name: s.name, defence: s.defence, armour: s.armour, disabled: s.disabled, locations: s.locations }))
    };
  }
  return { ...base, kind: "other", defences: {} };
}

/**
 * Describe the user's first targeted token for the attack dialog.
 * @returns {object|null}
 */
export function currentTarget() {
  return describeTarget(game.user.targets.first());
}

/**
 * Describe every targeted token (grouped-target weapons roll once against each).
 * @returns {object[]}
 */
export function currentTargets() {
  return Array.from(game.user.targets).map(describeTarget).filter(Boolean);
}

/**
 * The Threat of the user's first target: a vessel's current Threat, or the Threat of a bomber / courier-style aircraft
 * (Jet Age p31: bombers are strafed like couriers). Null when the target has none.
 * @returns {number|null}
 */
function targetedThreat() {
  const actor = game.user.targets.first()?.actor;
  if ( !actor ) return null;
  if ( actor.type === "vessel" ) return actor.system.totals.threat;
  if ( (actor.type === "aircraft") && (actor.system.threat > 0) ) return actor.system.threat;
  return null;
}

/* -------------------------------------------- */
/*  Sheet-level rolls                           */
/* -------------------------------------------- */

const loc = key => game.i18n.localize(key);

/**
 * Common penalty parts for a person: wound penalty and Life on the Line.
 * @param {Actor} actor
 * @returns {{label: string, value: number}[]}
 */
function creaturePenaltyParts(actor) {
  const d = actor.system.computeDerived();
  const parts = [];
  if ( d.penalty ) parts.push({ label: loc("WARBIRDS.Roll.woundPenalty"), value: d.penalty });
  if ( d.lotl ) parts.push({ label: loc("WARBIRDS.Pilot.lifeOnTheLine"), value: d.lotl });
  return parts;
}

/**
 * Roll a ground skill from a pilot or threat NPC sheet.
 * @param {Actor} actor
 * @param {string} skillId
 */
export async function rollSkill(actor, skillId) {
  const skill = actor.system.skills[skillId];
  if ( !skill ) return;
  const stats = actor.system.stats;
  const statChoices = WARBIRDS.stats;
  const parts = [{ label: skill.name, value: skill.level }];
  const toggles = [];
  const standing = actor.type === "pilot" ? actor.system.standingInfo : null;
  if ( standing && WARBIRDS.standingSkills.includes(skillId) ) {
    toggles.push({ key: "standing", label: game.i18n.format("WARBIRDS.Roll.standingBonus", { stat: loc(WARBIRDS.standingModes[standing.mode]) }), value: standing.value, checked: false });
    if ( standing.scandalPenalty ) parts.push({ label: loc("WARBIRDS.Standing.scandal"), value: standing.scandalPenalty });
  }
  if ( skill.level === 0 ) toggles.push({ key: "unskilled", label: loc("WARBIRDS.Roll.unskilled"), value: -2, checked: true });
  const choice = await promptCheck({
    title: `${skill.name}`,
    parts: [{ label: loc(statChoices[skill.stat]), value: stats[skill.stat] }, ...parts, ...creaturePenaltyParts(actor)],
    stat: { current: skill.stat, choices: statChoices, values: stats },
    toggles,
    showKnack: true,
    knack: !!skill.knack,
    difficulty: null
  });
  if ( !choice ) return;
  const stat = choice.stat ?? skill.stat;
  const finalParts = [{ label: loc(statChoices[stat]), value: stats[stat] }, ...parts, ...creaturePenaltyParts(actor)];
  for ( const t of toggles ) if ( choice.toggles[t.key] ) finalParts.push({ label: t.label, value: t.value });
  return rollCheck({ actor, title: skill.name, subtitle: loc("WARBIRDS.Roll.skillCheck"), parts: finalParts, modifier: choice.modifier, knack: choice.knack, difficulty: choice.difficulty });
}

/**
 * Roll a bare stat (1d6 + stat), e.g. Spirit vs 5 to bail out.
 * @param {Actor} actor
 * @param {string} stat
 */
export async function rollStat(actor, stat) {
  const label = loc(WARBIRDS.stats[stat]);
  const value = actor.system.stats[stat];
  const choice = await promptCheck({ title: label, parts: [{ label, value }, ...creaturePenaltyParts(actor)], difficulty: null });
  if ( !choice ) return;
  return rollCheck({ actor, title: label, subtitle: loc("WARBIRDS.Roll.statCheck"), parts: [{ label, value }, ...creaturePenaltyParts(actor)], modifier: choice.modifier, difficulty: choice.difficulty });
}

/**
 * Roll a flight skill from the pilot sheet (SA + skill), for checks outside a dogfight.
 * @param {Actor} actor
 * @param {string} key
 */
export async function rollFlightSkill(actor, key) {
  const skill = actor.system.flightSkills[key];
  const label = loc(WARBIRDS.flightSkills[key]);
  const d = actor.system.computeDerived();
  const parts = [{ label: loc("WARBIRDS.Stats.sa"), value: d.sa }, { label, value: skill.level }, ...creaturePenaltyParts(actor)];
  const choice = await promptCheck({ title: label, parts, showKnack: true, knack: !!skill.knack, difficulty: null });
  if ( !choice ) return;
  return rollCheck({ actor, title: label, subtitle: loc("WARBIRDS.Roll.flightSkillCheck"), parts, modifier: choice.modifier, knack: choice.knack, difficulty: choice.difficulty });
}

/**
 * Build the bonus parts of an aircraft rating for the card.
 * @param {Actor} aircraft
 * @param {string} key   dogfighting | strafing | gunnery | ordinance | ew | stunt
 * @returns {{label: string, value: number}[]}
 */
export function ratingParts(aircraft, key) {
  const sys = aircraft.system;
  const fs = sys.flightStats;
  const t = sys.totals;
  const m = t.mods;
  const parts = [{ label: loc("WARBIRDS.Stats.sa"), value: fs.sa }];
  const skillKey = { dogfighting: "piloting", strafing: "strafing", gunnery: "gunnery", ordinance: "ordinance", ew: "ew", stunt: "piloting" }[key];
  parts.push({ label: loc(WARBIRDS.flightSkills[skillKey]), value: fs[skillKey] });
  if ( ["dogfighting", "strafing"].includes(key) ) parts.push({ label: loc("WARBIRDS.Aircraft.performance"), value: t.performance });
  if ( key === "ew" && t.radar ) parts.push({ label: loc("WARBIRDS.Aircraft.radar"), value: t.radar });
  const traitMod = key === "stunt" ? m.stuntDefence + m.stunt : m[key];
  if ( traitMod ) parts.push({ label: loc("WARBIRDS.Roll.traits"), value: traitMod });
  if ( t.penalty ) parts.push({ label: loc("WARBIRDS.Roll.structurePenalty"), value: t.penalty });
  if ( fs.penalty ) parts.push({ label: loc("WARBIRDS.Roll.woundPenalty"), value: fs.penalty });
  if ( fs.lotl ) parts.push({ label: loc("WARBIRDS.Pilot.lifeOnTheLine"), value: fs.lotl });
  return parts;
}

/**
 * Roll Dogfighting, Strafing, Electronic Warfare or Stunt Defence from the aircraft sheet.
 * @param {Actor} aircraft
 * @param {string} key
 */
export async function rollRating(aircraft, key) {
  const sys = aircraft.system;
  const r = sys.ratings;
  const t = sys.totals;
  const parts = ratingParts(aircraft, key);
  const titles = { dogfighting: "WARBIRDS.Ratings.dogfighting", strafing: "WARBIRDS.Ratings.strafing", ew: "WARBIRDS.Ratings.ew", stunt: "WARBIRDS.Defence.stunt" };
  const title = loc(titles[key] ?? key);
  const toggles = [];
  let allowDifficulty = true;
  let difficultyLabel;
  let note = "";
  const combatant = key === "dogfighting" ? activeCombatant(aircraft) : null;
  if ( key === "dogfighting" ) {
    allowDifficulty = false;
    // In a combat, the outnumbering bonus is worked out from the two flights (token dispositions) and pre-ticked.
    const outnumber = combatant?.parent?.outnumberBonusFor?.(combatant) ?? 0;
    toggles.push({ key: "disengage", label: loc("WARBIRDS.Roll.disengaging"), value: r.disengage, checked: false });
    toggles.push({ key: "wingmen1", label: loc("WARBIRDS.Roll.outnumber1"), value: 1, checked: outnumber === 1 });
    toggles.push({ key: "wingmen2", label: loc("WARBIRDS.Roll.outnumber2"), value: 2, checked: outnumber === 2 });
    if ( r.autoLose ) note = loc("WARBIRDS.Aircraft.crippledWarning");
  }
  let difficulty = null;
  if ( key === "strafing" ) {
    difficultyLabel = loc("WARBIRDS.Aircraft.threat");
    toggles.push({ key: "close", label: loc("WARBIRDS.Roll.cuttingItClose"), value: -1, checked: false });
    difficulty = targetedThreat();
  }
  if ( key === "ew" ) {
    allowDifficulty = false;
    toggles.push({ key: "controller", label: loc("WARBIRDS.Roll.controllerSupport"), value: 2, checked: false });
    toggles.push({ key: "high", label: loc("WARBIRDS.Roll.highAltitude"), value: -2, checked: false });
    toggles.push({ key: "drag", label: loc("WARBIRDS.Roll.afterDrag"), value: -2, checked: false });
    toggles.push({ key: "low", label: loc("WARBIRDS.Roll.lowLost"), value: -2, checked: false });
    note = t.hasRadar ? loc("WARBIRDS.Roll.ewResults") : loc("WARBIRDS.Roll.noRadar");
  }
  if ( key === "stunt" ) {
    allowDifficulty = false;
    if ( !r.canStunt ) note = loc("WARBIRDS.Aircraft.noStunts");
  }
  const extraDice = (key === "strafing") && t.strafingDie ? 1 : 0;
  if ( extraDice ) note = [note, loc("WARBIRDS.Roll.helicopterStrafing")].filter(Boolean).join(" ");
  const choice = await promptCheck({ title, parts, toggles, allowDifficulty, difficultyLabel, difficulty });
  if ( !choice ) return;
  const finalParts = [...parts];
  for ( const tg of toggles ) if ( choice.toggles[tg.key] ) finalParts.push({ label: tg.label, value: tg.value });
  // A Dogfighting roll is the round's initiative: when the aircraft is in the active combat, the tracker follows it.
  const message = await rollCheck({
    actor: aircraft, title, subtitle: key === "stunt" ? loc("WARBIRDS.Roll.stuntDefenceRoll") : loc("WARBIRDS.Roll.ratingRoll"),
    parts: finalParts, modifier: choice.modifier, difficulty: choice.difficulty, difficultyLabel, note, type: key, extraDice,
    combatant: combatant ? { combat: combatant.parent.id, id: combatant.id } : null
  });
  if ( combatant && message ) await combatant.update({ initiative: message.flags.warbirds.card.total, "flags.warbirds.dogfightRound": combatant.parent.round ?? 0 });
  return message;
}

/**
 * The combatant representing this actor in the active combat, if any.
 * @param {Actor} actor
 * @returns {Combatant|null}
 */
export function activeCombatant(actor) {
  const combat = globalThis.game?.combat;
  if ( !combat?.started ) return null;
  return combat.combatants.find(c => (c.actor === actor) || (c.actor?.uuid === actor.uuid)) ?? null;
}

/**
 * Roll a combatant's Dogfighting as its initiative for the round (core p70: every pilot rolls Dogfighting each round;
 * the highest roll shoots first). Crippled aircraft automatically lose; bombers and couriers do not roll at all.
 * @param {Combatant} combatant
 * @param {object} [options]
 * @param {number} [options.round]       The round being rolled for (shown on the card).
 * @param {number} [options.outnumber]   Outnumbering bonus for this aircraft's flight (+1 per extra plane, max +2).
 * @returns {Promise<ChatMessage|void>}
 */
export async function rollDogfightingInitiative(combatant, { round, outnumber=0 }={}) {
  const aircraft = combatant.actor;
  if ( aircraft?.type !== "aircraft" ) return;
  const sys = aircraft.system;
  round ??= combatant.parent?.round ?? 0;
  if ( sys.threat > 0 ) {                                   // bomber / courier: strafed, never dogfights
    if ( combatant.initiative !== 0 ) await combatant.update({ initiative: 0 });
    return;
  }
  const title = loc("WARBIRDS.Ratings.dogfighting");
  const subtitle = game.i18n.format("WARBIRDS.Roll.initiativeRound", { round });
  const ref = { combat: combatant.parent.id, id: combatant.id };
  if ( sys.ratings.autoLose ) {
    await combatant.update({ initiative: -10, "flags.warbirds.dogfightRound": round });
    const card = {
      title, subtitle, actor: { uuid: aircraft.uuid, name: aircraft.name, img: aircraft.img }, icon: "fa-solid fa-plane-slash",
      lines: [loc("WARBIRDS.Roll.initiativeAutoLose")]
    };
    const content = await renderTemplate(systemPath("templates/chat/note.hbs"), card);
    return ChatMessage.create({ content, speaker: ChatMessage.getSpeaker({ actor: aircraft }), flags: { warbirds: { type: "note", card } } }, { messageMode: messageMode() });
  }
  const parts = ratingParts(aircraft, "dogfighting");
  if ( outnumber ) parts.push({ label: loc(outnumber >= 2 ? "WARBIRDS.Roll.outnumber2" : "WARBIRDS.Roll.outnumber1"), value: outnumber });
  const message = await rollCheck({ actor: aircraft, title, subtitle, parts, difficulty: null, type: "dogfighting", combatant: ref });
  await combatant.update({ initiative: message.flags.warbirds.card.total, "flags.warbirds.dogfightRound": round });
  return message;
}

/**
 * The loser of a Dogfighting roll picks how they defend this round (core p70): Break, Escape (must disengage next
 * round), Shoot (−2, fires after being shot at) or a Stunt (rolled now). Stored on the combatant so the Fire dialog
 * defaults to it; an empty type clears the choice.
 * @param {Combatant} combatant
 * @param {string} type   break | escape | shoot | stunt | ""
 * @returns {Promise<ChatMessage|void>}
 */
export async function chooseDefence(combatant, type) {
  const combat = combatant.combat ?? combatant.parent;
  const aircraft = combatant.actor;
  if ( !combat || !aircraft ) return;
  if ( !type ) return combatant.update({ "flags.warbirds.-=defence": null });
  let value = null;
  if ( type === "stunt" ) {
    const message = await rollRating(aircraft, "stunt");
    if ( !message ) return;
    value = message.flags.warbirds.card.total;
  }
  await combatant.update({ "flags.warbirds.defence": { type, value, round: combat.round } });
  const card = {
    title: loc("WARBIRDS.Dogfight.choiceTitle"),
    subtitle: game.i18n.format("WARBIRDS.Dogfight.round", { round: combat.round }),
    actor: { uuid: aircraft.uuid, name: combatant.name ?? aircraft.name, img: combatant.img ?? aircraft.img },
    icon: "fa-solid fa-shield-halved",
    choice: { label: loc("WARBIRDS.Dogfight.defends"), value: `${loc(WARBIRDS.aircraftDefences[type])}${value === null ? "" : ` ${value}`}` },
    lines: [loc(`WARBIRDS.Dogfight.choice.${type}`)]
  };
  const content = await renderTemplate(systemPath("templates/chat/note.hbs"), card);
  return ChatMessage.create({ content, speaker: ChatMessage.getSpeaker({ actor: aircraft }), flags: { warbirds: { type: "note", card } } }, { messageMode: messageMode() });
}

/**
 * The better of an aircraft's Gunnery and Ordinance ratings, for weapons that may use either skill.
 * @param {Actor} aircraft
 * @returns {"gunnery"|"ordinance"}
 */
export function bestWeaponSkill(aircraft) {
  const r = aircraft.system.ratings;
  return (r.ordinance > r.gunnery) ? "ordinance" : "gunnery";
}

/**
 * Rules reminders for the attack dialog: cooldown, target restrictions, multiple targets.
 * @param {object} w            The weapon's system data.
 * @param {object[]} targets    Target descriptors.
 * @param {boolean} grouped     Whether every target will be rolled against.
 * @returns {string[]}
 */
function weaponWarnings(w, targets, grouped) {
  const out = [];
  const cooling = w.cooling;
  if ( cooling?.active ) out.push(game.i18n.format("WARBIRDS.Roll.coolingDown", { round: cooling.readyRound }));
  const considered = grouped ? targets : targets.slice(0, 1);
  for ( const t of considered ) {
    if ( w.flags.slowTargets && (t.kind === "aircraft") && (t.defences.performance > 1) ) out.push(game.i18n.format("WARBIRDS.Roll.slowTargetsWarning", { name: t.name, performance: t.defences.performance }));
    if ( w.flags.antiShip && (t.kind !== "vessel") ) out.push(game.i18n.format("WARBIRDS.Roll.antiShipWarning", { name: t.name }));
    if ( w.flags.noPersonnel && (t.kind === "creature") ) out.push(game.i18n.format("WARBIRDS.Roll.noPersonnelWarning", { name: t.name }));
  }
  if ( (targets.length > 1) && !grouped ) out.push(game.i18n.localize("WARBIRDS.Roll.firstTargetOnly"));
  return out;
}

/**
 * The Defence, label and armour one target offers against the chosen defence type.
 * @param {object} target     Target descriptor.
 * @param {object} choice     Attack dialog result.
 * @param {boolean} typed     Use the typed number from the dialog instead of the target's own.
 * @returns {{defence: number|null, defenceLabel: string, armour: number|null, part: object|null}}
 */
function targetDefence(target, choice, typed) {
  let defence = typed ? choice.defence : null;
  let armour = typed ? choice.armour : null;
  let label = loc("WARBIRDS.Roll.defence");
  let part = null;
  if ( target.kind === "aircraft" ) {
    const d = target.defences;
    const own = { break: d.break, escape: d.escape, shoot: d.shoot, drag: d.escape + 2, performance: d.performance }[choice.defenceType];
    if ( !typed ) { defence = own ?? choice.defence; armour = target.armour; }
    if ( WARBIRDS.aircraftDefences[choice.defenceType] ) label = `${loc(WARBIRDS.aircraftDefences[choice.defenceType])} ${label}`;
    if ( choice.defenceType === "performance" ) label = loc("WARBIRDS.Roll.ambushDefence");
    if ( choice.defenceType === "drag" ) label = loc("WARBIRDS.Roll.dragDefence");
    if ( (defence !== null) && choice.applyEPM && target.epm ) {
      defence += target.epm;
      label += ` + ${loc("WARBIRDS.Aircraft.epm")} ${target.epm}`;
    }
  }
  else if ( target.kind === "creature" ) {
    if ( !typed ) { defence = target.defences.defence + (choice.defenceType === "allout" ? 2 : 0); armour = target.resist; }
    if ( choice.defenceType === "allout" ) label = loc("WARBIRDS.Roll.allOutDefence");
  }
  else if ( target.kind === "vessel" ) {
    if ( !typed ) { defence = target.defences.main; armour = target.armour; }
    part = { id: null, name: loc("WARBIRDS.Vessel.mainStructure"), roll: null };
    label = `${loc("WARBIRDS.Vessel.mainStructure")} ${label}`;
  }
  return { defence, defenceLabel: label, armour, part };
}

/**
 * Fire a weapon: aircraft guns/ordinance/missiles from an aircraft, or personal weapons from a person.
 * @param {Actor} actor
 * @param {Item} item
 */
export async function fireWeapon(actor, item) {
  const w = item.system;
  const aerial = actor.type === "aircraft";
  const targets = currentTargets();
  const target = targets[0] ?? null;
  // Grouped-target weapons roll once against every target; fragmentary ones hit everyone in the blast the same way.
  const grouped = aerial && !!(w.flags.grouped || w.flags.fragmentary) && (targets.length > 1);
  let parts;
  let skillKey = w.skillKey;
  if ( aerial ) {
    if ( skillKey === "best" ) skillKey = bestWeaponSkill(actor);
    const key = skillKey === "ordinance" ? "ordinance" : "gunnery";
    parts = ratingParts(actor, key);
    if ( w.accuracy ) parts.push({ label: loc("WARBIRDS.Weapon.accuracy"), value: w.accuracy });
    if ( w.category === "missile" && actor.system.totals.radar ) parts.push({ label: loc("WARBIRDS.Aircraft.radar"), value: actor.system.totals.radar });
  }
  else if ( actor.type === "npc" && actor.system.isThug ) {
    parts = [{ label: loc("WARBIRDS.Npc.attack"), value: actor.system.attack }];
    if ( w.accuracy ) parts.push({ label: loc("WARBIRDS.Weapon.accuracy"), value: w.accuracy });
  }
  else {
    skillKey = skillKey === "closeCombat" ? "closeCombat" : "shooting";
    const level = actor.system.skillLevel(skillKey);
    parts = [{ label: loc("WARBIRDS.Stats.body"), value: actor.system.stats.body }, { label: loc(WARBIRDS.skills[skillKey].label), value: level }];
    if ( level === 0 ) parts.push({ label: loc("WARBIRDS.Roll.unskilled"), value: -2 });
    if ( w.accuracy ) parts.push({ label: loc("WARBIRDS.Weapon.accuracy"), value: w.accuracy });
    parts.push(...creaturePenaltyParts(actor));
  }
  if ( w.ammo.tracked && w.ammo.value <= 0 ) {
    ui.notifications.warn("WARBIRDS.Notifications.outOfAmmo", { localize: true, format: { name: item.name } });
  }

  const choice = await promptAttack({
    title: `${item.name}`,
    parts,
    weapon: {
      name: item.name, damage: w.damage, ap: w.ap, attacksPerRound: w.attacksPerRound, ammo: w.ammo,
      isMissile: w.category === "missile", isOrdinance: ["ordinance", "missile"].includes(w.category), ignoresEPM: !!w.flags.ignoresEPM,
      special: w.special, altMode: w.hasAltMode ? w.altMode : null, twoLocations: !!w.flags.twoLocations,
      extraDie: !!w.flags.extraDie, missOnOne: !!w.flags.missOnOne, fragmentary: !!w.flags.fragmentary
    },
    target,
    targets: grouped ? targets : null,
    warnings: weaponWarnings(w, targets, grouped),
    aerial
  });
  if ( !choice ) return;

  let damage = w.damage;
  if ( choice.altMode && w.hasAltMode ) {
    if ( w.altMode.accuracy ) parts.push({ label: w.altMode.label, value: w.altMode.accuracy });
    damage = Math.max(0, damage + w.altMode.damage);
  }
  const weapon = { name: item.name, damage, ap: w.ap, category: w.category, ignoresArmour: !!w.flags.ignoresArmour, fragmentary: !!w.flags.fragmentary };
  const armourLabel = loc(target?.kind === "creature" ? "WARBIRDS.Secondary.resist" : "WARBIRDS.Aircraft.armour");
  const common = {
    actor, item, title: item.name, parts, modifier: choice.modifier, weapon, attacks: choice.attacks, armourLabel,
    scale: choice.scale, consumeAmmo: choice.consumeAmmo, extraDice: w.flags.extraDie ? 1 : 0, missOnOne: !!w.flags.missOnOne
  };
  const typed = ["custom", "stunt"].includes(choice.defenceType);

  // Grouped-target weapons (burst missiles, cluster bombs on a formation): one roll, compared with every target's own Defence.
  if ( grouped ) {
    const lines = targets.map(t => {
      const d = targetDefence(t, choice, typed);
      return { target: { uuid: t.uuid, name: t.name, img: t.img }, ...d };
    });
    const first = targetDefence(targets[0], choice, typed);
    return rollAttack({ ...common, lines, defence: null, defenceLabel: `${first.defenceLabel} · ${loc("WARBIRDS.Roll.perTarget")}`, armour: null, target: null });
  }

  let defence = choice.defence;
  let armour = choice.armour;
  let defenceLabel = loc("WARBIRDS.Roll.defence");
  let part = null;
  if ( target?.kind === "aircraft" && WARBIRDS.aircraftDefences[choice.defenceType] ) defenceLabel = `${loc(WARBIRDS.aircraftDefences[choice.defenceType])} ${loc("WARBIRDS.Roll.defence")}`;
  if ( choice.defenceType === "performance" ) defenceLabel = loc("WARBIRDS.Roll.ambushDefence");
  if ( choice.defenceType === "drag" ) defenceLabel = loc("WARBIRDS.Roll.dragDefence");
  if ( choice.defenceType === "allout" ) defenceLabel = loc("WARBIRDS.Roll.allOutDefence");
  if ( (defence !== null) && choice.applyEPM && target?.epm ) {
    defence += target.epm;
    defenceLabel += ` + ${loc("WARBIRDS.Aircraft.epm")} ${target.epm}`;
  }
  const targetRef = target ? { uuid: target.uuid, name: target.name, img: target.img } : null;
  if ( target?.kind === "vessel" ) {
    const resolved = await resolveVesselPart(target, choice);
    part = resolved.part;
    if ( resolved.defence !== null ) { defence = resolved.defence; armour = resolved.armour; }
    defenceLabel = resolved.label;
    // Heavy bombs hit two different locations: the chosen / rolled one, then a second pick (random by default).
    if ( w.flags.twoLocations && resolved.part ) {
      const second = await resolveVesselPart(target, { ...choice, defenceType: choice.defenceType2 || "random", defence: null, armour: null }, resolved.part.id);
      if ( second.part ) {
        const lines = [resolved, second].map(r => ({ target: targetRef, defence: r.defence, defenceLabel: r.label, armour: r.armour, part: r.part }));
        return rollAttack({ ...common, lines, defence: null, defenceLabel: loc("WARBIRDS.Roll.twoLocations"), armour: null, target: targetRef });
      }
    }
  }
  return rollAttack({ ...common, defence, defenceLabel, armour, target: targetRef, part });
}

/**
 * Work out which part of a vessel is being attacked: the main Structure, a chosen sub-system, or a random one
 * from a d6 location roll (ordinance).
 * @param {object} target             The vessel target descriptor from currentTarget().
 * @param {object} choice             The attack dialog result.
 * @param {string|null} [exclude]     A part id (null = main Structure) that must not come up again (second location).
 * @returns {Promise<{part: object|null, defence: number|null, armour: number|null, label: string}>}
 */
async function resolveVesselPart(target, choice, exclude=undefined) {
  const main = { part: { id: null, name: loc("WARBIRDS.Vessel.mainStructure"), roll: null }, defence: choice.defence ?? target.defences.main, armour: choice.armour ?? target.armour, label: `${loc("WARBIRDS.Vessel.mainStructure")} ${loc("WARBIRDS.Roll.defence")}` };
  if ( choice.defenceType === "custom" ) return { part: null, defence: null, armour: null, label: loc("WARBIRDS.Roll.defence") };
  if ( (choice.defenceType === "main") && (exclude !== null) ) return main;
  if ( (choice.defenceType === "random") || (choice.defenceType === "main") || (exclude !== undefined && choice.defenceType === exclude) ) {
    const vessel = await fromUuid(target.uuid);
    // Candidate location numbers; a second location skips the numbers that lead to the excluded part.
    const numbers = [1, 2, 3, 4, 5, 6].filter(n => (exclude === undefined) || ((vessel?.system.hitLocation(n)?.id ?? null) !== exclude));
    if ( !numbers.length ) return { part: null, defence: null, armour: null, label: "" };
    const roll = await new Roll(numbers.length === 6 ? "1d6" : `1d${numbers.length}`).evaluate();
    const number = numbers.length === 6 ? roll.total : numbers[Math.min(numbers.length, Math.max(1, roll.total)) - 1];
    const hit = vessel?.system.hitLocation(number);
    if ( !hit ) return { ...main, part: { ...main.part, roll: number }, label: `${loc("WARBIRDS.Vessel.hitLocation")} ${number}: ${main.part.name}` };
    const sub = target.parts.find(p => p.id === hit.id);
    return { part: { id: hit.id, name: hit.name, roll: number }, defence: sub?.defence ?? null, armour: sub?.armour ?? null,
      label: `${loc("WARBIRDS.Vessel.hitLocation")} ${number}: ${hit.name}` };
  }
  const sub = target.parts.find(p => p.id === choice.defenceType);
  if ( !sub ) return main;
  return { part: { id: sub.id, name: sub.name, roll: null }, defence: choice.defence ?? sub.defence, armour: choice.armour ?? sub.armour, label: `${sub.name} ${loc("WARBIRDS.Roll.defence")}` };
}

/**
 * A vessel's gun emplacement or battery fires at the targeted token.
 * @param {Actor} vessel
 * @param {string} id   Sub-system id.
 */
export async function fireSubsystem(vessel, id) {
  const sub = vessel.system.subsystemList.find(s => s.id === id);
  if ( !sub || !sub.attack.enabled ) return;
  if ( sub.disabled ) return ui.notifications.warn("WARBIRDS.Notifications.subsystemDisabled", { localize: true, format: { name: sub.name } });
  const target = currentTarget();
  const parts = [{ label: sub.name, value: sub.attack.bonus }];
  if ( sub.penalty ) parts.push({ label: loc("WARBIRDS.Roll.structurePenalty"), value: sub.penalty });
  const choice = await promptAttack({
    title: `${vessel.name}: ${sub.name}`, parts,
    weapon: { name: sub.name, damage: sub.attack.damage, ap: sub.attack.ap, attacksPerRound: 1, ammo: { tracked: false }, isMissile: false, ignoresEPM: false },
    target, aerial: true
  });
  if ( !choice ) return;
  let defence = choice.defence;
  let defenceLabel = loc("WARBIRDS.Roll.defence");
  if ( target?.kind === "aircraft" && WARBIRDS.aircraftDefences[choice.defenceType] ) defenceLabel = `${loc(WARBIRDS.aircraftDefences[choice.defenceType])} ${loc("WARBIRDS.Roll.defence")}`;
  if ( choice.defenceType === "allout" ) defenceLabel = loc("WARBIRDS.Roll.allOutDefence");
  return rollAttack({
    actor: vessel, item: null, title: sub.name, parts, modifier: choice.modifier,
    weapon: { name: sub.name, damage: sub.attack.damage, ap: sub.attack.ap, category: "turret" },
    attacks: choice.attacks, defence, defenceLabel, armour: choice.armour,
    armourLabel: loc(target?.kind === "creature" ? "WARBIRDS.Secondary.resist" : "WARBIRDS.Aircraft.armour"),
    scale: choice.scale, target: target ? { uuid: target.uuid, name: target.name, img: target.img } : null, consumeAmmo: false
  });
}

/**
 * Roll a d6 hit location on a vessel and post the result.
 * @param {Actor} vessel
 */
export async function rollHitLocation(vessel) {
  const roll = await new Roll("1d6").evaluate();
  const hit = vessel.system.hitLocation(roll.total);
  const name = hit ? hit.name : loc("WARBIRDS.Vessel.mainStructure");
  const content = `<div class="wb-chat-card wb-location-card"><header class="wb-card-header"><img src="${vessel.img}" alt=""><div class="wb-card-titles"><h3>${loc("WARBIRDS.Vessel.hitLocation")}</h3><span class="wb-card-subtitle">${foundry.utils.escapeHTML(vessel.name)}</span></div><div class="wb-card-total"><span class="wb-card-total-value">${roll.total}</span></div></header><p class="wb-card-effect">${foundry.utils.escapeHTML(name)}${hit?.disabled ? ` (${loc("WARBIRDS.Vessel.disabled")} → ${loc("WARBIRDS.Vessel.mainStructure")})` : ""}</p><p class="wb-card-note">${loc("WARBIRDS.Vessel.reserveShift")}</p></div>`;
  return ChatMessage.create({ content, speaker: ChatMessage.getSpeaker({ actor: vessel }), rolls: [roll], sound: CONFIG.sounds.dice }, { messageMode: messageMode() });
}

/**
 * An NPC's generic attack ("Attack 1d6 +3") without a weapon item.
 * @param {Actor} actor
 */
export async function rollNpcAttack(actor) {
  const target = currentTarget();
  const parts = [{ label: loc("WARBIRDS.Npc.attack"), value: actor.system.attack }];
  if ( !actor.system.isThug ) parts.push(...creaturePenaltyParts(actor));
  const choice = await promptAttack({
    title: loc("WARBIRDS.Npc.attack"), parts,
    weapon: { name: actor.system.weapons || loc("WARBIRDS.Npc.attack"), damage: 0, ap: 0, attacksPerRound: 1, ammo: { tracked: false }, isMissile: false, ignoresEPM: false },
    target, aerial: false
  });
  if ( !choice ) return;
  return rollAttack({
    actor, item: null, title: loc("WARBIRDS.Npc.attack"), parts, modifier: choice.modifier,
    weapon: { name: actor.system.weapons || loc("WARBIRDS.Npc.attack"), damage: 0, ap: 0, category: "personal" },
    attacks: choice.attacks, defence: choice.defence, defenceLabel: choice.defenceType === "allout" ? loc("WARBIRDS.Roll.allOutDefence") : loc("WARBIRDS.Roll.defence"),
    armour: choice.armour, armourLabel: loc("WARBIRDS.Secondary.resist"), scale: choice.scale,
    target: target ? { uuid: target.uuid, name: target.name, img: target.img } : null, consumeAmmo: false
  });
}

/**
 * A thug's flat skill roll (1d6 + skill bonus).
 * @param {Actor} actor
 */
export async function rollThugSkill(actor) {
  const parts = [{ label: loc("WARBIRDS.Npc.skillBonus"), value: actor.system.skillBonus }];
  const choice = await promptCheck({ title: loc("WARBIRDS.Npc.skillBonus"), parts, difficulty: null });
  if ( !choice ) return;
  return rollCheck({ actor, title: loc("WARBIRDS.Roll.thugSkill"), parts, modifier: choice.modifier, difficulty: choice.difficulty });
}

/**
 * Post a manoeuvre / stunt / tactic card to chat.
 * @param {Actor} actor
 * @param {Item} item
 */
export async function useManeuver(actor, item) {
  const s = item.system;
  const secret = ["bvrTactic", "altitude"].includes(s.kind);
  const card = {
    type: "maneuver",
    title: item.name,
    img: item.img,
    actor: { uuid: actor.uuid, name: actor.name, img: actor.img },
    kind: s.kindLabel,
    cost: s.cost,
    requirement: s.requirement,
    effect: s.effect,
    onSuccess: s.onSuccess,
    onFailure: s.onFailure,
    defence: s.defence ? loc(WARBIRDS.aircraftDefences[s.defence]) : "",
    description: await foundry.applications.ux.TextEditor.implementation.enrichHTML(s.description, { relativeTo: item, secrets: false }),
    secret,
    revealed: false
  };
  const content = await renderTemplate(systemPath("templates/chat/maneuver.hbs"), card);
  const data = {
    content,
    speaker: ChatMessage.getSpeaker({ actor }),
    flags: { warbirds: { type: "maneuver", card } }
  };
  // BVR planning is secret: the tactic and altitude go to the GM and the chooser only, with a Reveal button.
  if ( secret ) {
    const gms = ChatMessage.getWhisperRecipients("GM").map(u => u.id);
    data.whisper = Array.from(new Set([...gms, game.user.id]));
    return ChatMessage.create(data);
  }
  return ChatMessage.create(data, { messageMode: messageMode() });
}

/**
 * Reveal a secret BVR choice: the original whisper is marked revealed and a public copy of the card is posted.
 * @param {ChatMessage} message
 */
async function revealChoice(message) {
  const card = foundry.utils.deepClone(message.flags.warbirds.card);
  if ( card.revealed ) return;
  card.revealed = true;
  const actor = await fromUuid(card.actor.uuid);
  const publicCard = { ...card, secret: false, kind: `${card.kind} · ${loc("WARBIRDS.Bvr.revealed")}` };
  const content = await renderTemplate(systemPath("templates/chat/maneuver.hbs"), publicCard);
  await ChatMessage.create({
    content,
    speaker: actor ? ChatMessage.getSpeaker({ actor }) : message.speaker,
    flags: { warbirds: { type: "maneuver", card: publicCard } }
  });
  if ( message.canUserModify(game.user, "update") ) {
    const own = await renderTemplate(systemPath("templates/chat/maneuver.hbs"), card);
    await message.update({ content: own, "flags.warbirds.card": card });
  }
}

/**
 * Resolve the BVR planning phase from both fighters' tactics (Jet Age p8 matrix).
 * @param {string} first     Tactic of fighter 1: press | crank | notch | drag
 * @param {string} second    Tactic of fighter 2.
 * @returns {string|null}    headToHead | dogfight | bvr | disengage, or null for an unknown tactic.
 */
export function resolveBvrTactics(first, second) {
  return WARBIRDS.bvrResolution[first]?.[second] ?? null;
}

/**
 * Ask for both fighters' BVR tactics and post what happens next.
 * @param {object} [config]   See promptBvr.
 * @returns {Promise<ChatMessage|void>}
 */
export async function resolveBvr(config={}) {
  const choice = await promptBvr(config);
  if ( !choice ) return;
  const outcome = resolveBvrTactics(choice.first, choice.second);
  if ( !outcome ) return;
  const tactic = key => loc(WARBIRDS.bvrTactics[key]);
  const card = {
    title: loc("WARBIRDS.Bvr.resolveTitle"),
    subtitle: `${choice.names[0]}: ${tactic(choice.first)} · ${choice.names[1]}: ${tactic(choice.second)}`,
    actor: { name: game.user.name, img: game.user.avatar ?? "icons/svg/mystery-man.svg" },
    icon: "fa-solid fa-satellite-dish",
    choice: { label: loc("WARBIRDS.Bvr.outcome"), value: loc(WARBIRDS.bvrOutcomes[outcome]) },
    lines: [loc(`WARBIRDS.Bvr.outcomeHint.${outcome}`)]
  };
  const content = await renderTemplate(systemPath("templates/chat/note.hbs"), card);
  return ChatMessage.create({ content, flags: { warbirds: { type: "bvr", card } } }, { messageMode: messageMode() });
}

/* -------------------------------------------- */
/*  Bailing out                                 */
/* -------------------------------------------- */

/**
 * Bail out of a Crippled or Going Down aircraft.
 * Core rules (p71): a pilot bails out at the last second when the plane is Going Down, unless their Life is on the Line
 * (they die trapped in the machine); the GM may call for a certain death scenario (spend all remaining Reserve).
 * Jet Age gritty rules: 1d6 + Spirit vs 5 to bail out; failure means death.
 * @param {Actor} aircraft
 * @returns {Promise<ChatMessage|void>}
 */
export async function bailOut(aircraft) {
  const sys = aircraft.system;
  const pilot = sys.pilotActor;
  const status = sys.totals.status;
  const gritty = game.settings.get(SYSTEM_ID, "gritty");
  const title = loc("WARBIRDS.Roll.bailOut");

  if ( sys.totals.helicopter && pilot && (status === "down") ) {
    const skillKey = "athletics";
    const level = pilot.system.skillLevel(skillKey);
    const d = pilot.system.computeDerived();
    const parts = [{ label: loc(WARBIRDS.stats.body), value: pilot.system.stats.body }, { label: loc(WARBIRDS.skills[skillKey].label), value: level }];
    if ( level === 0 ) parts.push({ label: loc("WARBIRDS.Roll.unskilled"), value: -2 });
    if ( d.penalty ) parts.push({ label: loc("WARBIRDS.Roll.woundPenalty"), value: d.penalty });
    const choice = await promptCheck({ title, parts, difficulty: 5 });
    if ( !choice ) return;
    return rollCheck({
      actor: pilot, title, subtitle: aircraft.name, parts, modifier: choice.modifier,
      difficulty: choice.difficulty ?? 5, note: loc("WARBIRDS.Roll.bailOutHelicopter"), type: "bailout"
    });
  }

  if ( gritty && pilot && (status === "down") ) {
    const label = loc(WARBIRDS.stats.spirit);
    const d = pilot.system.computeDerived();
    const parts = [{ label, value: pilot.system.stats.spirit }];
    if ( d.penalty ) parts.push({ label: loc("WARBIRDS.Roll.woundPenalty"), value: d.penalty });
    const choice = await promptCheck({ title, parts, difficulty: 5 });
    if ( !choice ) return;
    return rollCheck({
      actor: pilot, title, subtitle: aircraft.name, parts, modifier: choice.modifier,
      difficulty: choice.difficulty ?? 5, note: loc("WARBIRDS.Roll.bailOutGritty"), type: "bailout"
    });
  }

  const lotl = pilot ? pilot.system.lifeOnTheLine : sys.crew.lifeOnTheLine;
  const lines = [];
  if ( status === "down" ) lines.push(loc(lotl ? "WARBIRDS.Roll.bailOutTrapped" : "WARBIRDS.Roll.bailOutDown"));
  else lines.push(loc(lotl ? "WARBIRDS.Roll.bailOutCrippledLotl" : "WARBIRDS.Roll.bailOutCrippled"));
  if ( sys.totals.helicopter ) lines.push(loc("WARBIRDS.Roll.bailOutHelicopter"));
  else if ( gritty ) lines.push(loc(status === "down" ? "WARBIRDS.Roll.bailOutGritty" : "WARBIRDS.Roll.bailOutGrittyLater"));
  const speakerActor = pilot ?? aircraft;
  const card = {
    title, subtitle: `${aircraft.name} · ${loc(WARBIRDS.aircraftStatus[status])}`,
    actor: { uuid: speakerActor.uuid, name: speakerActor.name, img: speakerActor.img },
    icon: "fa-solid fa-parachute-box",
    lines
  };
  const content = await renderTemplate(systemPath("templates/chat/note.hbs"), card);
  return ChatMessage.create({
    content, speaker: ChatMessage.getSpeaker({ actor: speakerActor }), flags: { warbirds: { type: "note", card } }
  }, { messageMode: messageMode() });
}

/* -------------------------------------------- */
/*  Chat card buttons                           */
/* -------------------------------------------- */

/**
 * Wire the buttons on Warbirds chat cards and hide the ones this user may not use.
 * @param {ChatMessage} message
 * @param {HTMLElement} html
 */
export function activateChatListeners(message, html) {
  const flags = message.flags?.warbirds;
  if ( !flags?.card ) return;
  const card = flags.card;

  for ( const button of html.querySelectorAll("[data-action='spendReserve']") ) {
    const canModify = message.canUserModify(game.user, "update");
    const actor = fromUuidSync(card.reserve?.uuid ?? card.actor.uuid);
    if ( !canModify || !actor?.isOwner || (card.spent >= 3) ) button.remove();
    else button.addEventListener("click", () => spendReserve(message));
  }

  for ( const button of html.querySelectorAll("[data-action='revealChoice']") ) {
    const canReveal = message.isAuthor || game.user.isGM;
    if ( !canReveal || card.revealed ) button.remove();
    else button.addEventListener("click", () => revealChoice(message));
  }

  for ( const button of html.querySelectorAll("[data-action='chooseDefence']") ) {
    const combat = game.combats?.get(card.combatId);
    const combatant = combat?.combatants.get(button.dataset.combatantId);
    const allowed = combatant && (combatant.isOwner || game.user.isGM) && (combat.round === card.round);
    if ( !allowed ) { button.disabled = true; continue; }
    button.addEventListener("click", () => chooseDefence(combatant, button.dataset.defence ?? ""));
  }

  for ( const button of html.querySelectorAll("[data-action='creditKill']") ) {
    const entry = card.kills?.[button.dataset.target];
    const pilot = entry ? fromUuidSync(entry.pilot) : null;
    if ( !entry || entry.credited || !pilot?.isOwner ) button.remove();
    else button.addEventListener("click", () => creditPendingKill(message, button.dataset.target));
  }

  for ( const button of html.querySelectorAll("[data-action='applyDamage']") ) {
    const index = button.dataset.index;
    const attack = card.attacks?.find(a => String(a.index) === String(index));
    const uuid = attack?.target?.uuid ?? card.target?.uuid;
    const target = uuid ? fromUuidSync(uuid) : null;
    if ( !target?.isOwner || card.applied?.[index] ) {
      if ( !target || !target.isOwner ) button.remove();
      else button.disabled = true;
    }
    else button.addEventListener("click", () => applyDamage(message, index));
  }
}

/**
 * Add +1 to a check after the fact by spending a point of Reserve (max +3 per roll).
 * @param {ChatMessage} message
 */
async function spendReserve(message) {
  const card = foundry.utils.deepClone(message.flags.warbirds.card);
  const actor = await fromUuid(card.reserve?.uuid ?? card.actor.uuid);
  if ( !actor ) return;
  const reserve = getReserve(actor);
  if ( !reserve || reserve.value <= 0 ) return ui.notifications.warn("WARBIRDS.Notifications.noReserve", { localize: true });
  if ( card.spent >= 3 ) return;
  await actor.update({ [reserve.path]: reserve.value - 1 });
  card.spent += 1;
  card.reserve = getReserve(actor);
  evaluateOutcome(card);
  const content = await renderTemplate(systemPath("templates/chat/check.hbs"), card);
  await message.update({ content, "flags.warbirds.card": card });
  // A Dogfighting roll that set the aircraft's initiative: the combat tracker follows the new total.
  if ( card.combatant ) {
    const combatant = game.combats?.get(card.combatant.combat)?.combatants.get(card.combatant.id);
    if ( combatant?.isOwner ) await combatant.update({ initiative: card.effectiveTotal });
  }
}

/**
 * A kill for the shooter's pilot when this damage took an aircraft to Going Down, disabled a vessel sub-system or
 * destroyed a vessel (core: air-to-air kills and strafing kills). One kill per target per card, whatever line was
 * applied; the status transition keeps a second Apply on the same target from counting again.
 * @param {object} card
 * @param {Actor} target
 * @param {string} before     The target's status before the damage.
 * @param {object} result     What Actor#applyDamage reported.
 */
async function recordKill(card, target, before, result) {
  const after = target.system.status;
  let kind = null;
  if ( (target.type === "aircraft") && (before !== "down") && (after === "down") ) kind = "air";
  else if ( (target.type === "vessel") && ((result?.disabledNow && !result?.redirected) || ((before !== "destroyed") && (after === "destroyed"))) ) kind = "ground";
  if ( !kind ) return;
  card.kills ??= {};
  if ( card.kills[target.uuid] ) return;
  const shooter = await fromUuid(card.actor.uuid);
  const pilot = shooter?.type === "aircraft" ? shooter.system.pilotActor : (shooter?.type === "pilot" ? shooter : null);
  if ( !pilot ) return;
  const entry = { kind, kindLabel: kind === "air" ? "WARBIRDS.Pilot.killAir" : "WARBIRDS.Pilot.killGround", pilot: pilot.uuid, name: pilot.name, target: target.name, credited: false, count: null };
  card.kills[target.uuid] = entry;
  if ( pilot.isOwner ) await creditKill(entry);
}

/**
 * Add the kill to the pilot's tally and announce any Ace milestone it reaches.
 * @param {{kind: string, pilot: string, name: string}} entry   Mutated: credited and count are filled in.
 */
async function creditKill(entry) {
  const pilot = await fromUuid(entry.pilot);
  if ( !pilot || !pilot.isOwner ) return false;
  const before = { air: pilot.system.kills.air, ground: pilot.system.kills.ground };
  const after = { ...before, [entry.kind]: before[entry.kind] + 1 };
  await pilot.update({ [`system.kills.${entry.kind}`]: after[entry.kind] });
  entry.credited = true;
  entry.count = after[entry.kind];
  for ( const key of pilot.system.constructor.milestonesReached(before, after) ) {
    const milestone = loc(key);
    ui.notifications.info("WARBIRDS.Notifications.milestone", { localize: true, format: { name: pilot.name, milestone } });
    const note = {
      title: loc("WARBIRDS.Pilot.milestoneTitle"), subtitle: milestone,
      actor: { uuid: pilot.uuid, name: pilot.name, img: pilot.img }, icon: "fa-solid fa-medal",
      lines: [game.i18n.format("WARBIRDS.Pilot.milestoneLine", { name: pilot.name, milestone, air: after.air, ground: after.ground })]
    };
    const content = await renderTemplate(systemPath("templates/chat/note.hbs"), note);
    await ChatMessage.create({ content, speaker: ChatMessage.getSpeaker({ actor: pilot }), flags: { warbirds: { type: "note", card: note } } }, { messageMode: messageMode() });
  }
  return true;
}

/**
 * The "Credit kill" button on an attack card: a kill that could not be credited by whoever applied the damage.
 * @param {ChatMessage} message
 * @param {string} targetUuid
 */
async function creditPendingKill(message, targetUuid) {
  const card = foundry.utils.deepClone(message.flags.warbirds.card);
  const entry = card.kills?.[targetUuid];
  if ( !entry || entry.credited ) return;
  if ( !(await creditKill(entry)) ) return ui.notifications.warn("WARBIRDS.Notifications.cannotCredit", { localize: true });
  if ( message.canUserModify(game.user, "update") ) {
    const content = await renderTemplate(systemPath("templates/chat/attack.hbs"), card);
    await message.update({ content, "flags.warbirds.card": card });
  }
}

/**
 * Apply the final damage of one attack line to the targeted actor.
 * @param {ChatMessage} message
 * @param {string} index
 */
async function applyDamage(message, index) {
  const card = foundry.utils.deepClone(message.flags.warbirds.card);
  const attack = card.attacks.find(a => String(a.index) === String(index));
  const target = await fromUuid(attack?.target?.uuid ?? card.target?.uuid);
  if ( !target || !attack || (attack.final === null) ) return;
  const part = attack.part ?? card.part ?? null;
  const before = target.system.status;
  const result = await target.applyDamage(attack.final, { part: part?.id ?? null });
  card.applied[index] = true;
  if ( result?.disabledNow ) ui.notifications.info("WARBIRDS.Notifications.subsystemDestroyed", { localize: true, format: { name: part?.name ?? "" } });
  if ( result?.redirected ) ui.notifications.info("WARBIRDS.Notifications.damageRedirected", { localize: true, format: { name: part?.name ?? "" } });
  await recordKill(card, target, before, result);
  // A player applying damage to their own token may not be allowed to edit the GM's message; the damage still lands.
  if ( message.canUserModify(game.user, "update") ) {
    const content = await renderTemplate(systemPath("templates/chat/attack.hbs"), card);
    await message.update({ content, "flags.warbirds.card": card });
  }
  ui.notifications.info("WARBIRDS.Notifications.damageApplied", { localize: true, format: { amount: attack.final, name: target.name } });
}
