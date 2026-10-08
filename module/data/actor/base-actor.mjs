/**
 * Shared behaviour for every Warbirds actor type.
 */
export default class BaseActorModel extends foundry.abstract.TypeDataModel {

  /** The Actor document this data belongs to. */
  get actor() {
    return this.parent;
  }

  /**
   * Items of a given type embedded on the parent actor.
   * @param {string} type
   * @returns {Item[]}
   */
  itemsOfType(type) {
    return this.parent?.itemTypes?.[type] ?? [];
  }

  /**
   * Extra data merged into Actor#getRollData().
   * Subclasses add shortcuts such as `@sa` or `@initiative`.
   * @param {object} rollData
   */
  modifyRollData(rollData) {}

  /**
   * The attribute paths offered in the token-bar dropdowns for this type.
   * @type {{bar: string[], value: string[]}}
   */
  static get trackableAttributes() {
    return { bar: [], value: [] };
  }
}
