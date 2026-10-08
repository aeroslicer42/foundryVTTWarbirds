const fields = foundry.data.fields;

/**
 * Shared behaviour for every Warbirds item type.
 */
export default class BaseItemModel extends foundry.abstract.TypeDataModel {

  /** @inheritDoc */
  static defineSchema() {
    return {
      description: new fields.HTMLField(),
      source: new fields.StringField({ required: true, blank: true, initial: "" })   // book + page, for reference
    };
  }

  /** The Item document this data belongs to. */
  get item() {
    return this.parent;
  }

  /** The owning Actor, if embedded. */
  get actor() {
    return this.parent?.parent ?? null;
  }

  /**
   * A one-line summary shown on actor sheets and in chat.
   * @returns {string}
   */
  get summary() {
    return "";
  }
}
