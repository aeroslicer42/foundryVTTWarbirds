import { WARBIRDS } from "../../config.mjs";
import { recordToArray, signed } from "../../utils.mjs";
import * as rolls from "../../dice/rolls.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

/**
 * Behaviour shared by the pilot, aircraft and NPC sheets.
 */
export default class WarbirdsActorSheet extends HandlebarsApplicationMixin(ActorSheetV2) {

  /** @inheritDoc */
  static DEFAULT_OPTIONS = {
    classes: ["warbirds", "actor"],
    position: { width: 760, height: 720 },
    window: { resizable: true },
    form: { submitOnChange: true, closeOnSubmit: false },
    actions: {
      createItem: WarbirdsActorSheet.#onCreateItem,
      editItem: WarbirdsActorSheet.#onEditItem,
      deleteItem: WarbirdsActorSheet.#onDeleteItem,
      toggleItemField: WarbirdsActorSheet.#onToggleItemField,
      adjustItemField: WarbirdsActorSheet.#onAdjustItemField,
      setTrack: WarbirdsActorSheet.#onSetTrack,
      adjustField: WarbirdsActorSheet.#onAdjustField,
      toggleField: WarbirdsActorSheet.#onToggleField,
      addRecord: WarbirdsActorSheet.#onAddRecord,
      deleteRecord: WarbirdsActorSheet.#onDeleteRecord,
      openDocument: WarbirdsActorSheet.#onOpenDocument,
      unlinkDocument: WarbirdsActorSheet.#onUnlinkDocument,
      rollSkill: WarbirdsActorSheet.#onRollSkill,
      rollStat: WarbirdsActorSheet.#onRollStat,
      rollFlightSkill: WarbirdsActorSheet.#onRollFlightSkill,
      rollRating: WarbirdsActorSheet.#onRollRating,
      fireWeapon: WarbirdsActorSheet.#onFireWeapon,
      useManeuver: WarbirdsActorSheet.#onUseManeuver,
      rollNpcAttack: WarbirdsActorSheet.#onRollNpcAttack,
      rollThugSkill: WarbirdsActorSheet.#onRollThugSkill
    }
  };

  /** Item types this actor type accepts by drag and drop. Subclasses narrow this. */
  static ACCEPTED_ITEM_TYPES = ["weapon", "trait", "maneuver", "sponsorship", "gear"];

  /* -------------------------------------------- */
  /*  Context                                     */
  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    Object.assign(context, {
      actor: this.actor,
      system: this.actor.system,
      systemSource: this.actor.system._source,
      systemFields: this.actor.system.schema.fields,
      config: WARBIRDS,
      isGM: game.user.isGM,
      owner: this.actor.isOwner,
      limited: this.actor.limited,
      statusLabel: this.#statusLabel(),
      signed
    });
    return context;
  }

  /** @inheritDoc */
  async _preparePartContext(partId, context, options) {
    await super._preparePartContext(partId, context, options);
    if ( partId in (context.tabs ?? {}) ) context.tab = context.tabs[partId];
    return context;
  }

  /**
   * Localised status label for the header (Fit to Fly, Down but Not Out...).
   * @returns {string}
   */
  #statusLabel() {
    const status = this.actor.system.status;
    const table = { aircraft: WARBIRDS.aircraftStatus, vessel: WARBIRDS.vesselStatus }[this.actor.type] ?? WARBIRDS.creatureStatus;
    return table[status] ? game.i18n.localize(table[status]) : "";
  }

  /**
   * Prepare a damage track for display.
   * @param {number[]} penalties   Penalty under each box.
   * @param {number} damage        Damage taken.
   * @param {string} field         The system field that stores the damage ("wounds" or "damage").
   * @returns {{boxes: object[], overflow: number, field: string}}
   */
  _prepareTrack(penalties, damage, field) {
    penalties = Array.isArray(penalties) ? penalties : [];
    damage = Number(damage) || 0;
    const boxes = penalties.map((penalty, i) => ({
      index: i + 1,
      penalty,
      label: penalty === 0 ? "0" : String(penalty),
      filled: damage >= i + 1,
      current: damage === i + 1
    }));
    return { boxes, overflow: Math.max(0, damage - penalties.length), field, damage };
  }

  /**
   * Prepare the items of a type for a list template.
   * @param {string} type
   * @returns {object[]}
   */
  _prepareItems(type) {
    return this.actor.itemTypes[type].map(item => ({
      id: item.id,
      uuid: item.uuid,
      name: item.name,
      img: item.img,
      type: item.type,
      sort: item.sort,
      system: item.system,
      summary: item.system.summary
    })).sort((a, b) => (a.sort - b.sort) || a.name.localeCompare(b.name));
  }

  /**
   * Prepare a skills record for display, sorted by name.
   * @param {Record<string, object>} record
   * @returns {object[]}
   */
  _prepareSkills(record) {
    const stats = this.actor.system.stats;
    return recordToArray(record, (a, b) => a.name.localeCompare(b.name)).map(skill => ({
      ...skill,
      statLabel: game.i18n.localize(WARBIRDS.stats[skill.stat] ?? ""),
      total: (stats?.[skill.stat] ?? 0) + skill.level + (this.actor.system.penalty ?? 0)
    }));
  }

  /* -------------------------------------------- */
  /*  Drag & drop                                 */
  /* -------------------------------------------- */

  /** @inheritDoc */
  async _onDropItem(event, item) {
    if ( !this.actor.isOwner ) return null;
    if ( !this.constructor.ACCEPTED_ITEM_TYPES.includes(item.type) ) {
      ui.notifications.warn("WARBIRDS.Notifications.itemNotAccepted", { localize: true, format: { type: game.i18n.localize(`TYPES.Item.${item.type}`) } });
      return null;
    }
    return super._onDropItem(event, item);
  }

  /* -------------------------------------------- */
  /*  Actions                                     */
  /* -------------------------------------------- */

  /**
   * Find the embedded Item for the row that contains the clicked element.
   * @param {HTMLElement} target
   * @returns {Item|null}
   */
  _getItemFromTarget(target) {
    const id = target.closest("[data-item-id]")?.dataset.itemId;
    return id ? this.actor.items.get(id) : null;
  }

  /**
   * Create a new embedded item of the type given by `data-type`.
   * @this {WarbirdsActorSheet}
   */
  static async #onCreateItem(event, target) {
    const type = target.dataset.type;
    const cls = getDocumentClass("Item");
    const data = { name: cls.defaultName({ type, parent: this.actor }), type };
    const preset = target.dataset.preset;
    if ( preset ) data.system = foundry.utils.expandObject(JSON.parse(preset));
    await cls.create(data, { parent: this.actor, renderSheet: true });
  }

  /** @this {WarbirdsActorSheet} */
  static #onEditItem(event, target) {
    this._getItemFromTarget(target)?.sheet.render({ force: true });
  }

  /** @this {WarbirdsActorSheet} */
  static async #onDeleteItem(event, target) {
    const item = this._getItemFromTarget(target);
    if ( !item ) return;
    if ( event.shiftKey ) return item.delete();
    return item.deleteDialog();
  }

  /**
   * Flip a boolean on an embedded item (equipped, mounted, active...).
   * @this {WarbirdsActorSheet}
   */
  static async #onToggleItemField(event, target) {
    const item = this._getItemFromTarget(target);
    const field = target.dataset.field;
    if ( !item || !field ) return;
    const current = foundry.utils.getProperty(item, field);
    await item.update({ [field]: !current });
  }

  /**
   * Add `data-delta` to a numeric field on an embedded item (ammo, uses...), clamped to `data-min`/`data-max`.
   * @this {WarbirdsActorSheet}
   */
  static async #onAdjustItemField(event, target) {
    const item = this._getItemFromTarget(target);
    const field = target.dataset.field;
    if ( !item || !field ) return;
    const delta = Number(target.dataset.delta) || 0;
    let value = (Number(foundry.utils.getProperty(item, field)) || 0) + delta;
    if ( target.dataset.min !== undefined ) value = Math.max(Number(target.dataset.min), value);
    if ( target.dataset.max !== undefined ) value = Math.min(Number(foundry.utils.getProperty(item, target.dataset.max) ?? target.dataset.max), value);
    await item.update({ [field]: value });
  }

  /**
   * Click a track box: fill up to that box, or clear it when it is the last filled box.
   * @this {WarbirdsActorSheet}
   */
  static async #onSetTrack(event, target) {
    const field = target.dataset.field;
    const index = Number(target.dataset.index);
    if ( !field || !Number.isInteger(index) ) return;
    const current = Number(foundry.utils.getProperty(this.actor.system, field)) || 0;
    const value = current === index ? index - 1 : index;
    await this.actor.update({ [`system.${field}`]: Math.max(0, value) });
  }

  /**
   * Add `data-delta` to a numeric system field (reserve, wounds, ammo...).
   * @this {WarbirdsActorSheet}
   */
  static async #onAdjustField(event, target) {
    const field = target.dataset.field;
    if ( !field ) return;
    const delta = Number(target.dataset.delta) || 0;
    let value = (Number(foundry.utils.getProperty(this.actor.system, field)) || 0) + delta;
    if ( target.dataset.min !== undefined ) value = Math.max(Number(target.dataset.min), value);
    if ( target.dataset.max !== undefined ) {
      const max = Number(foundry.utils.getProperty(this.actor.system, target.dataset.max) ?? target.dataset.max);
      if ( Number.isFinite(max) ) value = Math.min(max, value);
    }
    await this.actor.update({ [`system.${field}`]: value });
  }

  /**
   * Flip a boolean system field (Life on the Line, Scandal, radar gunsight-only...).
   * @this {WarbirdsActorSheet}
   */
  static async #onToggleField(event, target) {
    const field = target.dataset.field;
    if ( !field ) return;
    const current = foundry.utils.getProperty(this.actor.system, field);
    await this.actor.update({ [`system.${field}`]: !current });
  }

  /**
   * Add an entry to a TypedObjectField record (skills, advantages).
   * @this {WarbirdsActorSheet}
   */
  static async #onAddRecord(event, target) {
    const field = target.dataset.field;
    if ( !field ) return;
    const id = foundry.utils.randomID();
    const preset = target.dataset.preset ? JSON.parse(target.dataset.preset) : {};
    await this.actor.update({ [`system.${field}.${id}`]: preset });
  }

  /**
   * Remove an entry from a TypedObjectField record.
   * @this {WarbirdsActorSheet}
   */
  static async #onDeleteRecord(event, target) {
    const field = target.dataset.field;
    const id = target.closest("[data-record-id]")?.dataset.recordId;
    if ( !field || !id ) return;
    const name = target.closest("[data-record-id]")?.dataset.recordName ?? "";
    if ( !event.shiftKey ) {
      const confirmed = await foundry.applications.api.DialogV2.confirm({
        window: { title: game.i18n.localize("WARBIRDS.Dialog.deleteRecordTitle") },
        content: `<p>${game.i18n.format("WARBIRDS.Dialog.deleteRecordContent", { name })}</p>`,
        rejectClose: false,
        modal: true
      });
      if ( !confirmed ) return;
    }
    await this.actor.update({ [`system.${field}.${id}`]: _del });
  }

  /**
   * Open the sheet of a linked document (`data-uuid`).
   * @this {WarbirdsActorSheet}
   */
  static async #onOpenDocument(event, target) {
    const uuid = target.dataset.uuid;
    if ( !uuid ) return;
    const doc = await fromUuid(uuid);
    doc?.sheet?.render({ force: true });
  }

  /**
   * Clear a DocumentUUIDField link (`data-field`).
   * @this {WarbirdsActorSheet}
   */
  static async #onUnlinkDocument(event, target) {
    const field = target.dataset.field;
    if ( !field ) return;
    await this.actor.update({ [`system.${field}`]: null });
  }

  /* -------------------------------------------- */
  /*  Rolls                                       */
  /* -------------------------------------------- */

  /** @this {WarbirdsActorSheet} */
  static #onRollSkill(event, target) {
    const id = target.dataset.skill ?? target.closest("[data-record-id]")?.dataset.recordId;
    if ( id ) return rolls.rollSkill(this.actor, id);
  }

  /** @this {WarbirdsActorSheet} */
  static #onRollStat(event, target) {
    return rolls.rollStat(this.actor, target.dataset.stat);
  }

  /** @this {WarbirdsActorSheet} */
  static #onRollFlightSkill(event, target) {
    return rolls.rollFlightSkill(this.actor, target.dataset.skill);
  }

  /** @this {WarbirdsActorSheet} */
  static #onRollRating(event, target) {
    return rolls.rollRating(this.actor, target.dataset.rating);
  }

  /** @this {WarbirdsActorSheet} */
  static #onFireWeapon(event, target) {
    const item = this._getItemFromTarget(target);
    if ( item ) return rolls.fireWeapon(this.actor, item);
  }

  /** @this {WarbirdsActorSheet} */
  static #onUseManeuver(event, target) {
    const item = this._getItemFromTarget(target);
    if ( item ) return rolls.useManeuver(this.actor, item);
  }

  /** @this {WarbirdsActorSheet} */
  static #onRollNpcAttack() {
    return rolls.rollNpcAttack(this.actor);
  }

  /** @this {WarbirdsActorSheet} */
  static #onRollThugSkill() {
    return rolls.rollThugSkill(this.actor);
  }
}
