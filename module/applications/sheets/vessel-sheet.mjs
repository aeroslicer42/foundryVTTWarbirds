import WarbirdsActorSheet from "./base-actor-sheet.mjs";
import { systemPath } from "../../config.mjs";
import { signed } from "../../utils.mjs";
import * as rolls from "../../dice/rolls.mjs";

/**
 * The vessel sheet: airships, trains, fortifications and couriers with Threat and sub-systems.
 */
export default class VesselSheet extends WarbirdsActorSheet {

  /** @inheritDoc */
  static DEFAULT_OPTIONS = {
    classes: ["vessel"],
    position: { width: 860, height: 720 },
    window: { icon: "fa-solid fa-ship" },
    actions: {
      fireSubsystem: VesselSheet.#onFireSubsystem,
      rollHitLocation: VesselSheet.#onRollHitLocation,
      addSubsystem: VesselSheet.#onAddSubsystem
    }
  };

  static ACCEPTED_ITEM_TYPES = [];

  /** @inheritDoc */
  static TABS = {
    primary: {
      tabs: [
        { id: "main", icon: "fa-solid fa-ship" },
        { id: "notes", icon: "fa-solid fa-book" }
      ],
      initial: "main",
      labelPrefix: "WARBIRDS.Tabs"
    }
  };

  /** @inheritDoc */
  static PARTS = {
    header: { template: systemPath("templates/actor/vessel/header.hbs") },
    tabs: { template: "templates/generic/tab-navigation.hbs" },
    main: {
      template: systemPath("templates/actor/vessel/main.hbs"),
      templates: [systemPath("templates/shared/track.hbs")],
      scrollable: [""]
    },
    notes: { template: systemPath("templates/actor/vessel/notes.hbs"), scrollable: [""] }
  };

  /** @inheritDoc */
  _configureRenderParts(options) {
    const parts = super._configureRenderParts(options);
    if ( this.actor.limited ) {
      const { header, tabs, notes } = parts;
      return { header, tabs, notes };
    }
    return parts;
  }

  /** @inheritDoc */
  _prepareTabs(group) {
    const tabs = super._prepareTabs(group);
    if ( (group === "primary") && this.actor.limited ) delete tabs.main;
    return tabs;
  }

  /** @inheritDoc */
  async _preparePartContext(partId, context, options) {
    await super._preparePartContext(partId, context, options);
    const system = this.actor.system;
    const t = system.totals;
    switch ( partId ) {
      case "main":
        context.totals = t;
        context.track = this._prepareTrack(t.penalties, system.damage, "damage");
        context.subsystems = t.subsystems.map(s => ({
          ...s,
          source: system._source.subsystems[s.id],
          locationLabel: s.locations.length ? s.locations.join(", ") : "—",
          attackLabel: s.attack.enabled ? `1d6 ${signed(s.attack.bonus + s.penalty)} · ${game.i18n.localize("WARBIRDS.Weapon.lead")} +${s.attack.damage} · ${game.i18n.localize("WARBIRDS.Weapon.ap")} ${s.attack.ap}` : "",
          statusLabel: s.disabled ? game.i18n.localize("WARBIRDS.Vessel.disabled") : (s.damage ? signed(s.penalty) : "")
        }));
        context.locationTable = [1, 2, 3, 4, 5, 6].map(n => ({
          roll: n,
          names: t.subsystems.filter(s => s.locations.includes(n)).map(s => s.name)
        }));
        break;
      case "notes": {
        const enrich = async html => foundry.applications.ux.TextEditor.implementation.enrichHTML(html, {
          secrets: this.actor.isOwner, relativeTo: this.actor, rollData: this.actor.getRollData()
        });
        context.enriched = { description: await enrich(system.description), notes: await enrich(system.notes) };
        break;
      }
    }
    return context;
  }

  /* -------------------------------------------- */

  /**
   * A gun emplacement or battery fires at the targeted token.
   * @this {VesselSheet}
   */
  static #onFireSubsystem(event, target) {
    const id = target.closest("[data-record-id]")?.dataset.recordId;
    if ( id ) return rolls.fireSubsystem(this.actor, id);
  }

  /**
   * Roll a d6 for a random ordinance hit location and post it.
   * @this {VesselSheet}
   */
  static #onRollHitLocation() {
    return rolls.rollHitLocation(this.actor);
  }

  /**
   * Add a sub-system unit after the last one.
   * @this {VesselSheet}
   */
  static async #onAddSubsystem() {
    const list = this.actor.system.subsystemList;
    const sort = list.length ? Math.max(...list.map(s => s.sort)) + 1000 : 0;
    const id = foundry.utils.randomID();
    await this.actor.update({ [`system.subsystems.${id}`]: { name: game.i18n.localize("WARBIRDS.Vessel.newSubsystem"), sort } });
  }
}
