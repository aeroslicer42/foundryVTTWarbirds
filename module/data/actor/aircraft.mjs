import BaseActorModel from "./base-actor.mjs";
import { integer, text, choice, flightSkillsField } from "../fields.mjs";
import { buildPenaltyTrack, trackState, sumBy } from "../../utils.mjs";
import { WARBIRDS } from "../../config.mjs";

const fields = foundry.data.fields;

/**
 * An aircraft: a player's warbird or an enemy fighter.
 *
 * Ratings (Dogfighting, Strafing, Gunnery, Ordinance, the four Defences) need a pilot's SA and flight skills.
 * They come from the linked pilot Actor when one is assigned, otherwise from the built-in crew block, so an
 * enemy fighter is a single actor with a single token.
 */
export default class AircraftModel extends BaseActorModel {

  static LOCALIZATION_PREFIXES = ["WARBIRDS.Actor.aircraft"];

  /** @inheritDoc */
  static defineSchema() {
    return {
      model: text(),                                   // e.g. "F-4 Phantom II"
      era: choice(Object.keys(WARBIRDS.eras), "vietnam"),
      manufacturer: text(),
      role: text(),                                    // fighter, attack, interceptor, bomber...

      // Core stats (core book p68).
      performance: integer({ min: 0, initial: 3 }),
      armour: integer({ min: 0, initial: 3 }),
      structure: new fields.SchemaField({
        max: integer({ min: 1, initial: 5 }),
        dr: integer({ min: 0, initial: 1 }),
        track: text()                                  // optional hand-written penalty track, e.g. "0 -1 -2"
      }),
      damage: integer({ min: 0 }),

      // Jet Age stats (sourcebook p4-5).
      radar: new fields.SchemaField({
        value: new fields.NumberField({ required: true, nullable: true, integer: true, initial: null, min: -5, max: 9 }),
        gunsightOnly: new fields.BooleanField({ initial: false })
      }),
      epm: integer({ min: 0, max: 9 }),
      super: integer({ min: 0, max: 9 }),
      bvr: new fields.BooleanField({ initial: false }),

      // Couriers and bombers: enemies roll Strafing against this instead of Dogfighting.
      threat: integer({ min: 0 }),

      hardpoints: new fields.SchemaField({
        total: integer({ min: 0, initial: 1 }),
        notes: text()
      }),
      ceiling: text(),
      fuel: text(),
      innateTraits: text(),

      // The pilot Actor flying this aircraft, if any.
      pilot: new fields.DocumentUUIDField({ type: "Actor", required: false, nullable: true, initial: null }),

      // Built-in crew stats, used when no pilot is linked (enemy aircraft, NPC wingmen).
      crew: new fields.SchemaField({
        name: text(),
        sa: integer({ min: -9, max: 9 }),
        flightSkills: flightSkillsField(true),
        reserve: new fields.SchemaField({
          value: integer({ min: 0 }),
          max: integer({ min: 0 })
        }),
        lifeOnTheLine: new fields.BooleanField({ initial: false })
      }),

      description: new fields.HTMLField(),
      notes: new fields.HTMLField()
    };
  }

  /* -------------------------------------------- */
  /*  Pilot resolution                            */
  /* -------------------------------------------- */

  /**
   * The pilot Actor, if assigned and resolvable right now.
   * @returns {Actor|null}
   */
  get pilotActor() {
    if ( !this.pilot ) return null;
    try {
      const doc = fromUuidSync(this.pilot);
      return (doc instanceof Actor) && (doc.type === "pilot") ? doc : null;
    } catch(err) {
      return null;
    }
  }

  /**
   * The flight numbers in use: from the linked pilot when there is one, else the crew block.
   * @returns {{source: string, name: string, sa: number, piloting: number, strafing: number, gunnery: number,
   *            ordinance: number, ew: number, lotl: number, penalty: number, reserve: {value: number, max: number}}}
   */
  get flightStats() {
    const pilot = this.pilotActor;
    if ( pilot ) {
      const fs = pilot.system.flightStats;
      return { source: "pilot", name: pilot.name, ...fs, reserve: pilot.system.reserve };
    }
    const c = this.crew;
    return {
      source: "crew",
      name: c.name,
      sa: c.sa,
      piloting: c.flightSkills.piloting.level,
      strafing: c.flightSkills.strafing.level,
      gunnery: c.flightSkills.gunnery.level,
      ordinance: c.flightSkills.ordinance.level,
      ew: c.flightSkills.ew.level,
      lotl: c.lifeOnTheLine ? 1 : 0,
      penalty: 0,
      reserve: c.reserve
    };
  }

  /* -------------------------------------------- */
  /*  Derived data                                */
  /* -------------------------------------------- */

  /*
   * Foundry calls Actor#getRollData() while applying Active Effects, i.e. after prepareBaseData() and the embedded
   * items are prepared but BEFORE prepareDerivedData(). Everything that roll data or the sheets need is therefore
   * exposed as getters that compute from source data + items on demand; prepareDerivedData() only caches the
   * results onto the instance for templates.
   */

  /** Trait items that are switched on. */
  get activeTraits() {
    return this.itemsOfType("trait").filter(t => t.system.active);
  }

  /** Mounted weapons. */
  get mountedWeapons() {
    return this.itemsOfType("weapon").filter(w => w.system.mounted);
  }

  /**
   * The summed structured modifiers of every active, non-situational trait, plus the BVR grant.
   * @type {Record<string, number> & {grantsBVR: boolean}}
   */
  get traitModifiers() {
    const mods = {};
    for ( const key of WARBIRDS.traitModifiers ) mods[key] = 0;
    let grantsBVR = false;
    let helicopter = false;
    let strafingDie = false;
    for ( const trait of this.activeTraits ) {
      const sys = trait.system;
      if ( sys.grants?.bvr ) grantsBVR = true;
      if ( sys.grants?.helicopter ) helicopter = true;
      if ( sys.grants?.strafingDie ) strafingDie = true;
      if ( sys.situational ) continue;
      const times = Math.max(1, sys.timesTaken ?? 1);
      for ( const key of WARBIRDS.traitModifiers ) mods[key] += (sys.modifiers?.[key] ?? 0) * times;
    }
    mods.grantsBVR = grantsBVR;
    mods.helicopter = helicopter;
    mods.strafingDie = strafingDie || helicopter;
    return mods;
  }

  /**
   * Final aircraft stats after traits and damage.
   * @type {object}
   */
  get totals() {
    const mods = this.traitModifiers;
    const structureMax = Math.max(1, this.structure.max + mods.structure);
    const dr = Math.max(0, this.structure.dr + mods.dr);
    const penalties = buildPenaltyTrack(structureMax, dr, this.structure.track);
    const state = trackState(this.damage, structureMax, penalties);
    const status = state.doubled ? "down" : state.exceeded ? "crippled" : state.filled ? "smoke" : "fit";
    const hasRadar = (this.radar.value !== null) && !this.radar.gunsightOnly;
    return {
      mods,
      performance: Math.max(0, this.performance + mods.performance),
      armour: Math.max(0, this.armour + mods.armour),
      structureMax,
      structureValue: structureMax - this.damage,
      dr,
      penalties,
      status,
      // Crippled aircraft are -3 to everything and automatically lose Dogfighting rolls.
      penalty: ((status === "crippled") || (status === "down")) ? -3 : state.penalty,
      hasRadar,
      radar: hasRadar ? this.radar.value + mods.radar : 0,
      epm: Math.max(0, this.epm + mods.epm),
      super: Math.max(0, this.super + mods.super),
      bvrCapable: this.bvr || mods.grantsBVR,
      helicopter: mods.helicopter,
      strafingDie: mods.strafingDie
    };
  }

  /**
   * Dogfighting / Strafing / Gunnery / Ordinance / Electronic Warfare bonuses and the four Defences,
   * using the linked pilot or the crew block. Always computed fresh so a pilot that loads after the aircraft,
   * or whose stats change, is reflected without re-preparing the aircraft.
   * @type {object}
   */
  get ratings() {
    const fs = this.flightStats;
    const t = this.totals;
    const m = t.mods;
    const p = t.penalty + fs.penalty + fs.lotl;      // structure damage, pilot wounds, Life on the Line
    const perf = t.performance;

    const breakDefence = fs.sa + fs.piloting + perf + m.breakDefence + p;
    return {
      pilot: fs,
      dogfighting: fs.sa + fs.piloting + perf + m.dogfighting + p,
      strafing: fs.sa + fs.strafing + perf + m.strafing + p,
      gunnery: fs.sa + fs.gunnery + m.gunnery + p,            // + weapon Accuracy at roll time
      ordinance: fs.sa + fs.ordinance + m.ordinance + p,      // + weapon Accuracy (+ Radar for missiles)
      ew: fs.sa + fs.ew + t.radar + m.ew + p,
      breakDefence,
      escapeDefence: breakDefence + 2 + m.escapeDefence,
      shootDefence: breakDefence - 2 + m.shootDefence,
      stuntDefence: fs.sa + fs.piloting + m.stuntDefence + m.stunt + p,   // + 1d6 when rolled
      disengage: t.super + m.disengage,                                   // added to Dogfighting when disengaging
      canStunt: (perf >= 3) && (t.status === "fit"),
      autoLose: (t.status === "crippled") || (t.status === "down")
    };
  }

  /** @inheritDoc */
  prepareDerivedData() {
    super.prepareDerivedData();
    const t = this.totals;
    this.traitMods = t.mods;
    this.performanceTotal = t.performance;
    this.armourTotal = t.armour;
    this.structure.total = t.structureMax;
    this.structure.drTotal = t.dr;
    this.structure.value = t.structureValue;
    this.structure.penalties = t.penalties;
    this.status = t.status;
    this.penalty = t.penalty;
    this.hasRadar = t.hasRadar;
    this.radarTotal = t.radar;
    this.epmTotal = t.epm;
    this.superTotal = t.super;
    this.bvrCapable = t.bvrCapable;

    // Hard points in use.
    const weapons = this.mountedWeapons;
    this.hardpoints.used = sumBy(weapons.filter(w => ["ordinance", "missile"].includes(w.system.category)), w => w.system.pylons);
    this.hardpoints.free = this.hardpoints.total - this.hardpoints.used;
    this.hardpoints.over = this.hardpoints.used > this.hardpoints.total;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  modifyRollData(rollData) {
    const r = this.ratings;
    const t = this.totals;
    rollData.sa = r.pilot.sa;
    rollData.performance = t.performance;
    rollData.armour = t.armour;
    rollData.penalty = t.penalty;
    rollData.dogfighting = r.dogfighting;
    rollData.strafing = r.strafing;
    rollData.gunnery = r.gunnery;
    rollData.ordinance = r.ordinance;
    rollData.ew = r.ew;
    rollData.breakDefence = r.breakDefence;
    rollData.escapeDefence = r.escapeDefence;
    rollData.shootDefence = r.shootDefence;
    rollData.radar = t.radar;
    rollData.epm = t.epm;
    rollData.super = t.super;
    // Combat tracker: aircraft "initiative" is the Dogfighting roll.
    rollData.initiative = r.dogfighting;
  }

  /** @inheritDoc */
  static get trackableAttributes() {
    return {
      bar: ["structure", "crew.reserve"],
      value: ["damage", "performance", "armour", "epm", "super", "threat", "hardpoints.total"]
    };
  }
}
