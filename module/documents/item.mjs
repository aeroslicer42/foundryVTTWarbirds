import { WARBIRDS } from "../config.mjs";

/**
 * The Item document class for every Warbirds item type.
 */
export default class WarbirdsItem extends Item {

  /** @inheritDoc */
  async _preCreate(data, options, user) {
    const allowed = await super._preCreate(data, options, user);
    if ( allowed === false ) return false;
    if ( !data.img ) this.updateSource({ img: WARBIRDS.defaultIcons.Item[this.type] ?? this.constructor.DEFAULT_ICON });
  }

  /**
   * Roll data for formulas on this item: the owner's data plus `@item`.
   * @inheritDoc
   */
  getRollData() {
    const data = this.actor?.getRollData() ?? {};
    data.item = { ...this.system, name: this.name };
    return data;
  }
}
