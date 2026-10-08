import BaseActorModel from "./base-actor.mjs";
import { integer, statsField, skillsField } from "../fields.mjs";
import { buildPenaltyTrack, trackState, sumBy } from "../../utils.mjs";
import { WARBIRDS } from "../../config.mjs";

const fields = foundry.data.fields;

/**
 * Data shared by people: player pilots and ground NPCs.
 * Stats, an open skill list, a Health track with derived penalties, Defence and Resist.
 *
 * Foundry calls Actor#getRollData() while applying Active Effects, i.e. BEFORE prepareDerivedData() runs, so all
 * derived numbers are produced by computeDerived() on demand; prepareDerivedData() caches them for templates.
 */
export default class CreatureModel extends BaseActorModel {

  /** @inheritDoc */
  static defineSchema() {
    return {
      stats: statsField(),
      skills: skillsField(),
      wounds: integer({ min: 0 }),
      health: new fields.SchemaField({
        bonus: integer(),            // permanent injuries, GM adjustments
        dr: integer({ min: 0 })      // damage resistance (very tough creatures)
      }),
      defence: new fields.SchemaField({ bonus: integer() }),
      resist: new fields.SchemaField({ bonus: integer() }),
      lifeOnTheLine: new fields.BooleanField({ initial: false }),
      description: new fields.HTMLField(),
      notes: new fields.HTMLField()
    };
  }

  /* -------------------------------------------- */

  /**
   * Find a skill by its key or (case-insensitively) by name.
   * @param {string} key
   * @returns {object|null}
   */
  getSkill(key) {
    const skills = this.skills ?? {};
    if ( key in skills ) return skills[key];
    const lower = String(key).toLowerCase();
    return Object.values(skills).find(s => s.name?.toLowerCase() === lower) ?? null;
  }

  /**
   * The level of a skill, 0 when the creature lacks it.
   * @param {string} key
   * @returns {number}
   */
  skillLevel(key) {
    return this.getSkill(key)?.level ?? 0;
  }

  /** The highest skill level this creature has (used for the Reserve refresh rule). */
  get highestSkill() {
    return Object.values(this.skills ?? {}).reduce((max, s) => Math.max(max, s.level ?? 0), 0);
  }

  /** Equipped gear items. */
  get equippedGear() {
    return this.itemsOfType("gear").filter(g => g.system.equipped);
  }

  /* -------------------------------------------- */

  /**
   * Compute every derived number from source data and items.
   * @returns {object}
   */
  computeDerived() {
    const s = this.stats;
    const d = {};

    // Situational Awareness is the sum of the three stats.
    d.sa = s.body + s.mind + s.spirit;

    // Life on the Line: +1 to all rolls and Defence.
    d.lotl = this.lifeOnTheLine ? 1 : 0;

    // Health track.
    d.healthMax = Math.max(1, 3 + s.body + s.spirit + this.health.bonus);
    d.healthValue = d.healthMax - this.wounds;
    d.track = buildPenaltyTrack(d.healthMax, this.health.dr);
    const state = trackState(this.wounds, d.healthMax, d.track);
    d.penalty = state.penalty;
    d.status = this._status(state);

    // Resist = Spirit + Armour (equipped gear) + bonus. Wound penalties do not reduce Resist.
    const gear = this.equippedGear;
    d.armour = sumBy(gear, g => g.system.armour);
    d.shield = sumBy(gear, g => g.system.defence);
    d.resist = s.spirit + d.armour + this.resist.bonus;

    // Defence = 3 + Body + Athletics (+ shields, bonuses, Life on the Line, wound penalty).
    d.defence = 3 + s.body + this.skillLevel("athletics") + d.shield + this.defence.bonus + d.lotl + d.penalty;

    // Ground initiative = 1d6 + Mind + Awareness (penalised by wounds like every action).
    d.initiative = s.mind + this.skillLevel("awareness") + d.penalty;
    return d;
  }

  /**
   * Up and Fighting / Down but Not Out / Out of the Fight / Dead.
   * @param {{filled: boolean, exceeded: boolean, doubled: boolean}} state
   * @returns {string}
   * @protected
   */
  _status(state) {
    if ( state.doubled && this.lifeOnTheLine ) return "dead";
    if ( state.exceeded ) return "out";
    if ( state.filled ) return "down";
    if ( this.wounds > 0 ) return "wounded";
    return "fine";
  }

  /**
   * Cache a computed-derived object onto the instance for templates.
   * @param {object} d
   * @protected
   */
  _applyDerived(d) {
    this.sa = d.sa;
    this.lotl = d.lotl;
    this.health.max = d.healthMax;
    this.health.value = d.healthValue;
    this.health.track = d.track;
    this.penalty = d.penalty;
    this.status = d.status;
    this.armour = d.armour;
    this.shield = d.shield;
    this.resist.value = d.resist;
    this.defence.value = d.defence;
    this.initiativeValue = d.initiative;
  }

  /** @inheritDoc */
  prepareDerivedData() {
    super.prepareDerivedData();
    this._applyDerived(this.computeDerived());
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  modifyRollData(rollData) {
    const d = this.computeDerived();
    rollData.sa = d.sa;
    rollData.body = this.stats.body;
    rollData.mind = this.stats.mind;
    rollData.spirit = this.stats.spirit;
    rollData.penalty = d.penalty;
    rollData.initiative = d.initiative;
    rollData.defence = d.defence;
    rollData.resist = d.resist;
    rollData.lotl = d.lotl;
    rollData.skill = Object.fromEntries(Object.entries(this.skills).map(([k, v]) => [k, v.level]));
  }
}

/** Default skills added to a newly created creature. */
export function defaultSkills() {
  const skills = {};
  for ( const [key, cfg] of Object.entries(WARBIRDS.skills) ) {
    skills[key] = { name: game.i18n.localize(cfg.label), stat: cfg.stat, level: 0, xp: 0, knack: false, note: "" };
  }
  return skills;
}
