import BaseItemModel from "./base-item.mjs";
import { integer, text, choice } from "../fields.mjs";
import { WARBIRDS } from "../../config.mjs";
import { signed } from "../../utils.mjs";

const fields = foundry.data.fields;

/**
 * A weapon: aircraft guns, heavy ordinance, missiles, turret guns, or personal weapons.
 * Stats follow the core book (p69, p111-112) and the Jet Age weapon list (p10-13).
 */
export default class WeaponModel extends BaseItemModel {

  static LOCALIZATION_PREFIXES = ["WARBIRDS.Item.weapon"];

  /** @inheritDoc */
  static defineSchema() {
    return {
      ...super.defineSchema(),
      category: choice(Object.keys(WARBIRDS.weaponCategories), "gun"),
      skill: choice([...Object.keys(WARBIRDS.weaponSkills), "best", ""], "", { blank: true }),   // blank = default for category; best = Gunnery or Ordinance, whichever is higher
      accuracy: integer({ min: -5, max: 5 }),
      damage: integer({ min: 0 }),                       // Lead +N
      ap: integer({ min: 0 }),
      ammo: new fields.SchemaField({
        value: integer({ min: 0, initial: 10 }),
        max: integer({ min: 0, initial: 10 }),
        tracked: new fields.BooleanField({ initial: true })
      }),
      pylons: integer({ min: 0, initial: 0 }),            // hard points occupied when mounted
      attacksPerRound: integer({ min: 1, initial: 1 }),  // light machine guns fire twice
      mounted: new fields.BooleanField({ initial: true }),
      range: text(),                                     // personal weapons only ("25 m")
      special: text(),
      // An alternative firing mode offered as a checkbox in the attack dialog (laser guidance +1, against vehicles +1...).
      altMode: new fields.SchemaField({
        label: text(),
        accuracy: integer({ min: -10, max: 10 }),
        damage: integer({ min: -10, max: 10 })
      }),
      cooldown: integer({ min: 0 }),                     // rounds to wait after firing (1 = every other round)
      recharge: choice(["", "round", "scene"], "", { blank: true }),   // capacitor weapons: +1 ammo per round not fired / refill between scenes
      lastFired: new fields.SchemaField({
        combat: new fields.StringField({ required: true, nullable: true, initial: null }),
        round: integer({ min: 0 })
      }),
      flags: new fields.SchemaField({
        bvr: new fields.BooleanField({ initial: false }),
        extendedRange: new fields.BooleanField({ initial: false }),
        longRange: new fields.BooleanField({ initial: false }),
        noHeadToHead: new fields.BooleanField({ initial: false }),
        ignoresEPM: new fields.BooleanField({ initial: false }),
        ir: new fields.BooleanField({ initial: false }),
        rippleFire: new fields.BooleanField({ initial: false }),
        highVelocity: new fields.BooleanField({ initial: false }),
        guided: new fields.BooleanField({ initial: false }),
        ignoresArmour: new fields.BooleanField({ initial: false }),
        extraDie: new fields.BooleanField({ initial: false }),       // roll an extra d6 to hit and keep the best (Meteor)
        missOnOne: new fields.BooleanField({ initial: false }),      // a natural 1 always misses (Amos, Phoenix)
        grouped: new fields.BooleanField({ initial: false }),        // one roll compared with every targeted token's Defence
        fragmentary: new fields.BooleanField({ initial: false }),    // no -2 vs people, hits everyone in the blast (core p118)
        twoLocations: new fields.BooleanField({ initial: false }),   // heavy bombs: two hit locations on a vessel
        slowTargets: new fields.BooleanField({ initial: false }),    // only Performance 0-1 targets
        antiShip: new fields.BooleanField({ initial: false }),       // only airships and naval ships
        noPersonnel: new fields.BooleanField({ initial: false })     // cannot target people
      })
    };
  }

  /* -------------------------------------------- */

  /** True for weapons carried by aircraft (as opposed to personal weapons). */
  get isAircraftWeapon() {
    return this.category !== "personal";
  }

  /** The skill actually used to fire this weapon ("best" is resolved against the firing aircraft at roll time). */
  get skillKey() {
    if ( this.skill === "best" ) return "best";
    return this.skill || WARBIRDS.weaponCategorySkill[this.category] || "gunnery";
  }

  /** Whether the weapon offers an alternative firing mode in the attack dialog. */
  get hasAltMode() {
    return !!this.altMode.label && ((this.altMode.accuracy !== 0) || (this.altMode.damage !== 0));
  }

  /**
   * Cooldown state against the active combat: the round the weapon is ready again, if it is still cooling down.
   * @returns {{active: boolean, readyRound: number|null}}
   */
  get cooling() {
    const combat = globalThis.game?.combat;
    if ( !this.cooldown || !combat?.started || (this.lastFired.combat !== combat.id) ) return { active: false, readyRound: null };
    const readyRound = this.lastFired.round + this.cooldown + 1;
    return { active: combat.round < readyRound, readyRound };
  }

  /** @inheritDoc */
  get summary() {
    const parts = [
      `${game.i18n.localize("WARBIRDS.Weapon.acc")} ${signed(this.accuracy)}`,
      `${game.i18n.localize("WARBIRDS.Weapon.lead")} +${this.damage}`,
      `${game.i18n.localize("WARBIRDS.Weapon.ap")} ${this.ap}`
    ];
    if ( this.ammo.tracked ) parts.push(`${game.i18n.localize("WARBIRDS.Weapon.ammo")} ${this.ammo.value}/${this.ammo.max}`);
    if ( this.cooldown ) parts.push(game.i18n.format("WARBIRDS.Weapon.cooldownSummary", { rounds: this.cooldown }));
    if ( this.recharge ) parts.push(game.i18n.localize(`WARBIRDS.Weapon.recharge.${this.recharge}`));
    return parts.join(" · ");
  }

  /** @inheritDoc */
  prepareDerivedData() {
    super.prepareDerivedData();
    this.skillLabel = this.skillKey === "best"
      ? game.i18n.localize("WARBIRDS.Weapon.skillBest")
      : game.i18n.localize(WARBIRDS.weaponSkills[this.skillKey] ?? "");
    this.categoryLabel = game.i18n.localize(WARBIRDS.weaponCategories[this.category] ?? "");
    this.ammo.empty = this.ammo.tracked && (this.ammo.value <= 0);
    this.flagList = Object.entries(this.flags).filter(([k, v]) => v).map(([k]) => game.i18n.localize(`WARBIRDS.WeaponFlag.${k}`));
  }
}
