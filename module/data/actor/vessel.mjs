import BaseActorModel from "./base-actor.mjs";
import { integer, text, choice } from "../fields.mjs";
import { buildPenaltyTrack, trackState, recordToArray } from "../../utils.mjs";
import { WARBIRDS } from "../../config.mjs";

const fields = foundry.data.fields;

/**
 * A big, slow target (core book p167-182): airships, trains, fortifications and couriers.
 *
 * Vessels do not roll Dogfighting. Attackers roll Strafing against the vessel's **Threat**; the vessel's gun
 * emplacements shoot back. Guns pick a sub-system to hit, ordinance hits a random one (d6 location table).
 * Each sub-system entry is ONE unit (an airship with "Gun Emplacements (4)" has four entries sharing a group):
 * filling a unit's Structure track disables it, does 1 damage to the main Structure, and lowers Threat once
 * every `threatReduction.per` destroyed units of its group.
 */
export default class VesselModel extends BaseActorModel {

  static LOCALIZATION_PREFIXES = ["WARBIRDS.Actor.vessel"];

  /** @inheritDoc */
  static defineSchema() {
    return {
      category: choice(Object.keys(WARBIRDS.vesselCategories), "airship"),
      model: text(),
      performance: integer({ min: 0, initial: 1 }),
      armour: integer({ min: 0, initial: 4 }),
      structure: new fields.SchemaField({
        max: integer({ min: 1, initial: 8 }),
        dr: integer({ min: 0, initial: 2 }),
        track: text()
      }),
      damage: integer({ min: 0 }),
      defence: new fields.SchemaField({
        base: integer({ min: 0, initial: 4 }),
        bonus: integer()                      // bridge destroyed (-2), engines out (-1)...
      }),
      threat: new fields.SchemaField({
        base: integer({ min: 0, initial: 10 }),
        bonus: integer()                      // surprise (set to -threat), crack gunners...
      }),
      subsystems: new fields.TypedObjectField(new fields.SchemaField({
        name: new fields.StringField({ required: true, blank: false, initial: "Sub-system" }),
        group: text(),
        location: text({ initial: "2" }),    // d6 result(s) that hit this unit, e.g. "2" or "4 5"
        sort: integer(),
        defence: integer({ min: 0, initial: 6 }),
        armour: integer({ min: 0, initial: 2 }),
        structure: new fields.SchemaField({
          max: integer({ min: 1, initial: 2 }),
          dr: integer({ min: 0 })
        }),
        damage: integer({ min: 0 }),
        threatReduction: new fields.SchemaField({
          per: integer({ min: 1, initial: 1 }),
          amount: integer({ min: 0, initial: 1 })
        }),
        attack: new fields.SchemaField({
          enabled: new fields.BooleanField({ initial: false }),
          bonus: integer(),
          damage: integer({ min: 0, initial: 2 }),
          ap: integer({ min: 0 }),
          note: text()
        }),
        special: text()
      })),
      crew: text(),
      description: new fields.HTMLField(),
      notes: new fields.HTMLField()
    };
  }

  /* -------------------------------------------- */

  /**
   * Sub-systems as a sorted array with their derived state.
   * @type {object[]}
   */
  get subsystemList() {
    return recordToArray(this.subsystems, (a, b) => (a.sort - b.sort) || a.name.localeCompare(b.name)).map(s => {
      const penalties = buildPenaltyTrack(s.structure.max, s.structure.dr);
      const state = trackState(s.damage, s.structure.max, penalties);
      return {
        ...s,
        penalties,
        penalty: state.penalty,
        disabled: state.filled,
        locations: parseLocations(s.location)
      };
    });
  }

  /**
   * Final numbers after damage and destroyed sub-systems.
   * @type {object}
   */
  get totals() {
    const penalties = buildPenaltyTrack(this.structure.max, this.structure.dr, this.structure.track);
    const state = trackState(this.damage, this.structure.max, penalties);
    const status = state.doubled ? "destroyed" : state.filled ? "adrift" : this.damage > 0 ? "damaged" : "intact";
    const subsystems = this.subsystemList;

    // Threat reductions: every `per` destroyed units of a group lower Threat by `amount`.
    const groups = {};
    for ( const s of subsystems ) {
      const key = s.group || s.name;
      groups[key] ??= { destroyed: 0, per: s.threatReduction.per, amount: s.threatReduction.amount };
      if ( s.disabled ) groups[key].destroyed += 1;
    }
    let threatLoss = 0;
    for ( const g of Object.values(groups) ) threatLoss += Math.floor(g.destroyed / Math.max(1, g.per)) * g.amount;

    const defence = status === "adrift" || status === "destroyed" ? 1 : Math.max(0, this.defence.base + this.defence.bonus + state.penalty);
    return {
      penalties,
      penalty: state.penalty,
      status,
      structureValue: this.structure.max - this.damage,
      defence,
      threat: (status === "adrift" || status === "destroyed") ? 0 : Math.max(0, this.threat.base + this.threat.bonus - threatLoss),
      threatLoss,
      subsystems,
      gunners: subsystems.filter(s => s.attack.enabled && !s.disabled).length
    };
  }

  /** @inheritDoc */
  prepareDerivedData() {
    super.prepareDerivedData();
    const t = this.totals;
    this.structure.value = t.structureValue;
    this.structure.penalties = t.penalties;
    this.penalty = t.penalty;
    this.status = t.status;
    this.defence.value = t.defence;
    this.threat.value = t.threat;
    this.threat.loss = t.threatLoss;
  }

  /** @inheritDoc */
  modifyRollData(rollData) {
    const t = this.totals;
    rollData.defence = t.defence;
    rollData.threat = t.threat;
    rollData.armour = this.armour;
    rollData.penalty = t.penalty;
    rollData.initiative = 0;
  }

  /* -------------------------------------------- */

  /**
   * Find the sub-system(s) hit by a d6 location roll. Several units may share a location (four gun emplacements
   * on "4"): intact ones are preferred, and one is picked at random among them.
   * @param {number} roll   The d6 result.
   * @returns {{id: string, name: string}|null}   null means the main Structure.
   */
  hitLocation(roll) {
    const candidates = this.subsystemList.filter(s => s.locations.includes(roll));
    if ( !candidates.length ) return null;
    const intact = candidates.filter(s => !s.disabled);
    const pool = intact.length ? intact : candidates;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    return { id: pick.id, name: pick.name, disabled: pick.disabled };
  }

  /**
   * Apply damage to the main Structure or to one sub-system unit.
   * Disabling a unit also does 1 damage to the main Structure; hitting an already disabled unit counts as a hit
   * on the main Structure instead (core book p76).
   * @param {number} amount
   * @param {string|null} part   Sub-system id, or null for the main Structure.
   * @returns {Promise<{part: string|null, disabledNow: boolean}>}
   */
  async applyDamage(amount, part = null) {
    amount = Math.max(0, Math.floor(amount));
    const sub = part ? this.subsystems[part] : null;
    if ( !sub ) {
      await this.parent.update({ "system.damage": this.damage + amount });
      return { part: null, disabledNow: false };
    }
    const wasDisabled = sub.damage >= sub.structure.max;
    if ( wasDisabled ) {
      await this.parent.update({ "system.damage": this.damage + amount });
      return { part: null, disabledNow: false, redirected: true };
    }
    const newDamage = sub.damage + amount;
    const disabledNow = newDamage >= sub.structure.max;
    const updates = { [`system.subsystems.${part}.damage`]: newDamage };
    if ( disabledNow ) updates["system.damage"] = this.damage + 1;
    await this.parent.update(updates);
    return { part, disabledNow };
  }

  /** @inheritDoc */
  static get trackableAttributes() {
    return { bar: ["structure"], value: ["damage", "defence.value", "threat.value", "armour", "performance"] };
  }
}

/**
 * Parse a location string such as "4 5" or "1-3" into d6 results.
 * @param {string} text
 * @returns {number[]}
 */
export function parseLocations(text) {
  const out = new Set();
  for ( const token of String(text ?? "").split(/[\s,;]+/) ) {
    if ( !token ) continue;
    const range = token.match(/^(\d)\s*[-–]\s*(\d)$/);
    if ( range ) {
      for ( let i = Number(range[1]); i <= Number(range[2]); i++ ) out.add(i);
    }
    else if ( /^\d$/.test(token) ) out.add(Number(token));
  }
  return [...out].filter(n => n >= 1 && n <= 6).sort();
}
