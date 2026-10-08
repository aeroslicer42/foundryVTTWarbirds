import BaseItemModel from "./base-item.mjs";
import { integer, text } from "../fields.mjs";

const fields = foundry.data.fields;

/**
 * Personal equipment (core book p99-104): armour, kits, vehicles, keepsakes.
 * `armour` adds to Resist and `defence` to Defence while the item is equipped.
 */
export default class GearModel extends BaseItemModel {

  static LOCALIZATION_PREFIXES = ["WARBIRDS.Item.gear"];

  /** @inheritDoc */
  static defineSchema() {
    return {
      ...super.defineSchema(),
      value: integer({ min: 0, max: 6 }),              // cost rating compared against Fame/Rank
      quantity: integer({ min: 0, initial: 1 }),
      equipped: new fields.BooleanField({ initial: true }),
      armour: integer({ min: 0 }),                     // Resist bonus
      defence: integer({ min: 0 }),                    // Defence bonus (shields)
      uses: new fields.SchemaField({
        value: integer({ min: 0 }),
        max: integer({ min: 0 })
      }),
      notes: text()
    };
  }

  /** @inheritDoc */
  get summary() {
    const parts = [];
    if ( this.armour ) parts.push(`+${this.armour} ${game.i18n.localize("WARBIRDS.Secondary.resist")}`);
    if ( this.defence ) parts.push(`+${this.defence} ${game.i18n.localize("WARBIRDS.Secondary.defence")}`);
    if ( this.uses.max ) parts.push(`${this.uses.value}/${this.uses.max} ${game.i18n.localize("WARBIRDS.Gear.uses")}`);
    if ( this.notes ) parts.push(this.notes);
    return parts.join(" · ");
  }
}
