import CreatureModel, { defaultSkills } from "./creature.mjs";
import { integer, text, choice } from "../fields.mjs";
import { buildPenaltyTrack, trackState } from "../../utils.mjs";
import { WARBIRDS } from "../../config.mjs";

const fields = foundry.data.fields;

/**
 * A ground NPC (core book p158-165).
 *
 * - "thug": fixed Initiative, Defence, a flat skill bonus (1d6 +X), an attack bonus and no Health track.
 * - "threat": full stats and skills like a player character, plus explicit Initiative/Attack bonuses.
 *
 * Stat blocks in the book list Defence, Resist and Health directly, so each of those has a `base` value and an
 * `override` flag; switch the flag off to derive the number from stats and skills instead.
 *
 * Enemy aircraft are "aircraft" actors with a crew block, not NPCs.
 */
export default class NpcModel extends CreatureModel {

  static LOCALIZATION_PREFIXES = ["WARBIRDS.Actor.creature", "WARBIRDS.Actor.npc"];

  /** @inheritDoc */
  static defineSchema() {
    return {
      ...super.defineSchema(),
      mode: choice(Object.keys(WARBIRDS.npcModes), "threat"),
      role: text(),                                   // "Pirate Boarding Party Leader"
      skillBonus: integer({ min: -3 }),               // thug: every skill roll is 1d6 + this
      attack: integer({ min: -3 }),                   // "Attack 1d6 +3"
      initiative: new fields.SchemaField({
        base: integer({ min: -3 }),                   // thug: fixed total; threat: bonus to 1d6 when overriding
        override: new fields.BooleanField({ initial: false })
      }),
      defence: new fields.SchemaField({
        bonus: integer(),
        base: integer({ min: 0, initial: 4 }),
        override: new fields.BooleanField({ initial: true })
      }),
      resist: new fields.SchemaField({
        bonus: integer(),
        base: integer({ min: 0 }),
        override: new fields.BooleanField({ initial: true })
      }),
      health: new fields.SchemaField({
        bonus: integer(),
        dr: integer({ min: 0 }),
        base: integer({ min: 1, initial: 3 }),
        override: new fields.BooleanField({ initial: true })
      }),
      weapons: text()                                 // quick free-text armament ("pistol Lead +2, 6 shots")
    };
  }

  /* -------------------------------------------- */

  /** Thugs have no Health track: one hit and they are out. */
  get isThug() {
    return this.mode === "thug";
  }

  /** @inheritDoc */
  computeDerived() {
    const d = super.computeDerived();
    const s = this.stats;

    if ( this.health.override ) {
      d.healthMax = Math.max(1, this.health.base + this.health.bonus);
      d.healthValue = d.healthMax - this.wounds;
      d.track = buildPenaltyTrack(d.healthMax, this.health.dr);
      const state = trackState(this.wounds, d.healthMax, d.track);
      d.penalty = state.penalty;
      d.status = this._status(state);
      // Numbers that include the wound penalty.
      d.defence = 3 + s.body + this.skillLevel("athletics") + d.shield + this.defence.bonus + d.lotl + d.penalty;
      d.initiative = s.mind + this.skillLevel("awareness") + d.penalty;
    }
    if ( this.defence.override ) d.defence = this.defence.base + this.defence.bonus + d.lotl + d.penalty;
    if ( this.resist.override ) d.resist = this.resist.base + this.resist.bonus;
    if ( this.initiative.override ) d.initiative = this.initiative.base + d.penalty;

    if ( this.isThug ) {
      d.healthMax = 1;
      d.healthValue = this.wounds > 0 ? 0 : 1;
      d.track = [0];
      d.penalty = 0;
      d.status = this.wounds > 0 ? "out" : "fine";
      d.defence = this.defence.base + this.defence.bonus;
      d.initiative = this.initiative.base;              // thugs do not roll initiative
    }
    return d;
  }

  /** @inheritDoc */
  _applyDerived(d) {
    super._applyDerived(d);
    this.initiative.total = d.initiative;
  }

  /** @inheritDoc */
  modifyRollData(rollData) {
    super.modifyRollData(rollData);
    rollData.attack = this.attack;
    rollData.skillBonus = this.skillBonus;
  }

  /** @inheritDoc */
  async _preCreate(data, options, user) {
    const allowed = await super._preCreate(data, options, user);
    if ( allowed === false ) return false;
    if ( foundry.utils.isEmpty(data.system?.skills) ) {
      this.updateSource({ skills: defaultSkills() });
    }
  }

  /** @inheritDoc */
  static get trackableAttributes() {
    return { bar: ["health"], value: ["wounds", "defence.value", "resist.value", "attack", "initiative.total"] };
  }
}
