import CreatureModel, { defaultSkills } from "./creature.mjs";
import { integer, text, choice, flightSkillsField } from "../fields.mjs";
import { SYSTEM_ID } from "../../config.mjs";

const fields = foundry.data.fields;

/**
 * A player character: a Guild pilot (core book) or a Jet Age military pilot.
 */
export default class PilotModel extends CreatureModel {

  static LOCALIZATION_PREFIXES = ["WARBIRDS.Actor.creature", "WARBIRDS.Actor.pilot"];

  /** @inheritDoc */
  static defineSchema() {
    return {
      ...super.defineSchema(),
      callsign: text(),
      player: text(),
      nationality: text(),
      squadron: text(),
      unit: text(),
      appearance: text(),
      background: new fields.HTMLField(),
      contacts: new fields.HTMLField(),
      biography: new fields.HTMLField(),

      statPoints: integer({ min: 0 }),
      flightSkills: flightSkillsField(false),
      reserve: new fields.SchemaField({
        value: integer({ min: 0, initial: 3 }),
        max: integer({ min: 0, initial: 3 })
      }),

      // Standing: Rank (Jet Age / historical) or Fame (Azure). Both are stored; a world setting picks one.
      rank: new fields.SchemaField({
        value: integer({ min: 0, max: 6, initial: 1 })
      }),
      fame: new fields.SchemaField({
        value: integer({ min: 0, max: 6, initial: 2 }),
        points: integer({ min: 0 })
      }),
      scandal: new fields.BooleanField({ initial: false }),

      kills: new fields.SchemaField({
        air: integer({ min: 0 }),
        ground: integer({ min: 0 })
      }),

      advantages: new fields.TypedObjectField(new fields.SchemaField({
        name: new fields.StringField({ required: true, blank: false, initial: "Advantage" }),
        kind: choice(["advantage", "disadvantage"], "advantage"),
        level: choice(["minor", "major"], "minor"),
        description: text()
      })),

      // The warbird this pilot flies (an "aircraft" Actor).
      aircraft: new fields.DocumentUUIDField({ type: "Actor", required: false, nullable: true, initial: null })
    };
  }

  /* -------------------------------------------- */

  /** The world's standing mode: "rank" or "fame". */
  get standingMode() {
    try {
      return game.settings.get(SYSTEM_ID, "standing");
    } catch(err) {
      return "rank";
    }
  }

  /** The highest of all skills, ground and flight. */
  get highestSkill() {
    const flight = Object.values(this.flightSkills).reduce((max, s) => Math.max(max, s.level), 0);
    return Math.max(super.highestSkill, flight);
  }

  /**
   * The aircraft actor assigned to this pilot, if it can be resolved synchronously.
   * @returns {Actor|null}
   */
  get aircraftActor() {
    if ( !this.aircraft ) return null;
    try {
      const doc = fromUuidSync(this.aircraft);
      return (doc instanceof Actor) && (doc.type === "aircraft") ? doc : null;
    } catch(err) {
      return null;
    }
  }

  /**
   * The numbers an aircraft needs from its pilot. Computed fresh so an aircraft preparing its own data never
   * depends on whether this pilot's derived data has been cached yet.
   * @returns {{sa: number, piloting: number, strafing: number, gunnery: number, ordinance: number, ew: number, lotl: number, penalty: number}}
   */
  get flightStats() {
    const d = this.computeDerived();
    const fs = this.flightSkills;
    return {
      sa: d.sa,
      piloting: fs.piloting.level,
      strafing: fs.strafing.level,
      gunnery: fs.gunnery.level,
      ordinance: fs.ordinance.level,
      ew: fs.ew.level,
      lotl: d.lotl,
      penalty: d.penalty
    };
  }

  /**
   * Standing (Rank or Fame) and the Scandal penalty, from source data.
   * @returns {{mode: string, value: number, nextFameAt: number, scandalPenalty: number}}
   */
  get standingInfo() {
    const mode = this.standingMode;
    return {
      mode,
      value: mode === "fame" ? this.fame.value : this.rank.value,
      // Fame rises when FP reach triple the next Fame level.
      nextFameAt: 3 * (this.fame.value + 1),
      scandalPenalty: (mode === "fame" && this.scandal) ? -this.fame.value : 0
    };
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  prepareDerivedData() {
    super.prepareDerivedData();

    // Reserve refreshes each session to highest skill + 2.
    this.reserve.suggested = this.highestSkill + 2;

    // Standing (Rank or Fame) and the Scandal penalty.
    this.standing = this.standingInfo;

    // Ace status (10 kills in either discipline, Elite at 50) and the progress towards the next milestone.
    this.ace = PilotModel.aceStatus(this.kills);
  }

  /**
   * Ace milestones from a kill tally: Ace at 10 kills in a discipline (dogfighting = air, strafing = ground),
   * Elite Ace at 50 in either (core p116).
   * @param {{air: number, ground: number}} kills
   * @returns {object}
   */
  static aceStatus(kills) {
    const next = n => (n < 10) ? { target: 10, remaining: 10 - n, elite: false } : (n < 50) ? { target: 50, remaining: 50 - n, elite: true } : null;
    return {
      dogfighting: kills.air >= 10,
      strafing: kills.ground >= 10,
      elite: (kills.air >= 50) || (kills.ground >= 50),
      next: { air: next(kills.air), ground: next(kills.ground) }
    };
  }

  /**
   * The milestones a new tally reaches that the old one had not.
   * @param {{air: number, ground: number}} before
   * @param {{air: number, ground: number}} after
   * @returns {string[]}   Localisation keys of the milestones reached.
   */
  static milestonesReached(before, after) {
    const a = PilotModel.aceStatus(before), b = PilotModel.aceStatus(after);
    const reached = [];
    if ( !a.elite && b.elite ) reached.push("WARBIRDS.Pilot.eliteAce");
    if ( !a.dogfighting && b.dogfighting ) reached.push("WARBIRDS.Pilot.dogfightingAce");
    if ( !a.strafing && b.strafing ) reached.push("WARBIRDS.Pilot.strafingAce");
    return reached;
  }

  /** @inheritDoc */
  modifyRollData(rollData) {
    super.modifyRollData(rollData);
    rollData.flight = Object.fromEntries(Object.entries(this.flightSkills).map(([k, v]) => [k, v.level]));
    rollData.reserve = this.reserve.value;
    rollData.standing = this.standingInfo.value;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _preCreate(data, options, user) {
    const allowed = await super._preCreate(data, options, user);
    if ( allowed === false ) return false;
    // Give new pilots the standard skill list so the sheet has rows to fill in.
    if ( foundry.utils.isEmpty(data.system?.skills) ) {
      this.updateSource({ skills: defaultSkills() });
    }
  }

  /** @inheritDoc */
  static get trackableAttributes() {
    return {
      bar: ["health", "reserve"],
      value: ["wounds", "sa", "defence.value", "resist.value", "rank.value", "fame.value", "fame.points", "statPoints", "kills.air", "kills.ground"]
    };
  }
}
