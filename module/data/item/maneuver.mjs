import BaseItemModel from "./base-item.mjs";
import { text, choice } from "../fields.mjs";
import { WARBIRDS } from "../../config.mjs";

const fields = foundry.data.fields;

/**
 * A manoeuvre: a defending option (Break/Escape/Shoot/Stunt), a basic or advanced stunt (core book p70-71),
 * or a Jet Age BVR tactic / altitude choice (sourcebook p6-7).
 * Manoeuvres are reference cards with a "Use" button that posts the effect to chat.
 */
export default class ManeuverModel extends BaseItemModel {

  static LOCALIZATION_PREFIXES = ["WARBIRDS.Item.maneuver"];

  /** @inheritDoc */
  static defineSchema() {
    return {
      ...super.defineSchema(),
      kind: choice(Object.keys(WARBIRDS.maneuverKinds), "stunt"),
      cost: text(),                       // "1 Reserve"
      requirement: text(),                // "Performance 3+", "needs a wingman"
      effect: text(),                     // short rules text
      onSuccess: text(),
      onFailure: text(),
      defence: new fields.StringField({ required: true, blank: true, initial: "", choices: ["", "break", "escape", "shoot", "stunt"] })
    };
  }

  /** @inheritDoc */
  get summary() {
    return this.effect;
  }

  /** @inheritDoc */
  prepareDerivedData() {
    super.prepareDerivedData();
    this.kindLabel = game.i18n.localize(WARBIRDS.maneuverKinds[this.kind] ?? "");
  }
}
