import { systemPath, WARBIRDS } from "../../config.mjs";
import { signed } from "../../utils.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

/** Detail partial per item type. */
const DETAILS = {
  weapon: systemPath("templates/item/details/weapon.hbs"),
  trait: systemPath("templates/item/details/trait.hbs"),
  maneuver: systemPath("templates/item/details/maneuver.hbs"),
  sponsorship: systemPath("templates/item/details/sponsorship.hbs"),
  gear: systemPath("templates/item/details/gear.hbs")
};

/**
 * One sheet class for all item types; the Details tab swaps in a partial per type.
 */
export default class WarbirdsItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {

  /** @inheritDoc */
  static DEFAULT_OPTIONS = {
    classes: ["warbirds", "item"],
    position: { width: 560, height: 600 },
    window: { resizable: true },
    form: { submitOnChange: true, closeOnSubmit: false },
    actions: {
      adjustField: WarbirdsItemSheet.#onAdjustField
    }
  };

  /** @inheritDoc */
  static TABS = {
    primary: {
      tabs: [
        { id: "details", icon: "fa-solid fa-list" },
        { id: "description", icon: "fa-solid fa-align-left" }
      ],
      initial: "details",
      labelPrefix: "WARBIRDS.Tabs"
    }
  };

  /** @inheritDoc */
  static PARTS = {
    header: { template: systemPath("templates/item/header.hbs") },
    tabs: { template: "templates/generic/tab-navigation.hbs" },
    details: {
      template: systemPath("templates/item/details.hbs"),
      templates: Object.values(DETAILS),
      scrollable: [""]
    },
    description: { template: systemPath("templates/item/description.hbs"), scrollable: [""] }
  };

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    Object.assign(context, {
      item: this.item,
      actor: this.item.actor,
      system: this.item.system,
      systemSource: this.item.system._source,
      systemFields: this.item.system.schema.fields,
      config: WARBIRDS,
      isGM: game.user.isGM,
      typeLabel: game.i18n.localize(`TYPES.Item.${this.item.type}`),
      signed
    });
    return context;
  }

  /** @inheritDoc */
  async _preparePartContext(partId, context, options) {
    await super._preparePartContext(partId, context, options);
    if ( partId in (context.tabs ?? {}) ) context.tab = context.tabs[partId];
    switch ( partId ) {
      case "details":
        context.detailsPartial = DETAILS[this.item.type] ?? null;
        if ( this.item.type === "trait" ) {
          context.modifierFields = WARBIRDS.traitModifiers.map(key => ({
            key,
            label: game.i18n.localize(`WARBIRDS.TraitModifier.${key}`),
            value: this.item.system._source.modifiers[key]
          }));
        }
        if ( this.item.type === "weapon" ) {
          context.flagFields = Object.keys(this.item.system.flags).map(key => ({
            key, label: game.i18n.localize(`WARBIRDS.WeaponFlag.${key}`), value: this.item.system.flags[key]
          }));
        }
        break;
      case "description":
        context.enrichedDescription = await foundry.applications.ux.TextEditor.implementation.enrichHTML(this.item.system.description, {
          secrets: this.item.isOwner, relativeTo: this.item, rollData: this.item.getRollData()
        });
        break;
    }
    return context;
  }

  /**
   * Add `data-delta` to a numeric system field (ammo counters on the item itself).
   * @this {WarbirdsItemSheet}
   */
  static async #onAdjustField(event, target) {
    const field = target.dataset.field;
    if ( !field ) return;
    const delta = Number(target.dataset.delta) || 0;
    let value = (Number(foundry.utils.getProperty(this.item.system, field)) || 0) + delta;
    if ( target.dataset.min !== undefined ) value = Math.max(Number(target.dataset.min), value);
    await this.item.update({ [`system.${field}`]: value });
  }
}
