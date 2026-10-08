import BaseItemModel from "./base-item.mjs";
import { integer, text, choice } from "../fields.mjs";
import { WARBIRDS } from "../../config.mjs";
import { signed } from "../../utils.mjs";

const fields = foundry.data.fields;

/**
 * A warbird trait (core book p116-123, Jet Age p4 and the per-aircraft lists).
 * Structured modifiers feed the aircraft's derived ratings automatically; conditional effects
 * ("+2 Armour when strafing") are flagged `situational` so they are displayed but not summed.
 */
export default class TraitModel extends BaseItemModel {

  static LOCALIZATION_PREFIXES = ["WARBIRDS.Item.trait"];

  /** @inheritDoc */
  static defineSchema() {
    const modifiers = {};
    for ( const key of WARBIRDS.traitModifiers ) modifiers[key] = integer();
    return {
      ...super.defineSchema(),
      category: choice(Object.keys(WARBIRDS.traitCategories), "general"),
      restriction: choice(Object.keys(WARBIRDS.traitRestrictions), "none"),
      conflicts: text(),
      timesTaken: integer({ min: 1, initial: 1 }),
      active: new fields.BooleanField({ initial: true }),
      situational: new fields.BooleanField({ initial: false }),
      effect: text(),                                   // one-line rules text shown on the aircraft sheet
      modifiers: new fields.SchemaField(modifiers),
      grants: new fields.SchemaField({
        bvr: new fields.BooleanField({ initial: false }),
        helicopter: new fields.BooleanField({ initial: false }),  // rotary-wing rules: extra Strafing die, Body + Athletics bail-out
        strafingDie: new fields.BooleanField({ initial: false })  // just the extra Strafing die (keep the best)
      })
    };
  }

  /** @inheritDoc */
  get summary() {
    if ( this.effect ) return this.effect;
    return this.modifierList.join(", ");
  }

  /** Human-readable list of the non-zero modifiers, e.g. ["+1 Performance", "-1 Escape Defence"]. */
  get modifierList() {
    const list = [];
    for ( const [key, value] of Object.entries(this.modifiers) ) {
      if ( !value ) continue;
      list.push(`${signed(value * Math.max(1, this.timesTaken))} ${game.i18n.localize(`WARBIRDS.TraitModifier.${key}`)}`);
    }
    if ( this.grants.bvr ) list.push(game.i18n.localize("WARBIRDS.TraitModifier.bvr"));
    if ( this.grants.helicopter ) list.push(game.i18n.localize("WARBIRDS.TraitModifier.helicopter"));
    else if ( this.grants.strafingDie ) list.push(game.i18n.localize("WARBIRDS.TraitModifier.strafingDie"));
    return list;
  }

  /** @inheritDoc */
  prepareDerivedData() {
    super.prepareDerivedData();
    this.categoryLabel = game.i18n.localize(WARBIRDS.traitCategories[this.category] ?? "");
    this.restrictionLabel = game.i18n.localize(WARBIRDS.traitRestrictions[this.restriction] ?? "");
  }
}
