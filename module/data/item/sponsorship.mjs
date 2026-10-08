import BaseItemModel from "./base-item.mjs";
import { integer, text, choice } from "../fields.mjs";
import { WARBIRDS } from "../../config.mjs";

/**
 * A sponsorship deal or a Guild contract (core book p153-157).
 * Both pay Fame Points (1-3) and carry obligations; contracts also have a risk and duration.
 * In Rank mode these simply record missions, promotions and commendations.
 */
export default class SponsorshipModel extends BaseItemModel {

  static LOCALIZATION_PREFIXES = ["WARBIRDS.Item.sponsorship"];

  /** @inheritDoc */
  static defineSchema() {
    return {
      ...super.defineSchema(),
      kind: choice(Object.keys(WARBIRDS.sponsorshipKinds), "sponsor"),
      status: choice(Object.keys(WARBIRDS.sponsorshipStatus), "active"),
      fp: integer({ min: 0, max: 9, initial: 1 }),
      employer: text(),
      risk: text(),
      duration: text(),
      obligations: text()
    };
  }

  /** @inheritDoc */
  get summary() {
    const fp = `${this.fp} ${game.i18n.localize("WARBIRDS.Standing.fp")}`;
    return [this.employer, fp, this.duration].filter(p => p).join(" · ");
  }

  /** @inheritDoc */
  prepareDerivedData() {
    super.prepareDerivedData();
    this.kindLabel = game.i18n.localize(WARBIRDS.sponsorshipKinds[this.kind] ?? "");
    this.statusLabel = game.i18n.localize(WARBIRDS.sponsorshipStatus[this.status] ?? "");
    this.isActive = this.status === "active";
  }
}
